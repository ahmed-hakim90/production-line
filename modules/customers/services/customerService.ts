import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  runTransaction,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  onSnapshot,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Unsubscribe,
  documentId,
} from 'firebase/firestore';
import { isConfigured, db } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import { tenantQuery } from '@/lib/tenantFirestore';
import { activityLogService } from '@/services/activityLogService';
import {
  allocateNextSequentialSuffixInTransaction,
  buildEntityCodeClaimId,
  ENTITY_CODE_CLAIMS_COLLECTION,
  isDuplicateEntityCodeError,
  throwDuplicateEntityCode,
} from '@/modules/shared/services/entityCodeSequenceService';
import {
  CUSTOMERS_COLLECTIONS,
  CUSTOMER_ENTITY_TYPE,
  customerDocRef,
} from '../collections';
import {
  buildCustomerPhoneDigits,
  customerCodePrefixForType,
  maxCustomerSeqFromCodes,
  normalizeCustomerCode,
} from '../lib/customerCode';
import { classifyCustomerSizeTier, isCustomerSizeTier } from '../lib/customerSizeTier';
import {
  chunkCustomerImportRows,
  CUSTOMER_IMPORT_CREATE_CHUNK,
  CUSTOMER_IMPORT_UPDATE_CHUNK,
  partitionCustomerImportWriteRows,
  type CustomerImportWriteRow,
} from '../lib/customerImportBatch';
import type {
  Customer,
  CustomerCreateInput,
  CustomerFollowUpInput,
  CustomerFollowUpStatus,
  CustomerMetricsInput,
  CustomerUpdateInput,
  CustomerType,
} from '../types';
import { CUSTOMER_FOLLOW_UP_LABELS, isCustomerFollowUpStatus } from '../types';
import { customerActivityService } from './customerActivityService';
import { buildSearchPrefixes, normalizeFirestoreSearch } from '@/lib/firestoreSearch';

const CUSTOMER_CODE_PADDING = 5;
/** Total rows listAll will fetch across pages (import / KPI / lists). */
const LIST_SOFT_CAP = 12_000;
/** Firestore rejects structured-query limit values above 10_000. */
const FIRESTORE_QUERY_LIMIT_MAX = 10_000;

const stripUndefined = <T extends Record<string, unknown>>(obj: T): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

function customerClaimRef(tenantId: string, code: string) {
  return doc(db, ENTITY_CODE_CLAIMS_COLLECTION, buildEntityCodeClaimId(tenantId, CUSTOMER_ENTITY_TYPE, code));
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : undefined;
}

function normalizeFollowUpStatus(value: unknown): CustomerFollowUpStatus {
  return isCustomerFollowUpStatus(value) ? value : 'none';
}

function normalizeCustomerDoc(id: string, data: Record<string, unknown>): Customer {
  const phone = String(data.phone || '');
  const businessVolume = parseOptionalNumber(data.businessVolume);
  const balance = parseOptionalNumber(data.balance);
  const sizeTier = isCustomerSizeTier(data.sizeTier)
    ? data.sizeTier
    : classifyCustomerSizeTier(businessVolume);
  return {
    id,
    tenantId: String(data.tenantId || ''),
    code: String(data.code || ''),
    type: (data.type === 'trader' ? 'trader' : 'consumer') as CustomerType,
    name: String(data.name || ''),
    phone,
    phoneDigits: String(data.phoneDigits || buildCustomerPhoneDigits(phone)),
    address: data.address != null ? String(data.address) : undefined,
    notes: data.notes != null ? String(data.notes) : undefined,
    isActive: data.isActive !== false,
    businessVolume,
    balance,
    sizeTier,
    followUpStatus: normalizeFollowUpStatus(data.followUpStatus),
    followUpNotes: data.followUpNotes != null ? String(data.followUpNotes) : undefined,
    metricsUpdatedAt: data.metricsUpdatedAt != null ? String(data.metricsUpdatedAt) : undefined,
    createdAt: String(data.createdAt || ''),
    updatedAt: String(data.updatedAt || ''),
    createdBy: data.createdBy != null ? String(data.createdBy) : undefined,
    createdByName: data.createdByName != null ? String(data.createdByName) : undefined,
    updatedBy: data.updatedBy != null ? String(data.updatedBy) : undefined,
    updatedByName: data.updatedByName != null ? String(data.updatedByName) : undefined,
  };
}

function validateCreateInput(input: CustomerCreateInput): void {
  if (!String(input.name || '').trim()) throw new Error('اسم العميل مطلوب.');
  if (input.type !== 'consumer' && input.type !== 'trader') {
    throw new Error('نوع العميل غير صالح. اختر مستهلك أو تاجر.');
  }
}

function toUserError(error: unknown): never {
  if (isDuplicateEntityCodeError(error)) {
    throw new Error('كود العميل مستخدم مسبقًا.');
  }
  throw error;
}

export const customerService = {
  isDuplicateCodeError: isDuplicateEntityCodeError,

  async listAll(opts?: { includeInactive?: boolean; max?: number }): Promise<Customer[]> {
    if (!isConfigured) return [];
    const max = Math.max(1, Math.min(Number(opts?.max ?? LIST_SOFT_CAP) || LIST_SOFT_CAP, LIST_SOFT_CAP));
    const rows: Customer[] = [];
    let cursor: QueryDocumentSnapshot | null = null;

    while (rows.length < max) {
      const pageSize = Math.min(FIRESTORE_QUERY_LIMIT_MAX, max - rows.length);
      const constraints: QueryConstraint[] = [orderBy('code', 'asc'), limit(pageSize)];
      if (cursor) constraints.push(startAfter(cursor));
      const snap = await getDocs(tenantQuery(db, CUSTOMERS_COLLECTIONS.CUSTOMERS, ...constraints));
      if (snap.empty) break;
      for (const d of snap.docs) {
        rows.push(normalizeCustomerDoc(d.id, d.data() as Record<string, unknown>));
      }
      cursor = snap.docs[snap.docs.length - 1] ?? null;
      if (snap.docs.length < pageSize) break;
    }

    if (opts?.includeInactive) return rows;
    return rows.filter((r) => r.isActive !== false);
  },

  async listPaged(params: {
    pageSize?: 20 | 50;
    cursor?: QueryDocumentSnapshot | null;
    search?: string;
    type?: CustomerType | 'all';
    status?: 'active' | 'inactive' | 'all';
  } = {}): Promise<{ items: Customer[]; nextCursor: QueryDocumentSnapshot | null; hasNext: boolean }> {
    if (!isConfigured) return { items: [], nextCursor: null, hasNext: false };
    const pageSize = params.pageSize === 50 ? 50 : 20;
    const constraints: QueryConstraint[] = [];
    const search = normalizeFirestoreSearch(params.search);
    if (search.length >= 2) constraints.push(where('searchPrefixes', 'array-contains', search));
    if (params.type && params.type !== 'all') constraints.push(where('type', '==', params.type));
    if (params.status === 'active') constraints.push(where('isActive', '==', true));
    if (params.status === 'inactive') constraints.push(where('isActive', '==', false));
    constraints.push(orderBy('code', 'asc'), orderBy(documentId()));
    if (params.cursor) constraints.push(startAfter(params.cursor));
    constraints.push(limit(pageSize + 1));
    const snap = await getDocs(tenantQuery(db, CUSTOMERS_COLLECTIONS.CUSTOMERS, ...constraints));
    const hasNext = snap.docs.length > pageSize;
    const docs = hasNext ? snap.docs.slice(0, pageSize) : snap.docs;
    return {
      items: docs.map((row) => normalizeCustomerDoc(row.id, row.data() as Record<string, unknown>)),
      nextCursor: docs.length > 0 ? docs[docs.length - 1]! : null,
      hasNext,
    };
  },

  async getById(id: string): Promise<Customer | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(customerDocRef(id));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    if (String(data.tenantId || '') !== getCurrentTenantId()) return null;
    return normalizeCustomerDoc(snap.id, data);
  },

  async getByCode(code: string): Promise<Customer | null> {
    if (!isConfigured) return null;
    const normalized = normalizeCustomerCode(code);
    if (!normalized) return null;
    const q = tenantQuery(
      db,
      CUSTOMERS_COLLECTIONS.CUSTOMERS,
      where('code', '==', normalized),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const first = snap.docs[0];
    return normalizeCustomerDoc(first.id, first.data() as Record<string, unknown>);
  },

  async findByPhoneDigits(phoneDigits: string, max = 20): Promise<Customer[]> {
    if (!isConfigured) return [];
    const digits = buildCustomerPhoneDigits(phoneDigits);
    if (digits.length < 7) return [];
    const q = tenantQuery(
      db,
      CUSTOMERS_COLLECTIONS.CUSTOMERS,
      where('phoneDigits', '==', digits),
      limit(max),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalizeCustomerDoc(d.id, d.data() as Record<string, unknown>));
  },

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    if (!isConfigured) return false;
    const want = normalizeCustomerCode(code);
    if (!want) return false;
    const tenantId = getCurrentTenantId();
    const claimSnap = await getDoc(customerClaimRef(tenantId, want));
    if (claimSnap.exists()) {
      const ownerId = String(claimSnap.data()?.ownerId || '');
      if (!excludeId || ownerId !== excludeId) return true;
    }
    const existing = await this.getByCode(want);
    if (!existing?.id) return false;
    if (excludeId && existing.id === excludeId) return false;
    return true;
  },

  async create(input: CustomerCreateInput): Promise<Customer> {
    if (!isConfigured) throw new Error('النظام غير متصل.');
    validateCreateInput(input);
    const tenantId = getCurrentTenantId();
    const now = new Date().toISOString();
    const phone = String(input.phone || '').trim();
    const phoneDigits = buildCustomerPhoneDigits(phone);

    const explicitCode = normalizeCustomerCode(input.code || '');
    const customerRef = doc(collection(db, CUSTOMERS_COLLECTIONS.CUSTOMERS));

    const finishCreate = (code: string): Customer => {
      const created: Customer = {
        id: customerRef.id,
        tenantId,
        code,
        type: input.type,
        name: String(input.name).trim(),
        phone,
        phoneDigits,
        address: input.address?.trim() || '',
        notes: input.notes?.trim() || '',
        isActive: input.isActive !== false,
        followUpStatus: 'none',
        createdAt: now,
        updatedAt: now,
        createdBy: input.createdBy || '',
        createdByName: input.createdByName || '',
      };
      void customerActivityService.record({
        customerId: customerRef.id,
        module: 'customers',
        action: 'customer.created',
        title: 'إنشاء عميل',
        summary: `${created.code} — ${created.name}`,
        actorUid: input.createdBy,
        actorName: input.createdByName,
      }).catch(() => undefined);
      void activityLogService.logCurrentUser('CUSTOMER_CREATE', 'إنشاء عميل', {
        customerId: customerRef.id,
        code: created.code,
        type: created.type,
      }).catch(() => undefined);
      return created;
    };

    try {
      if (explicitCode) {
        if (await this.isCodeTaken(explicitCode)) throwDuplicateEntityCode();
        await runTransaction(db, async (tx) => {
          const claimRef = customerClaimRef(tenantId, explicitCode);
          const claimSnap = await tx.get(claimRef);
          if (claimSnap.exists()) throwDuplicateEntityCode();
          tx.set(claimRef, {
            tenantId,
            entityType: CUSTOMER_ENTITY_TYPE,
            code: explicitCode,
            ownerId: customerRef.id,
            ownerCollection: CUSTOMERS_COLLECTIONS.CUSTOMERS,
            createdAt: now,
          });
          tx.set(
            customerRef,
            stripUndefined({
              tenantId,
              code: explicitCode,
              type: input.type,
              name: String(input.name).trim(),
              phone,
              phoneDigits,
              searchPrefixes: buildSearchPrefixes([input.name, explicitCode, phone, phoneDigits]),
              address: input.address?.trim() || '',
              notes: input.notes?.trim() || '',
              isActive: input.isActive !== false,
              createdAt: now,
              updatedAt: now,
              createdBy: input.createdBy || '',
              createdByName: input.createdByName || '',
            }),
          );
        });
        return finishCreate(explicitCode);
      }

      const prefix = customerCodePrefixForType(input.type);
      const counterKey = `customer_${input.type}`;
      const counterRef = doc(db, 'entity_code_counters', `${tenantId}_${counterKey}`);
      const counterSnap = await getDoc(counterRef);
      // Only scan existing codes when the counter is missing (first create for this type).
      const seedMax = counterSnap.exists()
        ? 0
        : maxCustomerSeqFromCodes(
            (await this.listAll({ includeInactive: true, max: 2000 })).map((c) => c.code),
            prefix,
          );
      let allocatedCode = '';
      await runTransaction(db, async (tx) => {
        const allocated = await allocateNextSequentialSuffixInTransaction(
          tx,
          counterKey,
          prefix,
          CUSTOMER_CODE_PADDING,
          async () => seedMax,
          async (nextCode, transaction) => {
            const claimRef = customerClaimRef(tenantId, nextCode);
            const claim = await transaction.get(claimRef);
            if (claim.exists()) throwDuplicateEntityCode();
            transaction.set(claimRef, {
              tenantId,
              entityType: CUSTOMER_ENTITY_TYPE,
              code: nextCode,
              ownerId: customerRef.id,
              ownerCollection: CUSTOMERS_COLLECTIONS.CUSTOMERS,
              createdAt: now,
            });
          },
        );
        allocatedCode = allocated;
        tx.set(
          customerRef,
          stripUndefined({
            tenantId,
            code: allocated,
            type: input.type,
            name: String(input.name).trim(),
            phone,
            phoneDigits,
            searchPrefixes: buildSearchPrefixes([input.name, allocated, phone, phoneDigits]),
            address: input.address?.trim() || '',
            notes: input.notes?.trim() || '',
            isActive: input.isActive !== false,
            createdAt: now,
            updatedAt: now,
            createdBy: input.createdBy || '',
            createdByName: input.createdByName || '',
          }),
        );
      });
      return finishCreate(allocatedCode);
    } catch (error) {
      toUserError(error);
    }
  },

  async update(id: string, input: CustomerUpdateInput): Promise<Customer> {
    if (!isConfigured || !id) throw new Error('معرّف العميل غير صالح.');
    const existing = await this.getById(id);
    if (!existing) throw new Error('العميل غير موجود.');

    const tenantId = getCurrentTenantId();
    const now = new Date().toISOString();
    const nextCode =
      input.code !== undefined ? normalizeCustomerCode(input.code) : existing.code;
    if (!nextCode) throw new Error('كود العميل مطلوب.');

    const nextPhone = input.phone !== undefined ? String(input.phone).trim() : existing.phone;
    const phoneDigits = buildCustomerPhoneDigits(nextPhone);

    const nextType = input.type ?? existing.type;
    if (nextType !== 'consumer' && nextType !== 'trader') {
      throw new Error('نوع العميل غير صالح.');
    }
    const nextName = input.name !== undefined ? String(input.name).trim() : existing.name;
    if (!nextName) throw new Error('اسم العميل مطلوب.');

    const codeChanged = nextCode !== existing.code;
    if (codeChanged && (await this.isCodeTaken(nextCode, id))) throwDuplicateEntityCode();

    const patch = stripUndefined({
      code: nextCode,
      type: nextType,
      name: nextName,
      phone: nextPhone,
      phoneDigits,
      searchPrefixes: buildSearchPrefixes([nextName, nextCode, nextPhone, phoneDigits]),
      address: input.address !== undefined ? String(input.address).trim() : existing.address || '',
      notes: input.notes !== undefined ? String(input.notes).trim() : existing.notes || '',
      isActive: input.isActive !== undefined ? input.isActive !== false : existing.isActive,
      updatedAt: now,
      updatedBy: input.updatedBy || '',
      updatedByName: input.updatedByName || '',
    });

    try {
      if (!codeChanged) {
        await updateDoc(customerDocRef(id), patch);
      } else {
        await runTransaction(db, async (tx) => {
          const newClaimRef = customerClaimRef(tenantId, nextCode);
          const oldClaimRef = customerClaimRef(tenantId, existing.code);
          const newClaim = await tx.get(newClaimRef);
          if (newClaim.exists()) {
            const ownerId = String(newClaim.data()?.ownerId || '');
            if (ownerId !== id) throwDuplicateEntityCode();
          } else {
            tx.set(newClaimRef, {
              tenantId,
              entityType: CUSTOMER_ENTITY_TYPE,
              code: nextCode,
              ownerId: id,
              ownerCollection: CUSTOMERS_COLLECTIONS.CUSTOMERS,
              createdAt: now,
            });
          }
          const oldClaim = await tx.get(oldClaimRef);
          if (oldClaim.exists()) {
            const ownerId = String(oldClaim.data()?.ownerId || '');
            if (!ownerId || ownerId === id) tx.delete(oldClaimRef);
          }
          tx.update(customerDocRef(id), patch);
        });
      }
    } catch (error) {
      toUserError(error);
    }

    const updated = await this.getById(id);
    if (!updated) throw new Error('تعذر قراءة العميل بعد التحديث.');

    await customerActivityService.record({
      customerId: id,
      module: 'customers',
      action: 'customer.updated',
      title: 'تحديث بيانات العميل',
      summary: `${updated.code} — ${updated.name}`,
      actorUid: input.updatedBy,
      actorName: input.updatedByName,
    });

    await activityLogService.logCurrentUser('CUSTOMER_UPDATE', 'تحديث عميل', {
      customerId: id,
      code: updated.code,
    });

    return updated;
  },

  async upsertByCode(
    input: CustomerCreateInput & { code: string },
    actor?: { userId?: string; userName?: string },
  ): Promise<{ id: string; created: boolean }> {
    const code = normalizeCustomerCode(input.code);
    if (!code) throw new Error('كود العميل مطلوب للاستيراد.');
    const existing = await this.getByCode(code);
    if (existing?.id) {
      await this.update(existing.id, {
        type: input.type,
        name: input.name,
        phone: input.phone,
        address: input.address,
        notes: input.notes,
        isActive: input.isActive,
        updatedBy: actor?.userId,
        updatedByName: actor?.userName,
      });
      return { id: existing.id, created: false };
    }
    const created = await this.create({
      ...input,
      code,
      createdBy: actor?.userId,
      createdByName: actor?.userName,
    });
    return { id: String(created.id), created: true };
  },

  /**
   * Bulk Excel import path: batched writes, skips per-row CRM/activity logs.
   * Prefer `existingId` from the preview pass so updates avoid getByCode round-trips.
   */
  async importUpsertMany(
    rows: CustomerImportWriteRow[],
    actor?: { userId?: string; userName?: string },
    opts?: {
      onProgress?: (processed: number, total: number) => void;
      shouldCancel?: () => boolean;
    },
  ): Promise<{ created: number; updated: number; failed: number }> {
    if (!isConfigured) throw new Error('النظام غير متصل.');
    const total = rows.length;
    if (total === 0) return { created: 0, updated: 0, failed: 0 };

    const tenantId = getCurrentTenantId();
    const now = new Date().toISOString();
    const actorUid = String(actor?.userId || '');
    const actorName = String(actor?.userName || '');
    let created = 0;
    let updated = 0;
    let failed = 0;
    let processed = 0;

    const bump = (n: number) => {
      processed = Math.min(total, processed + n);
      opts?.onProgress?.(processed, total);
    };
    const cancelled = () => Boolean(opts?.shouldCancel?.());

    const { updates, creates } = partitionCustomerImportWriteRows(rows);

    for (const chunk of chunkCustomerImportRows(updates, CUSTOMER_IMPORT_UPDATE_CHUNK)) {
      if (cancelled()) throw new Error('تم إلغاء المهمة.');
      const batch = writeBatch(db);
      const queued: CustomerImportWriteRow[] = [];
      for (const row of chunk) {
        const id = String(row.existingId || '').trim();
        const code = normalizeCustomerCode(row.code);
        const name = String(row.name || '').trim();
        if (!id || !code || !name || (row.type !== 'consumer' && row.type !== 'trader')) {
          failed += 1;
          continue;
        }
        const phone = String(row.phone || '').trim();
        batch.update(
          customerDocRef(id),
          stripUndefined({
            type: row.type,
            name,
            phone,
            phoneDigits: buildCustomerPhoneDigits(phone),
            address: String(row.address || '').trim(),
            notes: String(row.notes || '').trim(),
            isActive: row.isActive !== false,
            updatedAt: now,
            updatedBy: actorUid,
            updatedByName: actorName,
          }),
        );
        queued.push(row);
      }
      if (queued.length > 0) {
        try {
          await batch.commit();
          updated += queued.length;
        } catch (error) {
          console.error('customers import update batch failed; falling back per row', error);
          for (const row of queued) {
            try {
              const phone = String(row.phone || '').trim();
              await updateDoc(
                customerDocRef(String(row.existingId)),
                stripUndefined({
                  type: row.type,
                  name: String(row.name).trim(),
                  phone,
                  phoneDigits: buildCustomerPhoneDigits(phone),
                  address: String(row.address || '').trim(),
                  notes: String(row.notes || '').trim(),
                  isActive: row.isActive !== false,
                  updatedAt: now,
                  updatedBy: actorUid,
                  updatedByName: actorName,
                }),
              );
              updated += 1;
            } catch (rowError) {
              failed += 1;
              console.error('customers import update row failed', row.rowNo, rowError);
            }
          }
        }
      }
      bump(chunk.length);
    }

    for (const chunk of chunkCustomerImportRows(creates, CUSTOMER_IMPORT_CREATE_CHUNK)) {
      if (cancelled()) throw new Error('تم إلغاء المهمة.');

      const prepared: Array<{
        row: CustomerImportWriteRow;
        code: string;
        customerRef: ReturnType<typeof doc>;
        claimRef: ReturnType<typeof doc>;
      }> = [];
      let skippedInvalid = 0;

      for (const row of chunk) {
        const code = normalizeCustomerCode(row.code);
        const name = String(row.name || '').trim();
        if (!code || !name || (row.type !== 'consumer' && row.type !== 'trader')) {
          failed += 1;
          skippedInvalid += 1;
          continue;
        }
        prepared.push({
          row,
          code,
          customerRef: doc(collection(db, CUSTOMERS_COLLECTIONS.CUSTOMERS)),
          claimRef: customerClaimRef(tenantId, code),
        });
      }

      const claimSnaps = await Promise.all(prepared.map((p) => getDoc(p.claimRef)));
      const batch = writeBatch(db);
      const queued: typeof prepared = [];
      let claimConflicts = 0;

      for (let i = 0; i < prepared.length; i += 1) {
        const item = prepared[i];
        if (claimSnaps[i]?.exists()) {
          failed += 1;
          claimConflicts += 1;
          continue;
        }
        const phone = String(item.row.phone || '').trim();
        batch.set(item.claimRef, {
          tenantId,
          entityType: CUSTOMER_ENTITY_TYPE,
          code: item.code,
          ownerId: item.customerRef.id,
          ownerCollection: CUSTOMERS_COLLECTIONS.CUSTOMERS,
          createdAt: now,
        });
        batch.set(
          item.customerRef,
          stripUndefined({
            tenantId,
            code: item.code,
            type: item.row.type,
            name: String(item.row.name).trim(),
            phone,
            phoneDigits: buildCustomerPhoneDigits(phone),
            address: String(item.row.address || '').trim(),
            notes: String(item.row.notes || '').trim(),
            isActive: item.row.isActive !== false,
            createdAt: now,
            updatedAt: now,
            createdBy: actorUid,
            createdByName: actorName,
          }),
        );
        queued.push(item);
      }

      if (queued.length > 0) {
        try {
          await batch.commit();
          created += queued.length;
        } catch (error) {
          console.error('customers import create batch failed; falling back per row', error);
          for (const item of queued) {
            try {
              await this.create({
                code: item.code,
                type: item.row.type,
                name: item.row.name,
                phone: item.row.phone,
                address: item.row.address,
                notes: item.row.notes,
                isActive: item.row.isActive,
                createdBy: actorUid,
                createdByName: actorName,
              });
              created += 1;
            } catch (rowError) {
              failed += 1;
              console.error('customers import create row failed', item.row.rowNo, rowError);
            }
          }
        }
      }

      bump(skippedInvalid + claimConflicts + queued.length);
    }

    try {
      await activityLogService.logCurrentUser('CUSTOMER_IMPORT', 'استيراد عملاء', {
        created,
        updated,
        failed,
        total,
      });
    } catch {
      // Non-blocking — import data already committed.
    }

    return { created, updated, failed };
  },

  /**
   * يحدّث حجم الشغل والرصيد لعميل موجود بالكود — لا ينشئ عميلاً جديداً.
   */
  async applyMetricsByCode(
    code: string,
    input: CustomerMetricsInput,
  ): Promise<Customer> {
    if (!isConfigured) throw new Error('النظام غير متصل.');
    const normalized = normalizeCustomerCode(code);
    if (!normalized) throw new Error('كود العميل مطلوب.');
    if (!Number.isFinite(input.businessVolume) || input.businessVolume < 0) {
      throw new Error('حجم الشغل غير صالح.');
    }
    if (!Number.isFinite(input.balance)) {
      throw new Error('الرصيد غير صالح.');
    }

    const existing = await this.getByCode(normalized);
    if (!existing?.id) throw new Error('العميل غير موجود بهذا الكود.');

    const now = new Date().toISOString();
    const sizeTier = classifyCustomerSizeTier(input.businessVolume);
    await updateDoc(
      customerDocRef(existing.id),
      stripUndefined({
        businessVolume: input.businessVolume,
        balance: input.balance,
        sizeTier,
        metricsUpdatedAt: now,
        updatedAt: now,
        updatedBy: input.updatedBy || '',
        updatedByName: input.updatedByName || '',
      }),
    );

    const updated = await this.getById(existing.id);
    if (!updated) throw new Error('تعذر قراءة العميل بعد تحديث المؤشرات.');

    await customerActivityService.record({
      customerId: existing.id,
      module: 'customers',
      action: 'customer.metrics_imported',
      title: 'تحديث مؤشرات العميل',
      summary: `حجم الشغل ${input.businessVolume} — الرصيد ${input.balance}`,
      actorUid: input.updatedBy,
      actorName: input.updatedByName,
      metadata: {
        businessVolume: input.businessVolume,
        balance: input.balance,
        sizeTier,
      },
    });

    return updated;
  },

  async updateFollowUp(id: string, input: CustomerFollowUpInput): Promise<Customer> {
    if (!isConfigured || !id) throw new Error('معرّف العميل غير صالح.');
    if (!isCustomerFollowUpStatus(input.followUpStatus)) {
      throw new Error('حالة المتابعة غير صالحة.');
    }
    const existing = await this.getById(id);
    if (!existing) throw new Error('العميل غير موجود.');

    const now = new Date().toISOString();
    const notes = String(input.followUpNotes || '').trim();
    await updateDoc(
      customerDocRef(id),
      stripUndefined({
        followUpStatus: input.followUpStatus,
        followUpNotes: notes,
        updatedAt: now,
        updatedBy: input.updatedBy || '',
        updatedByName: input.updatedByName || '',
      }),
    );

    const updated = await this.getById(id);
    if (!updated) throw new Error('تعذر قراءة العميل بعد تحديث المتابعة.');

    const followLabel = CUSTOMER_FOLLOW_UP_LABELS[input.followUpStatus];
    await customerActivityService.record({
      customerId: id,
      module: 'customers',
      action: 'customer.follow_up_updated',
      title: 'تحديث متابعة العميل',
      summary: notes ? `${followLabel} — ${notes.slice(0, 120)}` : followLabel,
      actorUid: input.updatedBy,
      actorName: input.updatedByName,
      metadata: {
        followUpStatus: input.followUpStatus,
      },
    });

    return updated;
  },

  subscribeAll(cb: (rows: Customer[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = tenantQuery(
      db,
      CUSTOMERS_COLLECTIONS.CUSTOMERS,
      orderBy('code', 'asc'),
      limit(FIRESTORE_QUERY_LIMIT_MAX),
    );
    return onSnapshot(
      q,
      (snap) => {
        cb(snap.docs.map((d) => normalizeCustomerDoc(d.id, d.data() as Record<string, unknown>)));
      },
      (error) => {
        console.error('customerService.subscribeAll listener error:', error);
        cb([]);
      },
    );
  },
};
