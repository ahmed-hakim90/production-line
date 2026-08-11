import { HttpsError } from "firebase-functions/v2/https";
import { getDb } from "./adminApp.js";
const db = getDb();
const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const nowIso = () => new Date().toISOString();
const accountId = (tenantId, code) => `${tenantId}__${code}`;
const DEFAULT_CUTOVER_PERIOD = "2026-09";
const DEFAULT_ACCOUNTING_POLICY = {
    inventoryValuationMethod: "weighted_average",
    autoPostInventory: true,
    requireCostCenter: true,
    allowManualJournals: true,
    allowJournalReversal: true,
    enforceOpenPeriods: true,
    allowPeriodReopen: true,
    syncCostAndAccountingClose: true,
    autoPostRepairPayments: true,
    autoPostRepairSales: true,
    autoPostRepairCogs: true,
    autoPostRepairTreasury: true,
    cutoverPeriod: DEFAULT_CUTOVER_PERIOD,
    openingBalanceStatus: "pending",
};
async function accountingPolicy(tenantId) {
    const snap = await db.collection("accounting_settings").doc(tenantId).get();
    return {
        ...DEFAULT_ACCOUNTING_POLICY,
        ...(snap.exists ? snap.data() : {}),
    };
}
async function writeAccountingAudit(actor, action, entityId, before, after) {
    await db.collection("accounting_audit_log").add({
        tenantId: actor.tenantId,
        action,
        entityId,
        before: before || null,
        after: after || null,
        actorUid: actor.uid,
        actorName: actor.name,
        createdAt: nowIso(),
    });
}
async function actorFromRequest(request) {
    const uid = String(request.auth?.uid || "");
    if (!uid)
        throw new HttpsError("unauthenticated", "يجب تسجيل الدخول.");
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists || userSnap.data()?.isActive === false) {
        throw new HttpsError("permission-denied", "المستخدم غير موجود أو غير نشط.");
    }
    const user = userSnap.data();
    const tenantId = String(user.tenantId || "");
    if (!tenantId)
        throw new HttpsError("failed-precondition", "لا توجد شركة مرتبطة بالمستخدم.");
    let permissions = {};
    const roleId = String(user.roleId || "");
    if (roleId) {
        const roleSnap = await db.collection("roles").doc(roleId).get();
        if (!roleSnap.exists ||
            String(roleSnap.data()?.tenantId || "") !== tenantId) {
            throw new HttpsError("permission-denied", "دور المستخدم غير صالح.");
        }
        permissions = (roleSnap.data()?.permissions || {});
    }
    return {
        uid,
        tenantId,
        name: String(user.displayName || user.name || user.email || uid),
        permissions,
        isSuperAdmin: user.isSuperAdmin === true,
    };
}
function requirePermission(actor, permission) {
    if (!actor.isSuperAdmin && actor.permissions[permission] !== true) {
        throw new HttpsError("permission-denied", "ليس لديك صلاحية تنفيذ هذه العملية المحاسبية.");
    }
}
function requireAnyPermission(actor, permissions) {
    if (!actor.isSuperAdmin
        && !permissions.some((permission) => actor.permissions[permission] === true)) {
        throw new HttpsError("permission-denied", "ليس لديك صلاحية تنفيذ هذه العملية المحاسبية.");
    }
}
const DEFAULT_ACCOUNTS = [
    ["1000", "الأصول", "asset", "", false],
    ["1100", "النقدية والبنوك", "asset", "1000", false],
    ["111001", "الخزينة النقدية", "asset", "1100", true],
    ["111002", "تحصيلات البطاقات", "asset", "1100", true],
    ["111003", "التحويلات البنكية", "asset", "1100", true],
    ["1200", "العملاء والمدينون", "asset", "1000", false],
    ["113001", "ذمم العملاء", "asset", "1200", true],
    ["1300", "المخزون", "asset", "1000", false],
    ["131001", "مخزون المواد وقطع الغيار", "asset", "1300", true],
    ["132001", "إنتاج تحت التشغيل", "asset", "1300", true],
    ["133001", "مخزون الإنتاج التام", "asset", "1300", true],
    ["139001", "تسويات تقييم المخزون", "asset", "1300", true],
    ["1400", "الأصول الثابتة", "asset", "1000", false],
    ["141001", "تكلفة الأصول الثابتة", "asset", "1400", true],
    ["142001", "مجمع إهلاك الأصول الثابتة", "asset", "1400", true],
    ["2000", "الالتزامات", "liability", "", false],
    ["211001", "دفعات العملاء المقدمة", "liability", "2000", true],
    ["2200", "الموردون والاستحقاقات", "liability", "2000", false],
    ["221001", "أجور ورواتب مستحقة", "liability", "2200", true],
    ["222001", "موردون ومصروفات مستحقة", "liability", "2200", true],
    ["3000", "حقوق الملكية", "equity", "", false],
    ["3100", "رأس المال والأرباح المحتجزة", "equity", "3000", true],
    ["4000", "الإيرادات", "revenue", "", false],
    ["411001", "إيراد خدمات الصيانة", "revenue", "4000", true],
    ["412001", "إيراد قطع الغيار", "revenue", "4000", true],
    ["419001", "خصومات المبيعات والصيانة", "contra_revenue", "4000", true],
    ["419002", "إيرادات متنوعة صيانة", "revenue", "4000", true],
    ["419003", "مسموحات ضمان الصيانة", "contra_revenue", "4000", true],
    ["5000", "تكلفة المبيعات", "expense", "", false],
    ["511001", "تكلفة قطع الغيار المباعة", "expense", "5000", true],
    ["512001", "تكلفة الإنتاج التام المباع", "expense", "5000", true],
    ["5200", "حسابات رقابة تكاليف التصنيع", "expense", "", false],
    ["521001", "تكلفة العمالة الصناعية الفعلية", "expense", "5200", true],
    ["522001", "كهرباء المصنع الفعلية", "expense", "5200", true],
    ["522002", "إيجار المصنع الفعلي", "expense", "5200", true],
    ["522003", "إهلاك أصول المصنع", "expense", "5200", true],
    ["522004", "عمالة وخدمات صناعية غير مباشرة", "expense", "5200", true],
    ["529001", "تكاليف صناعية محملة", "expense", "5200", true],
    ["529002", "انحراف تحميل التكاليف الصناعية", "expense", "5200", true],
    ["6000", "المصروفات التشغيلية", "expense", "", false],
    ["6100", "مصروفات تشغيل عامة", "expense", "6000", true],
    ["6110", "أجور ومصروفات الصيانة", "expense", "6000", false],
    ["611001", "مرتبات وأجور فنيين الصيانة", "expense", "6110", true],
    ["6120", "مصروفات تشغيل فروع الصيانة", "expense", "6000", false],
    ["612001", "تعبئة وتغليف — صيانة", "expense", "6120", true],
    ["612002", "كهرباء — صيانة", "expense", "6120", true],
    ["612003", "إنترنت واتصالات — صيانة", "expense", "6120", true],
    ["612004", "مياه — صيانة", "expense", "6120", true],
    ["612005", "نظافة — صيانة", "expense", "6120", true],
    ["612006", "أدوات مكتبية — صيانة", "expense", "6120", true],
    ["612099", "مصروفات صيانة أخرى", "expense", "6120", true],
];
/** Idempotent chart seed — safe to call before linking a repair branch. */
export async function ensureDefaultAccounts(actor) {
    const at = nowIso();
    const batch = db.batch();
    for (const [code, name, type, parentCode, allowPosting] of DEFAULT_ACCOUNTS) {
        const ref = db
            .collection("accounting_accounts")
            .doc(accountId(actor.tenantId, code));
        batch.set(ref, {
            tenantId: actor.tenantId,
            code,
            name,
            type,
            parentCode: parentCode || null,
            level: code.length / 2,
            allowPosting,
            isActive: true,
            systemSeed: true,
            updatedAt: at,
            updatedBy: actor.uid,
            createdAt: at,
            createdBy: actor.uid,
        }, { merge: true });
    }
    await batch.commit();
    const branches = await db.collection('repair_branches').where('tenantId', '==', actor.tenantId).get();
    const branchBatch = db.batch();
    let branchUpdates = 0;
    for (const branch of branches.docs) {
        const row = branch.data();
        const map = (row.accountingAccounts || {});
        if (String(map.warrantyAllowances || '').trim())
            continue;
        branchBatch.set(branch.ref, {
            accountingAccounts: { ...map, warrantyAllowances: DEFAULT_REPAIR_ACCOUNT_MAP.warrantyAllowances },
            updatedAt: at,
        }, { merge: true });
        branchUpdates += 1;
    }
    if (branchUpdates > 0)
        await branchBatch.commit();
    return DEFAULT_ACCOUNTS.length;
}
async function seedDefaults(actor) {
    requirePermission(actor, "accounting.accounts.manage");
    const count = await ensureDefaultAccounts(actor);
    return { ok: true, count };
}
async function upsertAccount(actor, input) {
    requirePermission(actor, "accounting.accounts.manage");
    const code = String(input.code || "").trim();
    const name = String(input.name || "").trim();
    const type = String(input.type || "");
    const parentCode = String(input.parentCode || "").trim();
    if (!/^\d{2,12}$/.test(code) || name.length < 2) {
        throw new HttpsError("invalid-argument", "كود الحساب واسم الحساب مطلوبان.");
    }
    if (![
        "asset",
        "liability",
        "equity",
        "revenue",
        "expense",
        "contra_revenue",
    ].includes(type)) {
        throw new HttpsError("invalid-argument", "نوع الحساب غير صالح.");
    }
    if (parentCode) {
        const parent = await db
            .collection("accounting_accounts")
            .doc(accountId(actor.tenantId, parentCode))
            .get();
        if (!parent.exists || parent.data()?.isActive === false) {
            throw new HttpsError("failed-precondition", "الحساب الأب غير موجود أو غير نشط.");
        }
        if (parentCode === code)
            throw new HttpsError("invalid-argument", "لا يمكن أن يكون الحساب أبًا لنفسه.");
    }
    const ref = db
        .collection("accounting_accounts")
        .doc(accountId(actor.tenantId, code));
    const existing = await ref.get();
    const at = nowIso();
    await ref.set({
        tenantId: actor.tenantId,
        code,
        name,
        type,
        parentCode: parentCode || null,
        allowPosting: input.allowPosting !== false,
        isActive: input.isActive !== false,
        notes: String(input.notes || "").trim(),
        updatedAt: at,
        updatedBy: actor.uid,
        ...(existing.exists ? {} : { createdAt: at, createdBy: actor.uid }),
    }, { merge: true });
    return { ok: true, id: ref.id };
}
async function saveSettings(actor, input) {
    requirePermission(actor, "accounting.settings.manage");
    const month = Math.round(Number(input.fiscalYearStartMonth || 1));
    const decimals = Math.round(Number(input.decimalPlaces ?? 2));
    if (month < 1 || month > 12 || decimals < 0 || decimals > 4) {
        throw new HttpsError("invalid-argument", "إعدادات السنة المالية أو التقريب غير صالحة.");
    }
    if (input.inventoryValuationMethod &&
        input.inventoryValuationMethod !== "weighted_average") {
        throw new HttpsError("failed-precondition", "المتاح حاليًا هو المتوسط المرجح فقط؛ FIFO والتكلفة المعيارية غير منفذين.");
    }
    const cutoverPeriod = String(input.cutoverPeriod || DEFAULT_CUTOVER_PERIOD).trim();
    if (!/^\d{4}-\d{2}$/.test(cutoverPeriod)) {
        throw new HttpsError("invalid-argument", "فترة بدء الحسابات غير صالحة.");
    }
    const ref = db.collection("accounting_settings").doc(actor.tenantId);
    const before = await ref.get();
    const beforeData = before.exists ? before.data() : null;
    const policyPatch = {
        inventoryValuationMethod: "weighted_average",
        autoPostInventory: input.autoPostInventory !== false,
        requireCostCenter: input.requireCostCenter !== false,
        allowManualJournals: input.allowManualJournals !== false,
        allowJournalReversal: input.allowJournalReversal !== false,
        enforceOpenPeriods: input.enforceOpenPeriods !== false,
        allowPeriodReopen: input.allowPeriodReopen !== false,
        syncCostAndAccountingClose: input.syncCostAndAccountingClose !== false,
        autoPostRepairPayments: input.autoPostRepairPayments !== false,
        autoPostRepairSales: input.autoPostRepairSales !== false,
        autoPostRepairCogs: input.autoPostRepairCogs !== false,
        autoPostRepairTreasury: input.autoPostRepairTreasury !== false,
        cutoverPeriod,
    };
    await ref.set({
        tenantId: actor.tenantId,
        currency: String(input.currency || "EGP")
            .trim()
            .toUpperCase(),
        fiscalYearStartMonth: month,
        decimalPlaces: decimals,
        ...policyPatch,
        openingBalanceStatus: String(beforeData?.openingBalanceStatus || "pending"),
        updatedAt: nowIso(),
        updatedBy: actor.uid,
    }, { merge: true });
    await writeAccountingAudit(actor, "settings_updated", actor.tenantId, beforeData, policyPatch);
    return { ok: true };
}
async function upsertCostCenter(actor, input) {
    requirePermission(actor, "accounting.settings.manage");
    const id = String(input.id || "").trim();
    const code = String(input.code || "")
        .trim()
        .toUpperCase();
    const name = String(input.name || "").trim();
    const category = String(input.accountingCategory || "other");
    const parentId = String(input.parentId || "").trim();
    if (!/^[A-Z0-9_-]{2,20}$/.test(code) || name.length < 2) {
        throw new HttpsError("invalid-argument", "كود مركز التكلفة واسمه مطلوبان.");
    }
    if (![
        "production",
        "repair",
        "warehouse",
        "branch",
        "administration",
        "sales",
        "other",
    ].includes(category)) {
        throw new HttpsError("invalid-argument", "تصنيف مركز التكلفة غير صالح.");
    }
    if (parentId) {
        const parent = await db.collection("cost_centers").doc(parentId).get();
        if (!parent.exists ||
            String(parent.data()?.tenantId || "") !== actor.tenantId ||
            parent.data()?.isActive === false) {
            throw new HttpsError("failed-precondition", "مركز التكلفة الأب غير صالح.");
        }
        if (parentId === id)
            throw new HttpsError("invalid-argument", "لا يمكن أن يكون المركز أبًا لنفسه.");
    }
    const duplicate = await db
        .collection("cost_centers")
        .where("tenantId", "==", actor.tenantId)
        .where("code", "==", code)
        .limit(2)
        .get();
    if (duplicate.docs.some((snap) => snap.id !== id)) {
        throw new HttpsError("already-exists", "كود مركز التكلفة مستخدم بالفعل.");
    }
    const ref = id
        ? db.collection("cost_centers").doc(id)
        : db.collection("cost_centers").doc();
    const existing = await ref.get();
    const at = nowIso();
    await ref.set({
        tenantId: actor.tenantId,
        code,
        name,
        accountingCategory: category,
        parentId: parentId || null,
        branchId: String(input.branchId || "").trim() || null,
        warehouseId: String(input.warehouseId || "").trim() || null,
        allowPosting: input.allowPosting !== false,
        isActive: input.isActive !== false,
        updatedAt: at,
        updatedBy: actor.uid,
        ...(existing.exists
            ? {}
            : {
                type: "direct",
                productionCostingEnabled: false,
                createdAt: at,
                createdBy: actor.uid,
            }),
    }, { merge: true });
    return { ok: true, id: ref.id };
}
const COSTING_BOOLEAN_FLAGS = [
    "legacyConversionEnabled", "fullManufacturingEnabled", "includeDirectLabor",
    "includeSupervisor", "includeIndirectCenters", "includeDepreciation",
    "includeActualMaterials", "includePackaging", "allowBomEstimateFallback",
    "allowLinePercentageAllocation", "allowQuantityAllocation", "fallbackToQuantity",
    "prorateOpenPeriod", "allowProvisionalValues", "requireActualBeforeClose",
    "requireFullAllocationBeforeClose", "freezeClosedSnapshots",
];
async function saveCostingPolicy(actor, input) {
    requirePermission(actor, "costs.manage");
    const raw = (input.costingPolicy && typeof input.costingPolicy === "object"
        ? input.costingPolicy
        : input);
    const policy = {};
    for (const key of COSTING_BOOLEAN_FLAGS)
        policy[key] = raw[key] !== false;
    policy.primaryCostView = raw.primaryCostView === "full_manufacturing"
        ? "full_manufacturing"
        : "legacy_conversion";
    policy.dailyAllocationDriver = raw.dailyAllocationDriver === "quantity"
        ? "quantity"
        : "work_hours";
    if (policy.legacyConversionEnabled === false && policy.fullManufacturingEnabled === false) {
        throw new HttpsError("failed-precondition", "يجب تشغيل تكلفة التحويل أو التكلفة الصناعية الكاملة على الأقل.");
    }
    if (policy.primaryCostView === "full_manufacturing" && policy.fullManufacturingEnabled === false) {
        throw new HttpsError("failed-precondition", "لا يمكن اعتماد التكلفة الكاملة كرقم رئيسي وهي غير مفعلة.");
    }
    if (policy.includeIndirectCenters !== false
        && policy.allowLinePercentageAllocation === false
        && policy.allowQuantityAllocation === false) {
        throw new HttpsError("failed-precondition", "فعّل طريقة توزيع واحدة على الأقل للمراكز غير المباشرة.");
    }
    if (policy.allowProvisionalValues === false && policy.allowBomEstimateFallback !== false) {
        throw new HttpsError("failed-precondition", "BOM التقديري يحتاج السماح بالقيم المبدئية.");
    }
    const ref = db.collection("system_settings").doc(actor.tenantId);
    const before = await ref.get();
    await ref.set({
        tenantId: actor.tenantId,
        costingPolicy: policy,
        updatedAt: nowIso(),
        updatedBy: actor.uid,
    }, { merge: true });
    await writeAccountingAudit(actor, "costing_policy_updated", actor.tenantId, before.data()?.costingPolicy || null, policy);
    return { ok: true, costingPolicy: policy };
}
const PRODUCTION_CENTER_STRING_FIELDS = [
    "name",
    "postingMode",
    "costObjectScope",
    "allocationDriver",
    "allocationBasis",
    "productScope",
    "valueSource",
    "employeeScope",
];
const PRODUCTION_CENTER_ARRAY_FIELDS = [
    "productIds",
    "productCategories",
    "employeeIds",
    "employeeDepartmentIds",
];
async function upsertProductionCostCenter(actor, input) {
    requirePermission(actor, "costs.manage");
    const id = String(input.id || "").trim();
    const name = String(input.name || "").trim();
    if (!id && name.length < 2) {
        throw new HttpsError("invalid-argument", "اسم مركز التكلفة مطلوب.");
    }
    const ref = id
        ? db.collection("cost_centers").doc(id)
        : db.collection("cost_centers").doc();
    const existing = await ref.get();
    if (existing.exists &&
        String(existing.data()?.tenantId || "") !== actor.tenantId) {
        throw new HttpsError("permission-denied", "مركز التكلفة يتبع شركة أخرى.");
    }
    const patch = {
        tenantId: actor.tenantId,
        type: input.type === "direct" ? "direct" : "indirect",
        productionCostingEnabled: input.productionCostingEnabled !== false,
        manualAdjustment: Math.max(0, money(input.manualAdjustment)),
        updatedAt: nowIso(),
        updatedBy: actor.uid,
    };
    for (const key of PRODUCTION_CENTER_STRING_FIELDS) {
        if (key === "name" || input[key] === undefined)
            continue;
        patch[key] = String(input[key] || "").trim();
    }
    for (const key of PRODUCTION_CENTER_ARRAY_FIELDS) {
        if (input[key] === undefined)
            continue;
        patch[key] = Array.isArray(input[key])
            ? Array.from(new Set(input[key]
                .map((value) => String(value || "").trim())
                .filter(Boolean)))
            : [];
    }
    if (!existing.exists) {
        patch.name = name;
        patch.accountingCategory = "production";
        patch.allowPosting = true;
        patch.isActive = true;
        patch.createdAt = nowIso();
        patch.createdBy = actor.uid;
    }
    await ref.set(patch, { merge: true });
    return { ok: true, id: ref.id };
}
async function deactivateProductionCostCenter(actor, input) {
    requirePermission(actor, "costs.manage");
    const id = String(input.id || "").trim();
    if (!id)
        throw new HttpsError("invalid-argument", "معرف المركز مطلوب.");
    const ref = db.collection("cost_centers").doc(id);
    const snap = await ref.get();
    if (!snap.exists ||
        String(snap.data()?.tenantId || "") !== actor.tenantId) {
        throw new HttpsError("not-found", "مركز التكلفة غير موجود.");
    }
    await ref.set({
        productionCostingEnabled: false,
        productionCostingDisabledAt: nowIso(),
        productionCostingDisabledBy: actor.uid,
        updatedAt: nowIso(),
        updatedBy: actor.uid,
    }, { merge: true });
    return { ok: true, id };
}
async function setPeriod(actor, input) {
    requirePermission(actor, "accounting.periods.manage");
    const period = String(input.period || "").trim();
    const status = String(input.status || "");
    if (!/^\d{4}-\d{2}$/.test(period) || !["open", "closed"].includes(status)) {
        throw new HttpsError("invalid-argument", "الفترة أو حالتها غير صالحة.");
    }
    const policy = await accountingPolicy(actor.tenantId);
    if (status === "open" && policy.allowPeriodReopen === false) {
        throw new HttpsError("failed-precondition", "إعادة فتح الفترات معطلة من الإعدادات.");
    }
    if (status === "closed" && policy.syncCostAndAccountingClose !== false) {
        const costs = await db
            .collection("monthly_production_costs")
            .where("tenantId", "==", actor.tenantId)
            .where("month", "==", period)
            .get();
        if (costs.empty || costs.docs.some((snap) => snap.data().isClosed !== true)) {
            throw new HttpsError("failed-precondition", "أغلق تكلفة الإنتاج لكل منتجات الشهر قبل إقفال الفترة المحاسبية.");
        }
    }
    const ref = db
        .collection("accounting_periods")
        .doc(`${actor.tenantId}__${period}`);
    const before = await ref.get();
    await ref.set({
        tenantId: actor.tenantId,
        period,
        status,
        updatedAt: nowIso(),
        updatedBy: actor.uid,
        ...(status === "closed"
            ? { closedAt: nowIso(), closedBy: actor.uid }
            : { reopenedAt: nowIso(), reopenedBy: actor.uid }),
    }, { merge: true });
    await writeAccountingAudit(actor, status === "closed" ? "period_closed" : "period_reopened", period, before.exists ? before.data() : null, { period, status });
    return { ok: true };
}
async function closeCostPeriod(actor, input) {
    requireAnyPermission(actor, ["costs.closePeriod", "costs.manage"]);
    const month = String(input.month || "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new HttpsError("invalid-argument", "شهر التكاليف غير صالح.");
    }
    const settingsSnap = await db.collection("system_settings").doc(actor.tenantId).get();
    const policy = {
        requireActualBeforeClose: true,
        requireFullAllocationBeforeClose: true,
        freezeClosedSnapshots: true,
        ...(settingsSnap.data()?.costingPolicy || {}),
    };
    const periodRef = db.collection("accounting_periods").doc(`${actor.tenantId}__${month}`);
    const costQuery = db.collection("monthly_production_costs")
        .where("tenantId", "==", actor.tenantId).where("month", "==", month);
    const centerQuery = db.collection("cost_centers").where("tenantId", "==", actor.tenantId);
    const valueQuery = db.collection("cost_center_values")
        .where("tenantId", "==", actor.tenantId).where("month", "==", month);
    const allocationQuery = db.collection("cost_allocations")
        .where("tenantId", "==", actor.tenantId).where("month", "==", month);
    const closedAt = nowIso();
    const result = await db.runTransaction(async (tx) => {
        const [periodSnap, costs, centers, values, allocations] = await Promise.all([
            tx.get(periodRef), tx.get(costQuery), tx.get(centerQuery), tx.get(valueQuery), tx.get(allocationQuery),
        ]);
        if (periodSnap.exists && periodSnap.data()?.status === "closed") {
            throw new HttpsError("failed-precondition", "الفترة المحاسبية مقفلة بالفعل؛ لا يمكن تغيير لقطة التكاليف.");
        }
        if (costs.empty) {
            throw new HttpsError("failed-precondition", "احسب تكاليف الشهر قبل الإقفال.");
        }
        if (costs.docs.every((snap) => snap.data().isClosed === true)) {
            return { duplicated: true, count: costs.size };
        }
        if (costs.size + values.size > 450) {
            throw new HttpsError("resource-exhausted", "عدد لقطات الشهر كبير للإقفال الذري؛ قسّم البيانات أو راجع الدعم.");
        }
        if (policy.requireActualBeforeClose !== false
            && costs.docs.some((snap) => snap.data().costingStatus !== "actual" && snap.data().costingStatus !== "closed")) {
            throw new HttpsError("failed-precondition", "لا يمكن الإقفال قبل تحويل كل نتائج الشهر من مبدئية إلى فعلية.");
        }
        const productionIndirectCenters = centers.docs.filter((snap) => {
            const row = snap.data();
            return row.isActive !== false
                && row.productionCostingEnabled !== false
                && String(row.type || "direct") === "indirect";
        });
        const valueByCenter = new Map(values.docs.map((snap) => [String(snap.data().costCenterId || ""), snap]));
        const allocationByCenter = new Map(allocations.docs.map((snap) => [String(snap.data().costCenterId || ""), snap.data()]));
        if (policy.requireActualBeforeClose !== false) {
            const missingActual = productionIndirectCenters.find((center) => {
                const value = valueByCenter.get(center.id)?.data();
                return !value || !["actual", "closed"].includes(String(value.costingStatus || ""));
            });
            if (missingActual) {
                throw new HttpsError("failed-precondition", `اعتمد القيمة الفعلية لمركز التكلفة ${String(missingActual.data().name || missingActual.id)} قبل الإقفال.`);
            }
        }
        if (policy.requireFullAllocationBeforeClose !== false) {
            const incomplete = productionIndirectCenters.find((center) => {
                const row = center.data();
                if (String(row.allocationBasis || "line_percentage") !== "line_percentage")
                    return false;
                const allocation = allocationByCenter.get(center.id);
                const lines = Array.isArray(allocation?.allocations) ? allocation.allocations : [];
                const total = lines.reduce((sum, raw) => sum + Number(raw?.percentage || 0), 0);
                return Math.abs(total - 100) > 0.01;
            });
            if (incomplete) {
                throw new HttpsError("failed-precondition", `يجب أن يكتمل توزيع مركز التكلفة ${String(incomplete.data().name || incomplete.id)} إلى 100%.`);
            }
        }
        for (const snap of costs.docs) {
            tx.update(snap.ref, {
                isClosed: true,
                preCloseCostingStatus: snap.data().costingStatus || "provisional",
                costingStatus: "closed",
                closedAt,
                closedBy: actor.uid,
                snapshotFrozen: policy.freezeClosedSnapshots !== false,
            });
        }
        for (const snap of values.docs) {
            tx.update(snap.ref, {
                preCloseCostingStatus: snap.data().costingStatus || "provisional",
                costingStatus: "closed",
                closedAt,
                closedBy: actor.uid,
            });
        }
        tx.set(db.collection("cost_period_closures").doc(`${actor.tenantId}__${month}`), {
            tenantId: actor.tenantId,
            month,
            status: "closed",
            closedAt,
            closedBy: actor.uid,
            policySnapshot: policy,
            monthlyCostCount: costs.size,
        });
        return { duplicated: false, count: costs.size };
    });
    await writeAccountingAudit(actor, "cost_period_closed", month, null, {
        month,
        ...result,
    });
    return { ok: true, month, ...result };
}
async function reopenCostPeriod(actor, input) {
    requireAnyPermission(actor, ["costs.closePeriod", "costs.manage"]);
    const month = String(input.month || "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new HttpsError("invalid-argument", "شهر التكاليف غير صالح.");
    }
    const accounting = await accountingPolicy(actor.tenantId);
    if (accounting.allowPeriodReopen === false) {
        throw new HttpsError("failed-precondition", "إعادة فتح الفترات معطلة من إعدادات الحسابات.");
    }
    const periodRef = db.collection("accounting_periods").doc(`${actor.tenantId}__${month}`);
    const closureRef = db.collection("cost_period_closures").doc(`${actor.tenantId}__${month}`);
    const costQuery = db.collection("monthly_production_costs")
        .where("tenantId", "==", actor.tenantId).where("month", "==", month);
    const valueQuery = db.collection("cost_center_values")
        .where("tenantId", "==", actor.tenantId).where("month", "==", month);
    const reopenedAt = nowIso();
    const result = await db.runTransaction(async (tx) => {
        const [period, closure, costs, values] = await Promise.all([
            tx.get(periodRef), tx.get(closureRef), tx.get(costQuery), tx.get(valueQuery),
        ]);
        if (period.exists && period.data()?.status === "closed") {
            throw new HttpsError("failed-precondition", "أعد فتح الفترة المحاسبية أولًا ثم أعد فتح فترة التكاليف.");
        }
        if (!closure.exists && costs.docs.every((snap) => snap.data().isClosed !== true)) {
            return { duplicated: true, count: costs.size };
        }
        if (costs.size + values.size > 450) {
            throw new HttpsError("resource-exhausted", "عدد لقطات الشهر كبير لإعادة الفتح الذرية.");
        }
        for (const snap of costs.docs) {
            tx.update(snap.ref, {
                isClosed: false,
                costingStatus: snap.data().preCloseCostingStatus || "provisional",
                reopenedAt,
                reopenedBy: actor.uid,
                snapshotFrozen: false,
            });
        }
        for (const snap of values.docs) {
            tx.update(snap.ref, {
                costingStatus: snap.data().preCloseCostingStatus || "actual",
                reopenedAt,
                reopenedBy: actor.uid,
            });
        }
        if (closure.exists)
            tx.delete(closureRef);
        return { duplicated: false, count: costs.size };
    });
    await writeAccountingAudit(actor, "cost_period_reopened", month, null, {
        month,
        ...result,
    });
    return { ok: true, month, ...result };
}
function normalizeLines(value) {
    if (!Array.isArray(value) || value.length < 2) {
        throw new HttpsError("invalid-argument", "القيد يحتاج سطرين على الأقل.");
    }
    return value.map((raw) => {
        const row = raw;
        const accountCode = String(row.accountCode || "").trim();
        const debit = money(row.debit);
        const credit = money(row.credit);
        if (!accountCode ||
            (debit <= 0 && credit <= 0) ||
            (debit > 0 && credit > 0)) {
            throw new HttpsError("invalid-argument", "كل سطر يجب أن يحتوي حسابًا وطرفًا مدينًا أو دائنًا فقط.");
        }
        return {
            accountCode,
            accountName: String(row.accountName || "").trim(),
            debit,
            credit,
            costCenterId: String(row.costCenterId || "").trim() || null,
            costObjectType: ["production_report", "work_order", "repair_job"].includes(String(row.costObjectType || ""))
                ? String(row.costObjectType)
                : null,
            costObjectId: String(row.costObjectId || "").trim() || null,
            productId: String(row.productId || "").trim() || null,
            workOrderId: String(row.workOrderId || "").trim() || null,
            description: String(row.description || "").trim(),
        };
    });
}
async function validatePostingLines(actor, lines, requireCostCenter) {
    const accountSnaps = await Promise.all(lines.map((line) => db
        .collection("accounting_accounts")
        .doc(accountId(actor.tenantId, line.accountCode))
        .get()));
    accountSnaps.forEach((snap, index) => {
        if (!snap.exists ||
            snap.data()?.isActive === false ||
            snap.data()?.allowPosting === false ||
            String(snap.data()?.tenantId || "") !== actor.tenantId) {
            throw new HttpsError("failed-precondition", `الحساب ${lines[index].accountCode} غير صالح للترحيل.`);
        }
        lines[index].accountName = String(snap.data()?.name || lines[index].accountName);
        const accountType = String(snap.data()?.type || "");
        if (requireCostCenter &&
            ["revenue", "expense", "contra_revenue"].includes(accountType) &&
            !lines[index].costCenterId) {
            throw new HttpsError("failed-precondition", `مركز التكلفة مطلوب للحساب ${lines[index].accountCode}.`);
        }
    });
    const centerIds = Array.from(new Set(lines.map((line) => String(line.costCenterId || "")).filter(Boolean)));
    const centerSnaps = await Promise.all(centerIds.map((id) => db.collection("cost_centers").doc(id).get()));
    centerSnaps.forEach((snap, index) => {
        if (!snap.exists ||
            String(snap.data()?.tenantId || "") !== actor.tenantId ||
            snap.data()?.isActive === false ||
            snap.data()?.allowPosting === false) {
            throw new HttpsError("failed-precondition", `مركز التكلفة ${centerIds[index]} غير صالح للترحيل.`);
        }
    });
    return accountSnaps;
}
async function postJournal(actor, input) {
    requirePermission(actor, "accounting.journals.post");
    const policy = await accountingPolicy(actor.tenantId);
    if (policy.allowManualJournals === false) {
        throw new HttpsError("failed-precondition", "القيود اليدوية معطلة من إعدادات الحسابات.");
    }
    const date = String(input.date || nowIso().slice(0, 10));
    const period = date.slice(0, 7);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))
        throw new HttpsError("invalid-argument", "تاريخ القيد غير صالح.");
    if (period >= String(policy.cutoverPeriod || DEFAULT_CUTOVER_PERIOD) &&
        policy.openingBalanceStatus !== "approved") {
        throw new HttpsError("failed-precondition", "اعتمد قيد الرصيد الافتتاحي قبل ترحيل قيود فترة القطع.");
    }
    const periodSnap = await db
        .collection("accounting_periods")
        .doc(`${actor.tenantId}__${period}`)
        .get();
    if (policy.enforceOpenPeriods !== false &&
        periodSnap.exists &&
        periodSnap.data()?.status === "closed") {
        throw new HttpsError("failed-precondition", "الفترة المحاسبية مقفلة.");
    }
    const lines = normalizeLines(input.lines);
    const totalDebit = money(lines.reduce((sum, row) => sum + row.debit, 0));
    const totalCredit = money(lines.reduce((sum, row) => sum + row.credit, 0));
    if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.009) {
        throw new HttpsError("invalid-argument", "القيد غير متوازن.");
    }
    await validatePostingLines(actor, lines, policy.requireCostCenter !== false);
    const requestId = String(input.requestId || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 100);
    if (!requestId)
        throw new HttpsError("invalid-argument", "معرف المحاولة مطلوب لمنع تكرار القيد.");
    const ref = db
        .collection("accounting_journal_entries")
        .doc(`${actor.tenantId}__manual__${requestId}`);
    const existing = await ref.get();
    if (existing.exists)
        return { ok: true, id: ref.id, duplicated: true };
    const sequenceRef = db
        .collection("accounting_sequences")
        .doc(`${actor.tenantId}__journal`);
    const result = await db.runTransaction(async (tx) => {
        const [current, sequence] = await Promise.all([
            tx.get(ref),
            tx.get(sequenceRef),
        ]);
        if (current.exists)
            return {
                duplicated: true,
                referenceNo: String(current.data()?.referenceNo || ""),
            };
        const next = Number(sequence.data()?.next || 1);
        const referenceNo = `JV-${period.replace("-", "")}-${String(next).padStart(6, "0")}`;
        tx.set(sequenceRef, { tenantId: actor.tenantId, next: next + 1, updatedAt: nowIso() }, { merge: true });
        tx.create(ref, {
            tenantId: actor.tenantId,
            source: "manual_journal",
            sourceId: requestId,
            referenceNo,
            date,
            period,
            description: String(input.description || "").trim() || "قيد يومية يدوي",
            status: "posted",
            lines,
            totalDebit,
            totalCredit,
            postedAt: nowIso(),
            createdAt: nowIso(),
            createdBy: actor.uid,
            createdByName: actor.name,
        });
        return { duplicated: false, referenceNo };
    });
    await writeAccountingAudit(actor, "journal_posted", ref.id, null, {
        ...result,
        date,
        totalDebit,
        totalCredit,
    });
    return { ok: true, id: ref.id, ...result };
}
async function postOpeningBalance(actor, input) {
    requirePermission(actor, "accounting.journals.post");
    const policy = await accountingPolicy(actor.tenantId);
    const period = String(policy.cutoverPeriod || DEFAULT_CUTOVER_PERIOD);
    if (policy.openingBalanceStatus === "approved") {
        return {
            ok: true,
            id: String(policy.openingBalanceJournalId || `${actor.tenantId}__opening__${period}`),
            duplicated: true,
        };
    }
    const lines = normalizeLines(input.lines);
    const totalDebit = money(lines.reduce((sum, row) => sum + row.debit, 0));
    const totalCredit = money(lines.reduce((sum, row) => sum + row.credit, 0));
    if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.009) {
        throw new HttpsError("invalid-argument", "قيد الرصيد الافتتاحي غير متوازن.");
    }
    const accountSnaps = await validatePostingLines(actor, lines, false);
    accountSnaps.forEach((snap) => {
        if (!["asset", "liability", "equity"].includes(String(snap.data()?.type || ""))) {
            throw new HttpsError("failed-precondition", "الرصيد الافتتاحي يقبل حسابات المركز المالي فقط.");
        }
    });
    const ref = db
        .collection("accounting_journal_entries")
        .doc(`${actor.tenantId}__opening__${period}`);
    const settingsRef = db.collection("accounting_settings").doc(actor.tenantId);
    await db.runTransaction(async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists)
            return;
        tx.create(ref, {
            tenantId: actor.tenantId,
            source: "opening_balance",
            sourceId: period,
            referenceNo: `OB-${period.replace("-", "")}`,
            date: `${period}-01`,
            period,
            description: String(input.description || "").trim() || "رصيد افتتاحي معتمد",
            status: "posted",
            immutable: true,
            lines,
            totalDebit,
            totalCredit,
            postedAt: nowIso(),
            createdAt: nowIso(),
            createdBy: actor.uid,
            createdByName: actor.name,
        });
        tx.set(settingsRef, {
            tenantId: actor.tenantId,
            cutoverPeriod: period,
            openingBalanceStatus: "approved",
            openingBalanceJournalId: ref.id,
            openingBalanceApprovedAt: nowIso(),
            openingBalanceApprovedBy: actor.uid,
        }, { merge: true });
    });
    await writeAccountingAudit(actor, "opening_balance_approved", ref.id, null, {
        period,
        totalDebit,
        totalCredit,
    });
    return { ok: true, id: ref.id };
}
async function reverseJournal(actor, input) {
    requirePermission(actor, "accounting.journals.reverse");
    const policy = await accountingPolicy(actor.tenantId);
    if (policy.allowJournalReversal === false) {
        throw new HttpsError("failed-precondition", "عكس القيود معطل من الإعدادات.");
    }
    const journalId = String(input.journalId || "").trim();
    const reason = String(input.reason || "").trim();
    if (!journalId || reason.length < 3)
        throw new HttpsError("invalid-argument", "سبب العكس مطلوب.");
    const originalRef = db
        .collection("accounting_journal_entries")
        .doc(journalId);
    const original = await originalRef.get();
    if (!original.exists ||
        String(original.data()?.tenantId || "") !== actor.tenantId) {
        throw new HttpsError("not-found", "القيد غير موجود.");
    }
    if (String(original.data()?.status || "") !== "posted")
        throw new HttpsError("failed-precondition", "القيد غير قابل للعكس.");
    const period = nowIso().slice(0, 7);
    const periodSnap = await db
        .collection("accounting_periods")
        .doc(`${actor.tenantId}__${period}`)
        .get();
    if (policy.enforceOpenPeriods !== false &&
        periodSnap.exists &&
        periodSnap.data()?.status === "closed")
        throw new HttpsError("failed-precondition", "الفترة الحالية مقفلة.");
    const reversalRef = db
        .collection("accounting_journal_entries")
        .doc(`${actor.tenantId}__reversal__${journalId}`);
    await db.runTransaction(async (tx) => {
        const [current, reversal] = await Promise.all([
            tx.get(originalRef),
            tx.get(reversalRef),
        ]);
        if (reversal.exists)
            return;
        if (!current.exists || current.data()?.status !== "posted")
            throw new HttpsError("failed-precondition", "تغيرت حالة القيد.");
        const lines = (Array.isArray(current.data()?.lines) ? current.data()?.lines : []).map((raw) => ({
            ...raw,
            debit: money(raw.credit),
            credit: money(raw.debit),
        }));
        tx.create(reversalRef, {
            ...current.data(),
            source: "journal_reversal",
            sourceId: journalId,
            referenceNo: `REV-${String(current.data()?.referenceNo || journalId)}`,
            date: nowIso().slice(0, 10),
            period,
            description: `عكس: ${reason}`,
            lines,
            reversedJournalId: journalId,
            createdAt: nowIso(),
            postedAt: nowIso(),
            createdBy: actor.uid,
            createdByName: actor.name,
        });
        tx.update(originalRef, {
            status: "reversed",
            reversedAt: nowIso(),
            reversedBy: actor.uid,
            reversalJournalId: reversalRef.id,
            reversalReason: reason,
        });
    });
    await writeAccountingAudit(actor, "journal_reversed", journalId, original.data(), {
        reversalJournalId: reversalRef.id,
        reason,
    });
    return { ok: true, id: reversalRef.id };
}
async function inventoryValuation(actor) {
    requirePermission(actor, "accounting.inventory.view");
    const [stockSnap, materialSnap, productSnap, warehouseSnap] = await Promise.all([
        db
            .collection("stock_items")
            .where("tenantId", "==", actor.tenantId)
            .get(),
        db.collection("materials").where("tenantId", "==", actor.tenantId).get(),
        db.collection("products").where("tenantId", "==", actor.tenantId).get(),
        db.collection("warehouses").where("tenantId", "==", actor.tenantId).get(),
    ]);
    const costs = new Map();
    materialSnap.docs.forEach((snap) => {
        const row = snap.data();
        const cost = money(row.purchaseCost);
        costs.set(`material__${snap.id}`, cost);
        if (row.legacyRawMaterialId)
            costs.set(`raw_material__${row.legacyRawMaterialId}`, cost);
    });
    productSnap.docs.forEach((snap) => {
        const row = snap.data();
        costs.set(`finished_good__${snap.id}`, money(row.unitCost || row.chineseUnitCost));
        costs.set(`semi_finished__${snap.id}`, money(row.unitCost || row.chineseUnitCost));
    });
    const warehouseNames = new Map(warehouseSnap.docs.map((snap) => [
        snap.id,
        String(snap.data().name || snap.id),
    ]));
    const rows = stockSnap.docs
        .map((snap) => {
        const row = snap.data();
        const quantity = Number(row.quantity || 0);
        const unitCost = costs.get(`${String(row.itemType)}__${String(row.itemId)}`) || 0;
        return {
            id: snap.id,
            warehouseId: String(row.warehouseId || ""),
            warehouseName: String(row.warehouseName ||
                warehouseNames.get(String(row.warehouseId || "")) ||
                ""),
            itemType: String(row.itemType || ""),
            itemId: String(row.itemId || ""),
            itemName: String(row.itemName || ""),
            itemCode: String(row.itemCode || ""),
            quantity,
            unitCost,
            value: money(quantity * unitCost),
            costKnown: unitCost > 0,
        };
    })
        .filter((row) => row.quantity !== 0);
    const byWarehouse = new Map();
    rows.forEach((row) => {
        const current = byWarehouse.get(row.warehouseId) || {
            warehouseId: row.warehouseId,
            warehouseName: row.warehouseName,
            quantity: 0,
            value: 0,
            lines: 0,
            unknownCostLines: 0,
        };
        current.quantity += row.quantity;
        current.value = money(current.value + row.value);
        current.lines += 1;
        if (!row.costKnown)
            current.unknownCostLines += 1;
        byWarehouse.set(row.warehouseId, current);
    });
    return {
        ok: true,
        rows: rows.slice(0, 2000),
        warehouses: Array.from(byWarehouse.values()),
        totalValue: money(rows.reduce((sum, row) => sum + row.value, 0)),
        unknownCostLines: rows.filter((row) => !row.costKnown).length,
        asOf: nowIso(),
    };
}
const REPAIR_ACCOUNT_KEYS = [
    "cash",
    "card",
    "bankTransfer",
    "customerDeposits",
    "receivables",
    "serviceRevenue",
    "partsRevenue",
    "discounts",
    "warrantyAllowances",
    "partsInventory",
    "partsCogs",
];
const DEFAULT_REPAIR_ACCOUNT_MAP = {
    cash: "111001",
    card: "111002",
    bankTransfer: "111003",
    customerDeposits: "211001",
    receivables: "113001",
    serviceRevenue: "411001",
    partsRevenue: "412001",
    discounts: "419001",
    warrantyAllowances: "419003",
    partsInventory: "131001",
    partsCogs: "511001",
};
const REPAIR_ACCOUNT_TYPES = {
    cash: "asset",
    card: "asset",
    bankTransfer: "asset",
    customerDeposits: "liability",
    receivables: "asset",
    serviceRevenue: "revenue",
    partsRevenue: "revenue",
    discounts: "contra_revenue",
    warrantyAllowances: "contra_revenue",
    partsInventory: "asset",
    partsCogs: "expense",
};
async function accountingReadiness(actor) {
    requirePermission(actor, "accounting.view");
    const [branches, centers, accounts] = await Promise.all([
        db
            .collection("repair_branches")
            .where("tenantId", "==", actor.tenantId)
            .get(),
        db.collection("cost_centers").where("tenantId", "==", actor.tenantId).get(),
        db
            .collection("accounting_accounts")
            .where("tenantId", "==", actor.tenantId)
            .get(),
    ]);
    const postingAccountsByCode = new Map(accounts.docs
        .filter((snap) => snap.data().isActive !== false && snap.data().allowPosting !== false)
        .map((snap) => [String(snap.data().code || "").trim(), snap.data()])
        .filter(([code]) => Boolean(code)));
    const activeCenterIds = new Set(centers.docs
        .filter((snap) => snap.data().isActive !== false)
        .map((snap) => snap.id));
    return {
        ok: true,
        repairBranches: branches.docs.map((snap) => {
            const row = snap.data();
            const map = (row.accountingAccounts || {});
            const resolvedMap = Object.fromEntries(REPAIR_ACCOUNT_KEYS.map((key) => [
                key,
                String(map[key] || DEFAULT_REPAIR_ACCOUNT_MAP[key]),
            ]));
            const missingAccountKeys = REPAIR_ACCOUNT_KEYS.filter((key) => {
                const persistedCode = String(map[key] || "").trim();
                const account = postingAccountsByCode.get(persistedCode);
                return !persistedCode || !account || account.type !== REPAIR_ACCOUNT_TYPES[key];
            });
            const costCenterId = String(row.costCenterId || "");
            return {
                id: snap.id,
                name: String(row.name || ""),
                code: String(row.code || ""),
                isActive: row.isActive !== false,
                costCenterId,
                accountingAccounts: resolvedMap,
                missingAccountKeys,
                ready: activeCenterIds.has(costCenterId) && missingAccountKeys.length === 0,
            };
        }),
        defaultRepairAccountingAccounts: DEFAULT_REPAIR_ACCOUNT_MAP,
        costCenters: centers.docs.map((snap) => ({
            id: snap.id,
            name: String(snap.data().name || ""),
            code: String(snap.data().code || ""),
            type: String(snap.data().type || "direct"),
            accountingCategory: String(snap.data().accountingCategory || "production"),
            parentId: String(snap.data().parentId || ""),
            allowPosting: snap.data().allowPosting !== false,
            productionCostingEnabled: snap.data().productionCostingEnabled !== false,
            isActive: snap.data().isActive !== false,
        })),
    };
}
/** Link a repair branch to a cost center and default (or overridden) GL accounts. */
export async function applyRepairBranchAccountingLink(params) {
    const tenantId = String(params.tenantId || "").trim();
    const uid = String(params.uid || "").trim();
    const branchId = String(params.branchId || "").trim();
    const costCenterId = String(params.costCenterId || "").trim();
    if (!tenantId || !uid) {
        throw new HttpsError("unauthenticated", "يجب تسجيل الدخول.");
    }
    if (!branchId || !costCenterId) {
        throw new HttpsError("invalid-argument", "اختر فرع الصيانة ومركز التكلفة. الحسابات تُملأ تلقائيًا من الشجرة الافتراضية.");
    }
    await ensureDefaultAccounts({ tenantId, uid });
    const branchRef = db.collection("repair_branches").doc(branchId);
    const centerRef = db.collection("cost_centers").doc(costCenterId);
    const [branch, center] = await Promise.all([branchRef.get(), centerRef.get()]);
    if (!branch.exists || String(branch.data()?.tenantId || "") !== tenantId) {
        throw new HttpsError("not-found", "فرع الصيانة غير موجود.");
    }
    if (!center.exists ||
        String(center.data()?.tenantId || "") !== tenantId ||
        center.data()?.isActive === false) {
        throw new HttpsError("failed-precondition", "مركز التكلفة غير صالح.");
    }
    const inputMap = params.accountingAccounts && typeof params.accountingAccounts === "object"
        ? params.accountingAccounts
        : {};
    /** Default: use system map. Explicit overrides only when valid posting accounts. */
    const useDefaultAccounts = params.useDefaultAccounts !== false;
    const candidateCodes = Object.fromEntries(REPAIR_ACCOUNT_KEYS.map((key) => {
        const override = String(inputMap[key] || "").trim();
        const fallback = DEFAULT_REPAIR_ACCOUNT_MAP[key];
        return [key, useDefaultAccounts ? fallback : override || fallback];
    }));
    if (params.useDefaultAccounts === false) {
        for (const key of REPAIR_ACCOUNT_KEYS) {
            const override = String(inputMap[key] || "").trim();
            if (override)
                candidateCodes[key] = override;
        }
    }
    const accountSnaps = await Promise.all(REPAIR_ACCOUNT_KEYS.map((key) => db
        .collection("accounting_accounts")
        .doc(accountId(tenantId, candidateCodes[key]))
        .get()));
    const resolvedCodes = {};
    for (let index = 0; index < REPAIR_ACCOUNT_KEYS.length; index += 1) {
        const key = REPAIR_ACCOUNT_KEYS[index];
        const snap = accountSnaps[index];
        const data = snap.data();
        const valid = snap.exists &&
            data?.isActive !== false &&
            data?.allowPosting !== false &&
            data?.type === REPAIR_ACCOUNT_TYPES[key];
        if (valid) {
            resolvedCodes[key] = candidateCodes[key];
            continue;
        }
        const defaultCode = DEFAULT_REPAIR_ACCOUNT_MAP[key];
        if (candidateCodes[key] !== defaultCode) {
            const fallbackSnap = await db
                .collection("accounting_accounts")
                .doc(accountId(tenantId, defaultCode))
                .get();
            const fallback = fallbackSnap.data();
            if (fallbackSnap.exists &&
                fallback?.isActive !== false &&
                fallback?.allowPosting !== false &&
                fallback?.type === REPAIR_ACCOUNT_TYPES[key]) {
                resolvedCodes[key] = defaultCode;
                continue;
            }
        }
        throw new HttpsError("failed-precondition", `تعذر ربط حساب «${key}». استكمل الشجرة الافتراضية ثم أعد المحاولة.`);
    }
    await branchRef.update({
        costCenterId,
        accountingAccounts: resolvedCodes,
        accountingReadyAt: nowIso(),
        accountingReadyBy: uid,
        updatedAt: nowIso(),
    });
    return {
        ok: true,
        branchId,
        costCenterId,
        accountingAccounts: resolvedCodes,
        usedDefaults: useDefaultAccounts,
    };
}
async function linkRepairBranch(actor, input) {
    requirePermission(actor, "accounting.settings.manage");
    return applyRepairBranchAccountingLink({
        tenantId: actor.tenantId,
        uid: actor.uid,
        branchId: String(input.branchId || "").trim(),
        costCenterId: String(input.costCenterId || "").trim(),
        accountingAccounts: input.accountingAccounts && typeof input.accountingAccounts === "object"
            ? input.accountingAccounts
            : undefined,
        useDefaultAccounts: input.useDefaultAccounts !== false,
    });
}
export async function mutateAccountingHandler(request) {
    const actor = await actorFromRequest(request);
    const input = (request.data || {});
    const operation = String(input.operation || "");
    switch (operation) {
        case "seed_defaults":
            return seedDefaults(actor);
        case "upsert_account":
            return upsertAccount(actor, input);
        case "save_settings":
            return saveSettings(actor, input);
        case "save_costing_policy":
            return saveCostingPolicy(actor, input);
        case "upsert_cost_center":
            return upsertCostCenter(actor, input);
        case "upsert_production_cost_center":
            return upsertProductionCostCenter(actor, input);
        case "deactivate_production_cost_center":
            return deactivateProductionCostCenter(actor, input);
        case "close_cost_period":
            return closeCostPeriod(actor, input);
        case "reopen_cost_period":
            return reopenCostPeriod(actor, input);
        case "set_period":
            return setPeriod(actor, input);
        case "post_journal":
            return postJournal(actor, input);
        case "post_opening_balance":
            return postOpeningBalance(actor, input);
        case "reverse_journal":
            return reverseJournal(actor, input);
        case "readiness":
            return accountingReadiness(actor);
        case "link_repair_branch":
            return linkRepairBranch(actor, input);
        case "inventory_valuation":
            return inventoryValuation(actor);
        default:
            throw new HttpsError("invalid-argument", "عملية الحسابات غير معروفة.");
    }
}
