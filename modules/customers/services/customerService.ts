import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  runTransaction,
  updateDoc,
  where,
  onSnapshot,
  type Unsubscribe,
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
import type { Customer, CustomerCreateInput, CustomerUpdateInput, CustomerType } from '../types';
import { customerActivityService } from './customerActivityService';

const CUSTOMER_CODE_PADDING = 5;
const LIST_SOFT_CAP = 12_000;

const stripUndefined = <T extends Record<string, unknown>>(obj: T): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

function customerClaimRef(tenantId: string, code: string) {
  return doc(db, ENTITY_CODE_CLAIMS_COLLECTION, buildEntityCodeClaimId(tenantId, CUSTOMER_ENTITY_TYPE, code));
}

function normalizeCustomerDoc(id: string, data: Record<string, unknown>): Customer {
  const phone = String(data.phone || '');
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
  if (!String(input.phone || '').trim()) throw new Error('رقم هاتف العميل مطلوب.');
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
    const max = opts?.max ?? LIST_SOFT_CAP;
    const q = tenantQuery(db, CUSTOMERS_COLLECTIONS.CUSTOMERS, orderBy('code', 'asc'), limit(max));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => normalizeCustomerDoc(d.id, d.data() as Record<string, unknown>));
    if (opts?.includeInactive) return rows;
    return rows.filter((r) => r.isActive !== false);
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
    const phone = String(input.phone).trim();
    const phoneDigits = buildCustomerPhoneDigits(phone);
    if (phoneDigits.length < 7) throw new Error('رقم الهاتف غير صالح.');

    const explicitCode = normalizeCustomerCode(input.code || '');
    const customerRef = doc(collection(db, CUSTOMERS_COLLECTIONS.CUSTOMERS));

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
      } else {
        const prefix = customerCodePrefixForType(input.type);
        const counterKey = `customer_${input.type}`;
        const seedMax = maxCustomerSeqFromCodes(
          (await this.listAll({ includeInactive: true, max: 2000 })).map((c) => c.code),
          prefix,
        );
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
          tx.set(
            customerRef,
            stripUndefined({
              tenantId,
              code: allocated,
              type: input.type,
              name: String(input.name).trim(),
              phone,
              phoneDigits,
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
      }
    } catch (error) {
      toUserError(error);
    }

    const created = await this.getById(customerRef.id);
    if (!created) throw new Error('تعذر قراءة العميل بعد الإنشاء.');

    await customerActivityService.record({
      customerId: customerRef.id,
      module: 'customers',
      action: 'customer.created',
      title: 'إنشاء عميل',
      summary: `${created.code} — ${created.name}`,
      actorUid: input.createdBy,
      actorName: input.createdByName,
    });

    await activityLogService.logCurrentUser('CUSTOMER_CREATE', 'إنشاء عميل', {
      customerId: customerRef.id,
      code: created.code,
      type: created.type,
    });

    return created;
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
    if (!nextPhone) throw new Error('رقم هاتف العميل مطلوب.');
    const phoneDigits = buildCustomerPhoneDigits(nextPhone);
    if (phoneDigits.length < 7) throw new Error('رقم الهاتف غير صالح.');

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

  subscribeAll(cb: (rows: Customer[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = tenantQuery(
      db,
      CUSTOMERS_COLLECTIONS.CUSTOMERS,
      orderBy('code', 'asc'),
      limit(LIST_SOFT_CAP),
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
