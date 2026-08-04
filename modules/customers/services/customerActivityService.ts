import {
  addDoc,
  getDocs,
  limit,
  orderBy,
  where,
} from 'firebase/firestore';
import { isConfigured, db } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import { tenantQuery } from '@/lib/tenantFirestore';
import { CUSTOMERS_COLLECTIONS, customerActivitiesRef } from '../collections';
import type { CustomerActivity, CustomerActivityAction, CustomerActivityModule } from '../types';

const stripUndefined = <T extends Record<string, unknown>>(obj: T): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

function normalizeActivity(id: string, data: Record<string, unknown>): CustomerActivity {
  return {
    id,
    tenantId: String(data.tenantId || ''),
    customerId: String(data.customerId || ''),
    module: String(data.module || 'customers') as CustomerActivityModule,
    action: String(data.action || '') as CustomerActivityAction,
    title: String(data.title || ''),
    summary: data.summary != null ? String(data.summary) : undefined,
    referenceType: data.referenceType != null ? String(data.referenceType) : undefined,
    referenceId: data.referenceId != null ? String(data.referenceId) : undefined,
    referenceLabel: data.referenceLabel != null ? String(data.referenceLabel) : undefined,
    at: String(data.at || ''),
    actorUid: data.actorUid != null ? String(data.actorUid) : undefined,
    actorName: data.actorName != null ? String(data.actorName) : undefined,
    metadata: (data.metadata as Record<string, unknown> | undefined) || undefined,
  };
}

export type RecordCustomerActivityInput = {
  customerId: string;
  module: CustomerActivityModule;
  action: CustomerActivityAction;
  title: string;
  summary?: string;
  referenceType?: string;
  referenceId?: string;
  referenceLabel?: string;
  actorUid?: string;
  actorName?: string;
  metadata?: Record<string, unknown>;
  at?: string;
};

/**
 * سجل حركات العميل عبر الموديولات — مصدر الحقيقة لتايملاين الـ CRM.
 * أي موديول لاحق يكتب هنا عند حدث يخص عميل ماستر.
 */
export const customerActivityService = {
  async record(input: RecordCustomerActivityInput): Promise<string | null> {
    if (!isConfigured) return null;
    const customerId = String(input.customerId || '').trim();
    if (!customerId) return null;
    try {
      const tenantId = getCurrentTenantId();
      const at = input.at || new Date().toISOString();
      const ref = await addDoc(
        customerActivitiesRef(),
        stripUndefined({
          tenantId,
          customerId,
          module: input.module,
          action: input.action,
          title: String(input.title || '').trim() || 'حركة عميل',
          summary: input.summary?.trim() || '',
          referenceType: input.referenceType || '',
          referenceId: input.referenceId || '',
          referenceLabel: input.referenceLabel || '',
          at,
          actorUid: input.actorUid || '',
          actorName: input.actorName || '',
          metadata: input.metadata || {},
        }),
      );
      return ref.id;
    } catch (error) {
      console.error('customerActivityService.record failed:', error);
      return null;
    }
  },

  async listForCustomer(customerId: string, max = 100): Promise<CustomerActivity[]> {
    if (!isConfigured || !customerId) return [];
    const q = tenantQuery(
      db,
      CUSTOMERS_COLLECTIONS.ACTIVITIES,
      where('customerId', '==', customerId),
      orderBy('at', 'desc'),
      limit(max),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalizeActivity(d.id, d.data() as Record<string, unknown>));
  },
};
