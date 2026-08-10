import {
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  type Unsubscribe,
  where,
} from 'firebase/firestore';
import { db, isConfigured, mutateRepairSalesInvoiceCallable } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { REPAIR_SALES_INVOICES_COLLECTION } from '../collections';
import type { RepairSalesInvoice, RepairSalesInvoiceLine } from '../types';

export const repairSalesInvoiceService = {
  async list(branchId?: string): Promise<RepairSalesInvoice[]> {
    if (!isConfigured) return [];
    const q = branchId
      ? tenantQuery(db, REPAIR_SALES_INVOICES_COLLECTION, where('branchId', '==', branchId), orderBy('createdAt', 'desc'))
      : tenantQuery(db, REPAIR_SALES_INVOICES_COLLECTION, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSalesInvoice));
  },

  async getById(id: string): Promise<RepairSalesInvoice | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, REPAIR_SALES_INVOICES_COLLECTION, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as RepairSalesInvoice) : null;
  },

  async findActiveByRepairJobId(repairJobId: string): Promise<RepairSalesInvoice | null> {
    if (!isConfigured || !repairJobId) return null;
    const q = tenantQuery(
      db,
      REPAIR_SALES_INVOICES_COLLECTION,
      where('repairJobId', '==', repairJobId),
      limit(20),
    );
    const snap = await getDocs(q);
    const activeRows = snap.docs
      .map((row) => ({ id: row.id, ...row.data() } as RepairSalesInvoice))
      .filter((row) => (row.status || 'active') === 'active')
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return activeRows[0] || null;
  },

  subscribeByBranch(branchId: string, cb: (rows: RepairSalesInvoice[]) => void): Unsubscribe {
    if (!isConfigured || !branchId) return () => {};
    const q = tenantQuery(
      db,
      REPAIR_SALES_INVOICES_COLLECTION,
      where('branchId', '==', branchId),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSalesInvoice))),
      (error) => {
        console.error('repairSalesInvoiceService.subscribeByBranch listener error:', error);
      },
    );
  },

  subscribeByBranches(branchIds: string[], cb: (rows: RepairSalesInvoice[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const normalized = Array.from(new Set(branchIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (normalized.length === 0) {
      cb([]);
      return () => {};
    }
    const branchRows = new Map<string, RepairSalesInvoice[]>();
    const emit = () => {
      const merged = Array.from(branchRows.values()).flat();
      const unique = new Map<string, RepairSalesInvoice>();
      merged.forEach((row) => {
        if (!row.id) return;
        unique.set(row.id, row);
      });
      const sorted = Array.from(unique.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      cb(sorted);
    };
    const unsubs = normalized.map((branchId) => {
      const q = tenantQuery(
        db,
        REPAIR_SALES_INVOICES_COLLECTION,
        where('branchId', '==', branchId),
        orderBy('createdAt', 'desc'),
      );
      return onSnapshot(
        q,
        (snap) => {
          branchRows.set(branchId, snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSalesInvoice)));
          emit();
        },
        (error) => {
          console.error('repairSalesInvoiceService.subscribeByBranches listener error:', error);
        },
      );
    });
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  },

  subscribeAll(cb: (rows: RepairSalesInvoice[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = tenantQuery(db, REPAIR_SALES_INVOICES_COLLECTION, orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairSalesInvoice))),
      (error) => {
        console.error('repairSalesInvoiceService.subscribeAll listener error:', error);
      },
    );
  },

  async create(input: {
    branchId: string;
    warehouseId?: string;
    warehouseName?: string;
    repairJobId?: string;
    lines: RepairSalesInvoiceLine[];
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    discountType?: 'none' | 'amount' | 'percent';
    discountValue?: number;
    paymentMethod?: 'cash' | 'card' | 'bank_transfer' | 'credit';
    createdBy: string;
    createdByName?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    if (!input.branchId) throw new Error('الفرع مطلوب.');
    if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error('أضف سطرًا واحدًا على الأقل.');
    const result = await mutateRepairSalesInvoiceCallable({
      operation: 'prepare',
      branchId: input.branchId,
      repairJobId: input.repairJobId || '',
      lines: input.lines.map((line) => ({ partId: line.partId, quantity: line.quantity })),
      customerId: input.customerId || '',
      customerName: input.customerName || '',
      customerPhone: input.customerPhone || '',
      notes: input.notes || '',
      discountType: input.discountType || 'none',
      discountValue: Number(input.discountValue || 0),
      paymentMethod: input.paymentMethod || 'cash',
    });

    return result.id;
  },

  async updateInvoice(input: {
    id: string;
    branchId: string;
    warehouseId?: string;
    warehouseName?: string;
    lines: RepairSalesInvoiceLine[];
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    discountType?: 'none' | 'amount' | 'percent';
    discountValue?: number;
    paymentMethod?: 'cash' | 'card' | 'bank_transfer' | 'credit';
    updatedBy: string;
    updatedByName?: string;
  }): Promise<void> {
    if (!isConfigured) return;
    if (!input.id) throw new Error('رقم الفاتورة غير صالح.');
    if (!input.branchId) throw new Error('الفرع مطلوب.');
    if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error('أضف سطرًا واحدًا على الأقل.');
    await mutateRepairSalesInvoiceCallable({
      operation: 'prepare',
      id: input.id,
      branchId: input.branchId,
      lines: input.lines.map((line) => ({ partId: line.partId, quantity: line.quantity })),
      customerId: input.customerId || '',
      customerName: input.customerName || '',
      customerPhone: input.customerPhone || '',
      notes: input.notes || '',
      discountType: input.discountType || 'none',
      discountValue: Number(input.discountValue || 0),
      paymentMethod: input.paymentMethod || 'cash',
    });
  },

  async resolveDiscount(id: string, approve: boolean, rejectionReason = ''): Promise<void> {
    if (!isConfigured || !id) return;
    await mutateRepairSalesInvoiceCallable({ operation: 'resolve_discount', id, approve, rejectionReason });
  },

  async postInvoice(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await mutateRepairSalesInvoiceCallable({ operation: 'post', id });
  },

  async cancelInvoice(input: {
    id: string;
    cancelledBy: string;
    cancelledByName?: string;
    cancelReason?: string;
  }): Promise<void> {
    if (!isConfigured) return;
    if (!input.id) throw new Error('رقم الفاتورة غير صالح.');
    const invoice = await this.getById(input.id);
    if (!invoice?.id) throw new Error('الفاتورة غير موجودة.');
    if ((invoice.status || 'active') === 'cancelled') throw new Error('الفاتورة ملغاة بالفعل.');
    await mutateRepairSalesInvoiceCallable({
      operation: 'cancel',
      id: invoice.id,
      cancelReason: input.cancelReason || '',
    });

  },
};
