import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { createHash, randomBytes } from 'node:crypto';
import { getDb } from './adminApp.js';
import { loadProtectedRepairServiceCatalog } from './repairServiceCatalogOps.js';
import { loadCustomerType, pickRepairSalePrice, roundRepairMoney } from './repairSalePrice.js';
import { buildWarrantySettlementTotals } from './repairWarrantyAccountingPolicy.js';

const db = getDb();

type Actor = {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
  branchIds: string[];
};

type Operation =
  | 'prepare'
  | 'resolve_approval'
  | 'request_credit'
  | 'collect'
  | 'reverse_payment'
  | 'deliver'
  | 'request_customer_approval';

type PaymentMethod = 'cash' | 'card' | 'bank_transfer';
type DiscountType = 'none' | 'amount' | 'percent';

const WARRANTY_SETTLEMENT = 'warranty' as const;

const isManufacturerWarrantyJob = (job: Record<string, unknown>): boolean => {
  if (String(job.warrantyScope || '') === 'manufacturer') return true;
  const products = Array.isArray(job.jobProducts) ? job.jobProducts as Array<Record<string, unknown>> : [];
  return products.some((row) => Boolean(row.inWarranty));
};

const isWarrantySettlement = (row: Record<string, unknown> | null | undefined): boolean =>
  Boolean(row && String(row.settlementType || '') === WARRANTY_SETTLEMENT);

const roundMoney = (value: unknown): number => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
};

const sumPartsActualCost = (rows: unknown): number => roundMoney(
  (Array.isArray(rows) ? rows : []).reduce((sum, raw) => {
    const row = raw as Record<string, unknown>;
    const totalSnapshot = Number(row.totalCostSnapshot);
    if (Number.isFinite(totalSnapshot) && totalSnapshot >= 0) return sum + totalSnapshot;
    return sum + roundMoney(row.quantity) * roundMoney(row.unitCostSnapshot);
  }, 0),
);

const requireAuth = (request: CallableRequest): string => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  return uid;
};

const loadActor = async (uid: string): Promise<Actor> => {
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as Record<string, unknown>;
  if (user.isActive === false) throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  const tenantId = String(user.tenantId || '').trim();
  if (!tenantId) throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');
  let permissions: Record<string, boolean> = {};
  const roleId = String(user.roleId || '').trim();
  if (roleId) {
    const roleSnap = await db.collection('roles').doc(roleId).get();
    const role = roleSnap.data() as Record<string, unknown> | undefined;
    if (!roleSnap.exists || String(role?.tenantId || '').trim() !== tenantId) {
      throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
    }
    permissions = (role?.permissions || {}) as Record<string, boolean>;
  }
  const branchIds = Array.from(new Set([
    ...(Array.isArray(user.repairBranchIds) ? user.repairBranchIds : []),
    user.repairBranchId,
  ].map((id) => String(id || '').trim()).filter(Boolean)));
  return {
    uid,
    tenantId,
    displayName: String(user.displayName || user.name || user.email || uid),
    permissions,
    isSuperAdmin: user.isSuperAdmin === true,
    branchIds,
  };
};

const hasPermission = (actor: Actor, ...keys: string[]) =>
  actor.isSuperAdmin || keys.some((key) => actor.permissions[key] === true);

const requirePermission = (actor: Actor, keys: string[], message: string) => {
  if (!hasPermission(actor, ...keys)) throw new HttpsError('permission-denied', message);
};

const loadScopedJob = async (actor: Actor, jobId: string) => {
  const jobRef = db.collection('repair_jobs').doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
  const job = jobSnap.data() as Record<string, unknown>;
  if (String(job.tenantId || '').trim() !== actor.tenantId) {
    throw new HttpsError('permission-denied', 'الطلب خارج شركتك.');
  }
  const branchId = String(job.branchId || '').trim();
  const branchRef = db.collection('repair_branches').doc(branchId);
  const branchSnap = await branchRef.get();
  if (!branchSnap.exists) throw new HttpsError('failed-precondition', 'فرع الصيانة غير موجود.');
  const branch = branchSnap.data() as Record<string, unknown>;
  if (String(branch.tenantId || '').trim() !== actor.tenantId) {
    throw new HttpsError('permission-denied', 'الفرع خارج شركتك.');
  }
  if (
    !actor.isSuperAdmin
    && actor.permissions['repair.branches.manage'] !== true
    && actor.permissions['repair.callCenter.viewAll'] !== true
    && !actor.branchIds.includes(branchId)
  ) throw new HttpsError('permission-denied', 'هذا الفرع خارج نطاق صلاحياتك.');
  return { jobRef, job, branchRef, branch, branchId };
};

const discountTotals = (grossInput: unknown, typeInput: unknown, valueInput: unknown) => {
  const grossAmount = roundMoney(grossInput);
  const type: DiscountType = typeInput === 'amount' || typeInput === 'percent' ? typeInput : 'none';
  const value = roundMoney(valueInput);
  if (type === 'percent' && value > 100) {
    throw new HttpsError('invalid-argument', 'نسبة الخصم يجب ألا تتجاوز 100%.');
  }
  const discountAmount = type === 'percent'
    ? roundMoney(grossAmount * value / 100)
    : type === 'amount' ? value : 0;
  if (discountAmount > grossAmount) {
    throw new HttpsError('invalid-argument', 'الخصم لا يمكن أن يتجاوز إجمالي الطلب.');
  }
  return { grossAmount, discountType: type, discountValue: value, discountAmount, netAmount: roundMoney(grossAmount - discountAmount) };
};

const computeBreakdown = async (tenantId: string, job: Record<string, unknown>) => {
  const protectedCatalog = await loadProtectedRepairServiceCatalog(tenantId);
  const catalog = protectedCatalog.services.filter((row) => row.enabled !== false);
  const serviceById = new Map(catalog.map((row) => [row.id, row]));
  const products = Array.isArray(job.jobProducts) ? job.jobProducts as Array<Record<string, unknown>> : [];
  const serviceQty = new Map<string, number>();
  for (const product of products) {
    const quantity = Math.max(1, Math.round(Number(product.quantity || 1)));
    const serviceIds = Array.isArray(product.serviceIds) ? product.serviceIds.map(String) : [];
    for (const id of serviceIds) {
      if (!serviceById.has(id)) {
        throw new HttpsError('failed-precondition', `الخدمة ${id} غير موجودة أو غير مفعلة في كتالوج الأسعار.`);
      }
      serviceQty.set(id, (serviceQty.get(id) || 0) + quantity);
    }
  }
  const serviceLines = Array.from(serviceQty.entries()).map(([id, quantity]) => {
    const service = serviceById.get(id)!;
    return {
      id,
      name: service.name,
      quantity,
      unitPrice: roundMoney(service.price),
      unitInternalCost: roundMoney(service.internalCost),
      internalCostTotal: roundMoney(quantity * service.internalCost),
      lineTotal: roundMoney(quantity * service.price),
    };
  });
  let serviceGross = roundMoney(serviceLines.reduce((sum, row) => sum + row.lineTotal, 0));

  const usages = Array.isArray(job.partsUsed) ? job.partsUsed as Array<Record<string, unknown>> : [];
  const unlinkedUsage = usages.find((row) => Number(row.quantity || 0) > 0 && !String(row.materialId || '').trim());
  if (unlinkedUsage) {
    throw new HttpsError(
      'failed-precondition',
      `اربط قطعة «${String(unlinkedUsage.partName || 'غير معروفة')}» بجدول المواد قبل التسعير.`,
    );
  }
  const materialIds = Array.from(new Set(usages.map((row) => String(row.materialId || '').trim()).filter(Boolean)));
  const materialSnaps = materialIds.length > 0
    ? await db.getAll(...materialIds.map((id) => db.collection('materials').doc(id)))
    : [];
  const customerType = await loadCustomerType(db, tenantId, String(job.customerId || ''));
  const materialPrices = new Map(materialSnaps.map((snap) => {
    const data = snap.data() as Record<string, unknown> | undefined;
    const valid = String(data?.tenantId || '') === tenantId && data?.isActive !== false;
    if (!valid) return [snap.id, -1] as const;
    const sale = pickRepairSalePrice({
      customerType,
      consumerSalePrice: data?.defaultSalePrice,
      traderSalePrice: data?.traderSalePrice,
    });
    return [snap.id, roundRepairMoney(sale)] as const;
  }));
  const partByMaterial = new Map<string, { id: string; name: string; quantity: number; unitPrice: number }>();
  for (const usage of usages) {
    const qty = Math.max(0, Number(usage.quantity || 0));
    const materialId = String(usage.materialId || '').trim();
    const unitPrice = materialPrices.get(materialId);
    if (unitPrice === undefined || unitPrice < 0) {
      throw new HttpsError('failed-precondition', 'قطعة غيار مرتبطة غير موجودة أو خارج الشركة.');
    }
    const previous = partByMaterial.get(materialId);
    partByMaterial.set(materialId, {
      id: materialId,
      name: String(usage.partName || previous?.name || materialId),
      quantity: roundMoney((previous?.quantity || 0) + qty),
      unitPrice,
    });
  }
  const partLines = Array.from(partByMaterial.values()).map((row) => ({
    ...row,
    lineTotal: roundMoney(row.quantity * row.unitPrice),
  }));
  const partsGross = roundMoney(partLines.reduce((sum, row) => sum + row.lineTotal, 0));
  const fallbackGross = roundMoney(job.finalCostOverride ?? job.finalCost);
  if (serviceGross + partsGross <= 0 && fallbackGross > 0) {
    serviceGross = fallbackGross;
    serviceLines.push({ id: 'legacy-service', name: 'خدمة صيانة', quantity: 1, unitPrice: fallbackGross, unitInternalCost: 0, internalCostTotal: 0, lineTotal: fallbackGross });
  }
  const warrantyServiceInternalCost = roundMoney(
    serviceLines.reduce((sum, row) => sum + roundMoney(row.internalCostTotal), 0),
  );
  const warrantyPartsActualCost = sumPartsActualCost(usages);
  return {
    catalogRevision: protectedCatalog.revision,
    serviceLines,
    partLines,
    serviceGross: roundMoney(serviceGross),
    partsGross,
    grossAmount: roundMoney(serviceGross + partsGross),
    warrantyServiceInternalCost,
    warrantyPartsActualCost,
    warrantyActualCost: roundMoney(warrantyServiceInternalCost + warrantyPartsActualCost),
  };
};

const paymentStatus = (net: number, paid: number): 'unpaid' | 'partial' | 'paid' => {
  if (net <= 0 || paid >= net - 0.001) return 'paid';
  return paid > 0 ? 'partial' : 'unpaid';
};

const accountSeeds = (tenantId: string, configured?: Record<string, unknown>) => ({
  CASH: { code: String(configured?.cash || ''), name: 'نقدية الصيانة', type: 'asset' },
  CARD: { code: String(configured?.card || ''), name: 'تسويات بطاقات الصيانة', type: 'asset' },
  BANK: { code: String(configured?.bankTransfer || ''), name: 'تحويلات بنكية للصيانة', type: 'asset' },
  CUSTOMER_DEPOSITS: { code: String(configured?.customerDeposits || ''), name: 'دفعات مقدمة من عملاء الصيانة', type: 'liability' },
  RECEIVABLES: { code: String(configured?.receivables || ''), name: 'ذمم عملاء الصيانة', type: 'asset' },
  SERVICE_REVENUE: { code: String(configured?.serviceRevenue || ''), name: 'إيراد خدمات الصيانة', type: 'revenue' },
  PARTS_REVENUE: { code: String(configured?.partsRevenue || ''), name: 'إيراد قطع غيار الصيانة', type: 'revenue' },
  DISCOUNTS: { code: String(configured?.discounts || ''), name: 'خصومات الصيانة', type: 'contra_revenue' },
  WARRANTY_ALLOWANCES: { code: String(configured?.warrantyAllowances || ''), name: 'مسموحات ضمان الصيانة', type: 'contra_revenue' },
  PARTS_INVENTORY: { code: String(configured?.partsInventory || ''), name: 'مخزون قطع غيار الصيانة', type: 'asset' },
  PARTS_COGS: { code: String(configured?.partsCogs || ''), name: 'تكلفة قطع الغيار المباعة', type: 'expense' },
  tenantId,
});

const requireAccountingMap = (value: unknown): Record<string, unknown> => {
  const map = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const keys = ['cash', 'card', 'bankTransfer', 'customerDeposits', 'receivables', 'serviceRevenue', 'partsRevenue', 'discounts', 'warrantyAllowances', 'partsInventory', 'partsCogs'];
  if (keys.some((key) => !String(map[key] || '').trim())) {
    throw new HttpsError('failed-precondition', 'أكمل ربط حسابات فرع الصيانة قبل تنفيذ العملية.');
  }
  return map;
};

const repairAccountTypes: Record<string, string> = {
  cash: 'asset',
  card: 'asset',
  bankTransfer: 'asset',
  customerDeposits: 'liability',
  receivables: 'asset',
  serviceRevenue: 'revenue',
  partsRevenue: 'revenue',
  discounts: 'contra_revenue',
  warrantyAllowances: 'contra_revenue',
  partsInventory: 'asset',
  partsCogs: 'expense',
};

const assertAccountingMapReady = async (
  tenantId: string,
  value: unknown,
): Promise<Record<string, unknown>> => {
  const map = requireAccountingMap(value);
  const keys = ['cash', 'card', 'bankTransfer', 'customerDeposits', 'receivables', 'serviceRevenue', 'partsRevenue', 'discounts', 'warrantyAllowances', 'partsInventory', 'partsCogs'];
  const snapshots = await db.getAll(
    ...keys.map((key) => db.collection('accounting_accounts').doc(`${tenantId}__${String(map[key] || '').trim()}`)),
  );
  const invalidKey = keys.find((key, index) => {
    const snap = snapshots[index];
    const account = snap.data() as Record<string, unknown> | undefined;
    return !snap.exists
      || String(account?.tenantId || '') !== tenantId
      || account?.isActive === false
      || account?.allowPosting === false
      || account?.type !== repairAccountTypes[key];
  });
  if (invalidKey) {
    throw new HttpsError(
      'failed-precondition',
      `حسابات فرع الصيانة غير مكتملة (حقل: ${invalidKey}). من الحسابات ← إعدادات الحسابات: اختر مركز التكلفة ثم «حفظ الربط بالحسابات الافتراضية».`,
    );
  }
  return map;
};

const ensureWarrantyAllowanceMapping = async (
  actor: Actor,
  branchRef: FirebaseFirestore.DocumentReference,
  configured: unknown,
): Promise<Record<string, unknown>> => {
  const map = configured && typeof configured === 'object' ? configured as Record<string, unknown> : {};
  if (String(map.warrantyAllowances || '').trim()) return map;
  const code = '419003';
  const at = new Date().toISOString();
  const accountRef = db.collection('accounting_accounts').doc(`${actor.tenantId}__${code}`);
  await Promise.all([
    accountRef.set({
      tenantId: actor.tenantId, code, name: 'مسموحات ضمان الصيانة', type: 'contra_revenue',
      parentCode: '4000', level: 3, allowPosting: true, isActive: true, systemSeed: true,
      createdAt: at, createdBy: actor.uid, updatedAt: at, updatedBy: actor.uid,
    }, { merge: true }),
    branchRef.set({ accountingAccounts: { ...map, warrantyAllowances: code }, updatedAt: at }, { merge: true }),
  ]);
  return { ...map, warrantyAllowances: code };
};

/**
 * Always prefer the live branch accounting map over snapshots frozen on
 * repair_job_financials / payment authorizations (those can be stale after
 * the branch link is fixed).
 */
const loadLiveBranchAccounting = async (actor: Actor, branchId: string) => {
  const branchRef = db.collection('repair_branches').doc(branchId);
  const branchSnap = await branchRef.get();
  if (!branchSnap.exists || String(branchSnap.data()?.tenantId || '') !== actor.tenantId) {
    throw new HttpsError('failed-precondition', 'فرع الصيانة غير موجود.');
  }
  const costCenterId = String(branchSnap.data()?.costCenterId || '').trim();
  if (!costCenterId) {
    throw new HttpsError(
      'failed-precondition',
      'اربط الفرع بمركز تكلفة من الحسابات ← إعدادات الحسابات ثم احفظ الربط.',
    );
  }
  const branchAccounting = await ensureWarrantyAllowanceMapping(actor, branchRef, branchSnap.data()?.accountingAccounts);
  const accountingAccounts = await assertAccountingMapReady(actor.tenantId, branchAccounting);
  return { branchRef, costCenterId, accountingAccounts };
};

const sanitizeJobTechnicalData = (job: Record<string, unknown>) => {
  const jobProducts = (Array.isArray(job.jobProducts) ? job.jobProducts : []).map((raw) => {
    const row = { ...(raw as Record<string, unknown>) };
    delete row.estimatedCost;
    delete row.finalCost;
    return row;
  });
  const partsUsed = (Array.isArray(job.partsUsed) ? job.partsUsed : []).map((raw) => {
    const row = { ...(raw as Record<string, unknown>) };
    delete row.unitCost;
    return row;
  });
  return { jobProducts, partsUsed };
};

async function prepareAuthorization(actor: Actor, data: Record<string, unknown>) {
  const jobId = String(data.jobId || '').trim();
  const scoped = await loadScopedJob(actor, jobId);
  const status = String(scoped.job.status || '');
  const allowedStatuses = new Set(['estimate_ready', 'waiting_approval', 'ready']);
  if (!allowedStatuses.has(status)) {
    throw new HttpsError(
      'failed-precondition',
      'يُجهز إذن الدفع بعد اكتمال التقدير الفني، ولا يُحصّل إلا بعد الجاهزية الفنية.',
    );
  }
  // Reception may prepare estimate authorizations for customer approval;
  // collect/discount roles cover ready-for-payment authorizations.
  const estimatePhase = status === 'estimate_ready' || status === 'waiting_approval';
  requirePermission(
    actor,
    estimatePhase
      ? ['repair.jobs.reception', 'repair.payments.collect', 'repair.discounts.request']
      : ['repair.payments.collect', 'repair.discounts.request'],
    'ليس لديك صلاحية تجهيز إذن الدفع.',
  );
  const costCenterId = String(scoped.branch.costCenterId || '').trim();
  if (!costCenterId) throw new HttpsError('failed-precondition', 'اربط الفرع بمركز تكلفة قبل تجهيز إذن الدفع.');
  const branchAccounting = await ensureWarrantyAllowanceMapping(actor, scoped.branchRef, scoped.branch.accountingAccounts);
  const accountingAccounts = await assertAccountingMapReady(actor.tenantId, branchAccounting);
  const costCenterSnap = await db.collection('cost_centers').doc(costCenterId).get();
  if (!costCenterSnap.exists || String(costCenterSnap.data()?.tenantId || '') !== actor.tenantId || costCenterSnap.data()?.isActive === false) {
    throw new HttpsError('failed-precondition', 'مركز تكلفة الفرع غير صالح أو غير نشط.');
  }
  const warrantyJob = isManufacturerWarrantyJob(scoped.job);
  const discountRequested = String(data.discountType || 'none') !== 'none'
    && roundMoney(data.discountValue) > 0;
  if (warrantyJob && discountRequested) {
    throw new HttpsError(
      'failed-precondition',
      'طلب ضمان المصنّع يحصل على إعفاء ضمان كامل تلقائيًا. لا يُطبَّق خصم يدوي إضافي.',
    );
  }
  const breakdown = await computeBreakdown(actor.tenantId, scoped.job);
  if (!warrantyJob && breakdown.grossAmount <= 0) {
    throw new HttpsError(
      'failed-precondition',
      'لا يمكن إنشاء إذن دفع بقيمة صفر. اختر خدمة صيانة مسعّرة أو قطعة غيار أولًا ثم أعد تجهيز الإذن.',
    );
  }
  const totals = warrantyJob
    ? buildWarrantySettlementTotals(breakdown.grossAmount)
    : discountTotals(breakdown.grossAmount, data.discountType, data.discountValue);
  const finRef = db.collection('repair_job_financials').doc(jobId);
  const at = new Date().toISOString();
  const result = await db.runTransaction(async (tx) => {
    const [jobSnap, finSnap] = await Promise.all([tx.get(scoped.jobRef), tx.get(finRef)]);
    if (!jobSnap.exists) throw new HttpsError('not-found', 'طلب الصيانة غير موجود.');
    if (!allowedStatuses.has(String(jobSnap.data()?.status || ''))) {
      throw new HttpsError('failed-precondition', 'تغيرت حالة الطلب ولم يعد جاهزًا لإصدار إذن دفع.');
    }
    const liveJob = jobSnap.data() as Record<string, unknown>;
    if (warrantyJob !== isManufacturerWarrantyJob(liveJob)) {
      throw new HttpsError('failed-precondition', 'تغيّر وضع الضمان على الطلب. أعد تجهيز الإذن.');
    }
    const currentFin = (finSnap.data() || {}) as Record<string, unknown>;
    if (roundMoney(currentFin.paidAmount) > 0) {
      throw new HttpsError('failed-precondition', 'لا يمكن إصدار تقدير جديد بعد تسجيل دفعة؛ اعكس الدفعات أولًا.');
    }
    const revision = Math.max(0, Number(currentFin.authorizationRevision || 0)) + 1;
    const authorizationId = `${jobId}__r${revision}`;
    const authRef = db.collection('repair_payment_authorizations').doc(authorizationId);
    const previousAuthorizationId = String(currentFin.currentAuthorizationId || '');
    const previousAuthRef = previousAuthorizationId
      ? db.collection('repair_payment_authorizations').doc(previousAuthorizationId)
      : null;
    const [authSnap, previousAuthSnap] = await Promise.all([
      tx.get(authRef),
      previousAuthRef ? tx.get(previousAuthRef) : Promise.resolve(null),
    ]);
    if (authSnap.exists) return { authorizationId, authorizationNo: String(authSnap.data()?.authorizationNo || '') };
    const receiptNo = String(scoped.job.receiptNo || jobId);
    const needsApproval = !warrantyJob && totals.discountAmount > 0;
    const authorizationNo = warrantyJob
      ? `WAR-${receiptNo}-R${revision}`
      : `PAY-${receiptNo}-R${revision}`;
    const settlementType = warrantyJob ? WARRANTY_SETTLEMENT : 'standard';
    const base = {
      tenantId: actor.tenantId,
      branchId: scoped.branchId,
      jobId,
      receiptNo,
      serviceGross: breakdown.serviceGross,
      partsGross: breakdown.partsGross,
      ...totals,
      serviceLines: breakdown.serviceLines,
      partLines: breakdown.partLines,
      warrantyServiceInternalCost: warrantyJob ? breakdown.warrantyServiceInternalCost : 0,
      warrantyPartsActualCost: warrantyJob ? breakdown.warrantyPartsActualCost : 0,
      warrantyActualCost: warrantyJob ? breakdown.warrantyActualCost : 0,
      serviceCatalogRevision: breakdown.catalogRevision,
      taxRate: 0,
      taxAmount: 0,
      paidAmount: 0,
      balanceDue: totals.netAmount,
      paymentStatus: totals.netAmount <= 0 ? 'paid' : 'unpaid',
      settlementType,
      costCenterId,
      accountingAccounts,
      updatedAt: at,
    };
    tx.set(finRef, {
      ...base,
      authorizationRevision: revision,
      currentAuthorizationId: authorizationId,
      migrationEvidence: 'native',
      createdAt: String(currentFin.createdAt || at),
    }, { merge: true });
    tx.create(authRef, {
      ...base,
      authorizationNo,
      revision,
      status: needsApproval ? 'pending_approval' : (totals.netAmount <= 0 ? 'paid' : 'approved'),
      discountApprovalStatus: needsApproval ? 'pending' : 'approved',
      createdBy: actor.uid,
      createdByName: actor.displayName,
      createdAt: at,
    });
    if (previousAuthRef && previousAuthSnap?.exists) {
      tx.update(previousAuthRef, {
        status: 'void',
        voidReason: 'superseded_by_revision',
        supersededByAuthorizationId: authorizationId,
        updatedAt: at,
      });
    }
    if (needsApproval) {
      const approvalRef = db.collection('repair_financial_approvals').doc(`${authorizationId}__discount`);
      tx.create(approvalRef, {
        tenantId: actor.tenantId,
        branchId: scoped.branchId,
        jobId,
        authorizationId,
        type: 'discount',
        status: 'pending',
        requestedAmount: totals.discountAmount,
        reason: String(data.reason || '').trim() || 'طلب خصم على إذن دفع الصيانة',
        requestedBy: actor.uid,
        requestedByName: actor.displayName,
        requestedAt: at,
      });
    }
    const technical = sanitizeJobTechnicalData(scoped.job);
    tx.update(scoped.jobRef, {
      ...technical,
      warrantyScope: warrantyJob ? 'manufacturer' : (String(liveJob.warrantyScope || '') || 'none'),
      estimatedCost: FieldValue.delete(),
      finalCostOverride: FieldValue.delete(),
      finalCost: FieldValue.delete(),
      paidAmount: FieldValue.delete(),
      balanceDue: FieldValue.delete(),
      paymentStatus: FieldValue.delete(),
      laborCost: FieldValue.delete(),
      serviceOnlyCost: FieldValue.delete(),
      financialState: warrantyJob
        ? 'warranty_ready'
        : (needsApproval ? 'pending_discount_approval' : 'ready_for_payment'),
      ...(previousAuthorizationId ? {
        approvalStatus: 'superseded',
        approvalTokenHash: FieldValue.delete(),
        approvalTokenExpiresAt: FieldValue.delete(),
        approvalAuthorizationId: FieldValue.delete(),
        approvalRevision: FieldValue.delete(),
      } : {}),
      updatedAt: at,
    });
    return { authorizationId, authorizationNo };
  });
  return { ok: true as const, ...result, ...totals, ...breakdown, settlementType: warrantyJob ? WARRANTY_SETTLEMENT : 'standard' };
}

async function requestCustomerApproval(actor: Actor, data: Record<string, unknown>) {
  requirePermission(actor, ['repair.jobs.reception'], 'طلب موافقة العميل متاح للاستقبال أو الإدارة فقط.');
  const jobId = String(data.jobId || '').trim();
  const scoped = await loadScopedJob(actor, jobId);
  if (!['estimate_ready', 'waiting_approval'].includes(String(scoped.job.status || ''))) {
    throw new HttpsError('failed-precondition', 'أكمل التقدير الفني قبل إرسال موافقة العميل.');
  }
  const finRef = db.collection('repair_job_financials').doc(jobId);
  const finSnap = await finRef.get();
  const authorizationId = String(finSnap.data()?.currentAuthorizationId || '');
  if (!authorizationId) throw new HttpsError('failed-precondition', 'جهز إذن الدفع قبل إرسال موافقة العميل.');
  const authRef = db.collection('repair_payment_authorizations').doc(authorizationId);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const at = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  await db.runTransaction(async (tx) => {
    const [jobSnap, currentFinSnap, authSnap] = await Promise.all([
      tx.get(scoped.jobRef), tx.get(finRef), tx.get(authRef),
    ]);
    if (!jobSnap.exists || !currentFinSnap.exists || !authSnap.exists) {
      throw new HttpsError('failed-precondition', 'مستندات التقدير غير مكتملة.');
    }
    if (String(currentFinSnap.data()?.currentAuthorizationId || '') !== authorizationId) {
      throw new HttpsError('aborted', 'تغير إصدار إذن الدفع؛ أعد المحاولة.');
    }
    const auth = authSnap.data() as Record<string, unknown>;
    if (isWarrantySettlement(auth) || isWarrantySettlement(currentFinSnap.data() as Record<string, unknown>)) {
      throw new HttpsError(
        'failed-precondition',
        'طلب ضمان المصنّع لا يُرسل لموافقة تسعير العميل لأنه يحصل على إعفاء ضمان كامل تلقائيًا.',
      );
    }
    if (String(auth.status || '') === 'void' || String(auth.discountApprovalStatus || 'approved') === 'rejected') {
      throw new HttpsError('failed-precondition', 'إذن الدفع الحالي غير صالح للموافقة.');
    }
    const revision = Math.max(1, Number(auth.revision || 1));
    tx.update(scoped.jobRef, {
      approvalStatus: 'pending',
      status: 'waiting_approval',
      approvalRequestedAt: at,
      approvalTokenHash: tokenHash,
      approvalTokenExpiresAt: expiresAt,
      approvalAuthorizationId: authorizationId,
      approvalRevision: revision,
      updatedAt: at,
    });
    tx.set(scoped.jobRef.collection('service_events').doc(), {
      tenantId: actor.tenantId,
      branchId: scoped.branchId,
      jobId,
      at,
      actorUid: actor.uid,
      actorName: actor.displayName,
      action: 'approval_requested',
      domainEvent: 'customer.approval_requested',
      eventSchemaVersion: 1,
      note: `طلب موافقة على إذن الدفع ${String(auth.authorizationNo || authorizationId)} — إصدار ${revision}`,
    });
  });
  return { ok: true as const, token, authorizationId, expiresAt };
}

async function resolveApproval(actor: Actor, data: Record<string, unknown>) {
  const approvalId = String(data.approvalId || '').trim();
  const decision = data.decision === 'approved' ? 'approved' : data.decision === 'rejected' ? 'rejected' : '';
  if (!approvalId || !decision) throw new HttpsError('invalid-argument', 'بيانات قرار الاعتماد غير مكتملة.');
  const approvalRef = db.collection('repair_financial_approvals').doc(approvalId);
  const initial = await approvalRef.get();
  if (!initial.exists) throw new HttpsError('not-found', 'طلب الاعتماد غير موجود.');
  const approval = initial.data() as Record<string, unknown>;
  const type = String(approval.type || '');
  requirePermission(actor, [type === 'credit' ? 'repair.credit.approve' : 'repair.discounts.approve'], 'ليس لديك صلاحية الاعتماد.');
  if (String(approval.tenantId || '') !== actor.tenantId) throw new HttpsError('permission-denied', 'الاعتماد خارج شركتك.');
  if (String(approval.requestedBy || '') === actor.uid) throw new HttpsError('failed-precondition', 'لا يمكن لمقدم الطلب اعتماد طلبه.');
  const authorizationId = String(approval.authorizationId || '');
  const authRef = db.collection('repair_payment_authorizations').doc(authorizationId);
  const finRef = db.collection('repair_job_financials').doc(String(approval.jobId || ''));
  const jobRef = db.collection('repair_jobs').doc(String(approval.jobId || ''));
  const at = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const [approvalSnap, authSnap, finSnap] = await Promise.all([tx.get(approvalRef), tx.get(authRef), tx.get(finRef)]);
    if (!approvalSnap.exists || !authSnap.exists || !finSnap.exists) throw new HttpsError('failed-precondition', 'مستندات الاعتماد غير مكتملة.');
    const current = approvalSnap.data() as Record<string, unknown>;
    if (String(current.status || '') !== 'pending') return;
    tx.update(approvalRef, {
      status: decision,
      resolvedBy: actor.uid,
      resolvedByName: actor.displayName,
      resolvedAt: at,
      resolutionNote: String(data.note || '').trim(),
    });
    if (type === 'credit') {
      tx.update(authRef, { creditApprovalStatus: decision, updatedAt: at });
      tx.update(finRef, { creditApprovalStatus: decision, updatedAt: at });
    } else {
      tx.update(authRef, {
        discountApprovalStatus: decision,
        status: decision === 'approved' ? (roundMoney(authSnap.data()?.netAmount) <= 0 ? 'paid' : 'approved') : 'void',
        updatedAt: at,
      });
      tx.update(jobRef, { financialState: decision === 'approved' ? 'ready_for_payment' : 'discount_rejected', updatedAt: at });
    }
  });
  return { ok: true as const, approvalId, status: decision };
}

async function requestCredit(actor: Actor, data: Record<string, unknown>) {
  requirePermission(actor, ['repair.credit.request'], 'ليس لديك صلاحية طلب تسليم برصيد.');
  const authorizationId = String(data.authorizationId || '').trim();
  const authRef = db.collection('repair_payment_authorizations').doc(authorizationId);
  const authSnap = await authRef.get();
  if (!authSnap.exists) throw new HttpsError('not-found', 'إذن الدفع غير موجود.');
  const auth = authSnap.data() as Record<string, unknown>;
  if (String(auth.tenantId || '') !== actor.tenantId) throw new HttpsError('permission-denied', 'إذن الدفع خارج شركتك.');
  if (isWarrantySettlement(auth)) {
    throw new HttpsError('failed-precondition', 'إذن ضمان المصنّع لا يحتاج تسليمًا برصيد.');
  }
  const scoped = await loadScopedJob(actor, String(auth.jobId || ''));
  if (String(scoped.job.status || '') !== 'ready') {
    throw new HttpsError('failed-precondition', 'طلب التسليم برصيد متاح بعد الجاهزية الفنية فقط.');
  }
  const balance = roundMoney(auth.balanceDue);
  if (balance <= 0) throw new HttpsError('failed-precondition', 'لا يوجد رصيد متبقٍ يحتاج اعتمادًا.');
  const approvalId = `${authorizationId}__credit`;
  const approvalRef = db.collection('repair_financial_approvals').doc(approvalId);
  const at = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const [current, currentJob] = await Promise.all([tx.get(approvalRef), tx.get(scoped.jobRef)]);
    if (!currentJob.exists || String(currentJob.data()?.status || '') !== 'ready') {
      throw new HttpsError('failed-precondition', 'تغيرت حالة الطلب ولم يعد جاهزًا للتسليم.');
    }
    if (current.exists && String(current.data()?.status || '') === 'pending') return;
    tx.set(approvalRef, {
      tenantId: actor.tenantId,
      branchId: String(auth.branchId || ''),
      jobId: String(auth.jobId || ''),
      authorizationId,
      type: 'credit',
      status: 'pending',
      requestedAmount: balance,
      reason: String(data.reason || '').trim() || 'طلب تسليم برصيد متبقٍ',
      requestedBy: actor.uid,
      requestedByName: actor.displayName,
      requestedAt: at,
    });
    tx.update(authRef, { creditApprovalStatus: 'pending', updatedAt: at });
  });
  return { ok: true as const, approvalId, requestedAmount: balance };
}

async function collectPayment(actor: Actor, data: Record<string, unknown>) {
  requirePermission(actor, ['repair.payments.collect'], 'ليس لديك صلاحية تحصيل دفعة.');
  const authorizationId = String(data.authorizationId || '').trim();
  const paymentId = String(data.requestId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const method = String(data.method || '') as PaymentMethod;
  const amount = roundMoney(data.amount);
  if (!authorizationId || !paymentId || amount <= 0 || !['cash', 'card', 'bank_transfer'].includes(method)) {
    throw new HttpsError('invalid-argument', 'بيانات الدفعة غير مكتملة.');
  }
  const authRef = db.collection('repair_payment_authorizations').doc(authorizationId);
  const initialAuthSnap = await authRef.get();
  if (!initialAuthSnap.exists) throw new HttpsError('not-found', 'إذن الدفع غير موجود.');
  const initialAuth = initialAuthSnap.data() as Record<string, unknown>;
  if (String(initialAuth.tenantId || '') !== actor.tenantId) throw new HttpsError('permission-denied', 'إذن الدفع خارج شركتك.');
  const branchId = String(initialAuth.branchId || '');
  const liveAccounting = await loadLiveBranchAccounting(actor, branchId);
  if (!actor.isSuperAdmin && actor.permissions['repair.branches.manage'] !== true && !actor.branchIds.includes(branchId)) {
    throw new HttpsError('permission-denied', 'هذا الفرع خارج نطاق صلاحياتك.');
  }
  const openSessions = await db.collection('repair_treasury_sessions')
    .where('branchId', '==', branchId).where('status', '==', 'open').limit(5).get();
  const sessionDoc = openSessions.docs
    .filter((snap) => String(snap.data().tenantId || '') === actor.tenantId)
    .sort((a, b) => String(b.data().openedAt || '').localeCompare(String(a.data().openedAt || '')))[0];
  if (!sessionDoc) throw new HttpsError('failed-precondition', 'لا توجد خزينة مفتوحة لهذا الفرع.');
  const jobId = String(initialAuth.jobId || '');
  const jobRef = db.collection('repair_jobs').doc(jobId);
  const finRef = db.collection('repair_job_financials').doc(jobId);
  const paymentRef = db.collection('repair_payments').doc(paymentId);
  const treasuryEntryRef = db.collection('repair_treasury_entries').doc(`${actor.tenantId}__repair_payment__${paymentId}`);
  const journalRef = db.collection('accounting_journal_entries').doc(`${actor.tenantId}__repair_payment__${paymentId}`);
  const month = String(sessionDoc.data().openedAt || new Date().toISOString()).slice(0, 7);
  const monthCloseRef = db.collection('repair_treasury_month_closes').doc(`${actor.tenantId}_${branchId}_${month}`);
  const at = new Date().toISOString();
  const result = await db.runTransaction(async (tx) => {
    const [authSnap, finSnap, sessionSnap, paymentSnap, monthCloseSnap, jobSnap] = await Promise.all([
      tx.get(authRef), tx.get(finRef), tx.get(sessionDoc.ref), tx.get(paymentRef), tx.get(monthCloseRef), tx.get(jobRef),
    ]);
    if (paymentSnap.exists) return { paymentNo: String(paymentSnap.data()?.paymentNo || ''), duplicated: true };
    if (!authSnap.exists || !finSnap.exists || !sessionSnap.exists) throw new HttpsError('failed-precondition', 'بيانات التحصيل غير مكتملة.');
    if (!jobSnap.exists || String(jobSnap.data()?.status || '') !== 'ready') {
      throw new HttpsError('failed-precondition', 'لا يمكن التحصيل قبل اكتمال العمل ووصول الطلب إلى جاهز للتسليم.');
    }
    const auth = authSnap.data() as Record<string, unknown>;
    if (isWarrantySettlement(auth) || isWarrantySettlement(finSnap.data() as Record<string, unknown>)) {
      throw new HttpsError(
        'failed-precondition',
        'إذن ضمان المصنّع لا يُحصَّل. استخدم التسليم مباشرة بعد تجهيز إقفال الضمان.',
      );
    }
    if (!['approved', 'partial'].includes(String(auth.status || ''))) throw new HttpsError('failed-precondition', 'إذن الدفع غير معتمد للتحصيل.');
    if (String(auth.discountApprovalStatus || 'approved') !== 'approved') throw new HttpsError('failed-precondition', 'الخصم لم يعتمد بعد.');
    if (sessionSnap.data()?.needsManualClose === true || String(sessionSnap.data()?.status || '') !== 'open') throw new HttpsError('failed-precondition', 'الخزينة غير متاحة للتحصيل.');
    if (monthCloseSnap.exists && String(monthCloseSnap.data()?.status || '') === 'closed') throw new HttpsError('failed-precondition', 'شهر الخزينة مقفول.');
    const balance = roundMoney(auth.balanceDue);
    if (amount > balance + 0.001) throw new HttpsError('invalid-argument', 'مبلغ الدفعة أكبر من الرصيد المتبقي.');
    const paid = roundMoney(roundMoney(auth.paidAmount) + amount);
    const nextBalance = roundMoney(roundMoney(auth.netAmount) - paid);
    const nextStatus = paymentStatus(roundMoney(auth.netAmount), paid);
    const paymentNo = `RCPT-${String(auth.receiptNo || jobId)}-${paymentId.slice(-6).toUpperCase()}`;
    const costCenterId = liveAccounting.costCenterId;
    const accountingAccounts = liveAccounting.accountingAccounts;
    const accounts = accountSeeds(actor.tenantId, accountingAccounts);
    const debitAccount = method === 'cash' ? accounts.CASH : method === 'card' ? accounts.CARD : accounts.BANK;
    tx.create(paymentRef, {
      tenantId: actor.tenantId, branchId, jobId, authorizationId, paymentNo, amount, method,
      status: 'posted', treasuryEntryId: treasuryEntryRef.id, journalEntryId: journalRef.id,
      createdBy: actor.uid, createdByName: actor.displayName, createdAt: at,
    });
    tx.create(treasuryEntryRef, {
      tenantId: actor.tenantId, branchId, sessionId: sessionDoc.id, entryType: 'INCOME', amount,
      paymentMethod: method, costCenterId, note: `تحصيل ${paymentNo}`, referenceId: jobId,
      source: 'repair_payment', createdBy: actor.uid, createdByName: actor.displayName, createdAt: at,
    });
    tx.create(journalRef, {
      tenantId: actor.tenantId, branchId, costCenterId, source: 'repair_payment', sourceId: paymentId,
      referenceNo: paymentNo, status: 'posted', postedAt: at, createdBy: actor.uid, createdByName: actor.displayName,
      totalDebit: amount, totalCredit: amount,
      lines: [
        { accountCode: debitAccount.code, accountName: debitAccount.name, debit: amount, credit: 0, costCenterId },
        { accountCode: accounts.CUSTOMER_DEPOSITS.code, accountName: accounts.CUSTOMER_DEPOSITS.name, debit: 0, credit: amount, costCenterId },
      ],
    });
    // Refresh stale account snapshots frozen when the authorization was first prepared.
    tx.update(authRef, {
      paidAmount: paid,
      balanceDue: nextBalance,
      status: nextStatus,
      costCenterId,
      accountingAccounts,
      updatedAt: at,
    });
    tx.update(finRef, {
      paidAmount: paid,
      balanceDue: nextBalance,
      paymentStatus: nextStatus,
      costCenterId,
      accountingAccounts,
      updatedAt: at,
    });
    tx.update(jobRef, { financialState: nextStatus === 'paid' ? 'paid' : 'partially_paid', updatedAt: at });
    return { paymentNo, duplicated: false };
  });
  return { ok: true as const, paymentId, amount, ...result };
}

async function reversePayment(actor: Actor, data: Record<string, unknown>) {
  requirePermission(actor, ['repair.payments.reverse'], 'ليس لديك صلاحية عكس الدفعة.');
  const paymentId = String(data.paymentId || '').trim();
  const reason = String(data.reason || '').trim();
  if (!paymentId || reason.length < 3) throw new HttpsError('invalid-argument', 'سبب العكس مطلوب.');
  const paymentRef = db.collection('repair_payments').doc(paymentId);
  const initial = await paymentRef.get();
  if (!initial.exists) throw new HttpsError('not-found', 'الدفعة غير موجودة.');
  const payment = initial.data() as Record<string, unknown>;
  if (String(payment.tenantId || '') !== actor.tenantId) throw new HttpsError('permission-denied', 'الدفعة خارج شركتك.');
  const jobId = String(payment.jobId || '');
  const branchId = String(payment.branchId || '');
  const liveAccounting = await loadLiveBranchAccounting(actor, branchId);
  const jobRef = db.collection('repair_jobs').doc(jobId);
  const authRef = db.collection('repair_payment_authorizations').doc(String(payment.authorizationId || ''));
  const finRef = db.collection('repair_job_financials').doc(jobId);
  const reversalTreasuryRef = db.collection('repair_treasury_entries').doc(`${actor.tenantId}__repair_payment_reversal__${paymentId}`);
  const reversalJournalRef = db.collection('accounting_journal_entries').doc(`${actor.tenantId}__repair_payment_reversal__${paymentId}`);
  const at = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const [paymentSnap, jobSnap, authSnap, finSnap] = await Promise.all([tx.get(paymentRef), tx.get(jobRef), tx.get(authRef), tx.get(finRef)]);
    if (!paymentSnap.exists || !authSnap.exists || !finSnap.exists) throw new HttpsError('failed-precondition', 'بيانات الدفعة غير مكتملة.');
    if (String(paymentSnap.data()?.status || '') === 'reversed') return;
    if (jobSnap.exists && (jobSnap.data()?.isClosed === true || ['delivered', 'completed'].includes(String(jobSnap.data()?.status || '')))) {
      throw new HttpsError('failed-precondition', 'أعد فتح الطلب قبل عكس دفعة طلب مُسلَّم.');
    }
    const amount = roundMoney(paymentSnap.data()?.amount);
    const paid = roundMoney(roundMoney(authSnap.data()?.paidAmount) - amount);
    const net = roundMoney(authSnap.data()?.netAmount);
    const balance = roundMoney(net - paid);
    const nextStatus = paymentStatus(net, paid);
    const method = String(paymentSnap.data()?.method || 'cash');
    const costCenterId = liveAccounting.costCenterId;
    const accounts = accountSeeds(actor.tenantId, liveAccounting.accountingAccounts);
    const creditAccount = method === 'cash' ? accounts.CASH : method === 'card' ? accounts.CARD : accounts.BANK;
    tx.update(paymentRef, { status: 'reversed', reversedAt: at, reversedBy: actor.uid, reversalReason: reason });
    tx.create(reversalTreasuryRef, {
      tenantId: actor.tenantId, branchId, entryType: 'EXPENSE', amount,
      paymentMethod: method, costCenterId, note: `عكس ${String(payment.paymentNo || paymentId)} — ${reason}`,
      referenceId: jobId, source: 'repair_payment_reversal', createdBy: actor.uid, createdByName: actor.displayName, createdAt: at,
    });
    tx.create(reversalJournalRef, {
      tenantId: actor.tenantId, branchId, costCenterId,
      source: 'repair_payment_reversal', sourceId: paymentId, referenceNo: `REV-${String(payment.paymentNo || paymentId)}`,
      status: 'posted', postedAt: at, createdBy: actor.uid, createdByName: actor.displayName,
      totalDebit: amount, totalCredit: amount,
      lines: [
        { accountCode: accounts.CUSTOMER_DEPOSITS.code, accountName: accounts.CUSTOMER_DEPOSITS.name, debit: amount, credit: 0, costCenterId },
        { accountCode: creditAccount.code, accountName: creditAccount.name, debit: 0, credit: amount, costCenterId },
      ],
    });
    tx.update(authRef, {
      paidAmount: paid,
      balanceDue: balance,
      status: nextStatus === 'unpaid' ? 'approved' : nextStatus,
      costCenterId,
      accountingAccounts: liveAccounting.accountingAccounts,
      updatedAt: at,
    });
    tx.update(finRef, {
      paidAmount: paid,
      balanceDue: balance,
      paymentStatus: nextStatus,
      costCenterId,
      accountingAccounts: liveAccounting.accountingAccounts,
      updatedAt: at,
    });
    tx.update(jobRef, { financialState: nextStatus === 'paid' ? 'paid' : nextStatus === 'partial' ? 'partially_paid' : 'ready_for_payment', updatedAt: at });
  });
  return { ok: true as const, paymentId };
}

async function deliver(actor: Actor, data: Record<string, unknown>) {
  requirePermission(actor, ['repair.jobs.reception'], 'التسليم متاح لموظف الاستقبال أو الإدارة فقط.');
  const jobId = String(data.jobId || '').trim();
  const scoped = await loadScopedJob(actor, jobId);
  const finRef = db.collection('repair_job_financials').doc(jobId);
  const initialFinSnap = await finRef.get();
  const initialFin = initialFinSnap.data() as Record<string, unknown> | undefined;
  const authId = String(initialFin?.currentAuthorizationId || '');
  if (!authId) throw new HttpsError('failed-precondition', 'جهّز إذن الدفع قبل التسليم.');
  const liveAccounting = await loadLiveBranchAccounting(actor, scoped.branchId);
  const authRef = db.collection('repair_payment_authorizations').doc(authId);
  const journalRef = db.collection('accounting_journal_entries').doc(`${actor.tenantId}__repair_delivery__${jobId}`);
  const eventRef = scoped.jobRef.collection('service_events').doc(`${jobId}__delivered`);
  const at = new Date().toISOString();
  const result = await db.runTransaction(async (tx) => {
    const [jobSnap, finSnap, authSnap, journalSnap] = await Promise.all([
      tx.get(scoped.jobRef), tx.get(finRef), tx.get(authRef), tx.get(journalRef),
    ]);
    if (!jobSnap.exists || !finSnap.exists || !authSnap.exists) throw new HttpsError('failed-precondition', 'بيانات التسليم غير مكتملة.');
    const job = jobSnap.data() as Record<string, unknown>;
    if (['delivered', 'completed'].includes(String(job.status || ''))) {
      return { deliveryAuthorizationNo: String(job.deliveryAuthorizationNo || `DEL-${String(job.receiptNo || jobId)}`), duplicated: true };
    }
    if (String(job.status || '') !== 'ready') throw new HttpsError('failed-precondition', 'التسليم مسموح بعد حالة جاهز للتسليم فقط.');
    const hasPendingParts = (Array.isArray(job.partsUsed) ? job.partsUsed : []).some((raw) =>
      ['pending_supply', 'ready_to_issue'].includes(String((raw as Record<string, unknown>).fulfillmentStatus || '')),
    );
    if (hasPendingParts) throw new HttpsError('failed-precondition', 'لا يمكن التسليم قبل صرف كل القطع المعلقة.');
    const fin = finSnap.data() as Record<string, unknown>;
    const auth = authSnap.data() as Record<string, unknown>;
    const warrantySettlement = isWarrantySettlement(fin) || isWarrantySettlement(auth);
    if (warrantySettlement && String(auth.status || '') !== 'paid') {
      throw new HttpsError('failed-precondition', 'إذن ضمان المصنّع غير جاهز للتسليم. جهّز إقفال الضمان أولًا.');
    }
    const balance = roundMoney(fin.balanceDue);
    if (!warrantySettlement && balance > 0 && String(auth.creditApprovalStatus || '') !== 'approved') {
      throw new HttpsError('failed-precondition', 'يوجد رصيد متبقٍ؛ يلزم اعتماد الإدارة قبل التسليم.');
    }
    if (warrantySettlement && balance > 0) {
      throw new HttpsError('failed-precondition', 'إذن الضمان يجب أن يكون بدون رصيد متبقٍ.');
    }
    const accounts = accountSeeds(actor.tenantId, liveAccounting.accountingAccounts);
    const serviceGross = roundMoney(fin.serviceGross);
    const partsGross = roundMoney(fin.partsGross);
    const discount = roundMoney(fin.discountAmount);
    const paid = roundMoney(fin.paidAmount);
    const gross = roundMoney(fin.grossAmount);
    if (!warrantySettlement && gross <= 0) {
      throw new HttpsError(
        'failed-precondition',
        'إذن الدفع الحالي قيمته صفر وغير صالح للتسليم. أضف خدمة مسعّرة أو قطعة غيار ثم أنشئ إصدارًا جديدًا.',
      );
    }
    const costCenterId = liveAccounting.costCenterId;
    const warrantyPartsActualCost = warrantySettlement ? sumPartsActualCost(job.partsUsed) : 0;
    const warrantyServiceInternalCost = warrantySettlement ? roundMoney(fin.warrantyServiceInternalCost) : 0;
    if (!journalSnap.exists && gross > 0) {
      const debitLines = warrantySettlement
        ? [{ accountCode: accounts.WARRANTY_ALLOWANCES.code, accountName: accounts.WARRANTY_ALLOWANCES.name, debit: gross, credit: 0, costCenterId }]
        : [
            ...(paid > 0 ? [{ accountCode: accounts.CUSTOMER_DEPOSITS.code, accountName: accounts.CUSTOMER_DEPOSITS.name, debit: paid, credit: 0, costCenterId }] : []),
            ...(balance > 0 ? [{ accountCode: accounts.RECEIVABLES.code, accountName: accounts.RECEIVABLES.name, debit: balance, credit: 0, costCenterId }] : []),
            ...(discount > 0 ? [{ accountCode: accounts.DISCOUNTS.code, accountName: accounts.DISCOUNTS.name, debit: discount, credit: 0, costCenterId }] : []),
          ];
      const creditLines = [
        ...(serviceGross > 0 ? [{ accountCode: accounts.SERVICE_REVENUE.code, accountName: accounts.SERVICE_REVENUE.name, debit: 0, credit: serviceGross, costCenterId }] : []),
        ...(partsGross > 0 ? [{ accountCode: accounts.PARTS_REVENUE.code, accountName: accounts.PARTS_REVENUE.name, debit: 0, credit: partsGross, costCenterId }] : []),
      ];
      tx.create(journalRef, {
        tenantId: actor.tenantId, branchId: scoped.branchId, costCenterId,
        source: warrantySettlement ? 'repair_warranty_delivery' : 'repair_delivery', sourceId: jobId,
        referenceNo: `DEL-${String(job.receiptNo || jobId)}`, status: 'posted', postedAt: at,
        createdBy: actor.uid, createdByName: actor.displayName, totalDebit: gross, totalCredit: gross,
        lines: [...debitLines, ...creditLines],
      });
    }
    const authorizationNo = String(job.deliveryAuthorizationNo || `DEL-${String(job.receiptNo || jobId)}`);
    const history = Array.isArray(job.statusHistory) ? [...job.statusHistory] : [];
    history.push({ status: 'delivered', at, technicianId: actor.uid });
    tx.update(scoped.jobRef, {
      status: 'delivered', statusHistory: history, deliveredAt: at, resolvedAt: String(job.resolvedAt || at),
      isClosed: true, closedReason: 'delivered',
      financialState: warrantySettlement
        ? 'warranty_settled'
        : (balance > 0 ? 'delivered_on_credit' : 'settled'),
      warrantyScope: warrantySettlement ? 'manufacturer' : (String(job.warrantyScope || '') || FieldValue.delete()),
      deliveryAuthorizationNo: authorizationNo, deliveryAuthorizationIssuedAt: at,
      deliveryAuthorizationIssuedBy: actor.uid, deliveryAuthorizationIssuedByName: actor.displayName,
      warranty: warrantySettlement ? 'none' : String(data.warranty || job.warranty || 'none'),
      updatedAt: at,
    });
    tx.update(finRef, {
      costCenterId,
      accountingAccounts: liveAccounting.accountingAccounts,
      settlementType: warrantySettlement ? WARRANTY_SETTLEMENT : (String(fin.settlementType || 'standard')),
      warrantyPartsActualCost,
      warrantyServiceInternalCost,
      warrantyActualCost: roundMoney(warrantyPartsActualCost + warrantyServiceInternalCost),
      settledAt: at,
      updatedAt: at,
    });
    tx.update(authRef, {
      costCenterId,
      accountingAccounts: liveAccounting.accountingAccounts,
      updatedAt: at,
    });
    tx.set(eventRef, {
      tenantId: actor.tenantId, branchId: scoped.branchId, jobId, at, actorUid: actor.uid,
      actorName: actor.displayName, action: 'status_change',
      domainEvent: warrantySettlement ? 'job.delivered_warranty' : 'job.delivered',
      eventSchemaVersion: 1,
      statusBefore: String(job.status || ''), statusAfter: 'delivered',
      note: warrantySettlement
        ? 'تسليم ضمان مصنّع — إعفاء كامل للعميل مع إثبات قيمة الضمان'
        : 'تم التسليم بواسطة الاستقبال بعد التحقق المالي',
    });
    return { deliveryAuthorizationNo: authorizationNo, duplicated: false, warrantySettlement };
  });
  return { ok: true as const, jobId, ...result };
}

export const mutateRepairPaymentHandler = async (request: CallableRequest) => {
  const actor = await loadActor(requireAuth(request));
  const data = (request.data || {}) as Record<string, unknown>;
  const operation = String(data.operation || '') as Operation;
  if (operation === 'prepare') return prepareAuthorization(actor, data);
  if (operation === 'resolve_approval') return resolveApproval(actor, data);
  if (operation === 'request_credit') return requestCredit(actor, data);
  if (operation === 'collect') return collectPayment(actor, data);
  if (operation === 'reverse_payment') return reversePayment(actor, data);
  if (operation === 'deliver') return deliver(actor, data);
  if (operation === 'request_customer_approval') return requestCustomerApproval(actor, data);
  throw new HttpsError(
    'invalid-argument',
    operation
      ? `عملية مالية غير مدعومة (${operation}). أعد نشر Cloud Functions ثم حاول مجددًا.`
      : 'عملية مالية غير مدعومة (لم يُرسل نوع العملية). أعد نشر Cloud Functions ثم حاول مجددًا.',
  );
};
