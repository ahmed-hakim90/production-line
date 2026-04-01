import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Unsubscribe,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { REPAIR_SALES_INVOICES_COLLECTION } from '../collections';
import { sparePartsService } from './sparePartsService';
import type { RepairSalesInvoice, RepairSalesInvoiceLine } from '../types';
import { repairTreasuryService } from './repairTreasuryService';

const nowIso = () => new Date().toISOString();
const formatInvoiceNo = (seq: number) => `RSI-${String(seq).padStart(5, '0')}`;
const normalizeLines = (lines: RepairSalesInvoiceLine[]): RepairSalesInvoiceLine[] =>
  lines.map((l) => ({
    partId: l.partId,
    partName: l.partName,
    quantity: Math.max(1, Number(l.quantity || 0)),
    unitPrice: Math.max(0, Number(l.unitPrice || 0)),
    lineTotal: Math.max(0, Number(l.quantity || 0)) * Math.max(0, Number(l.unitPrice || 0)),
  }));
const toLineMap = (lines: RepairSalesInvoiceLine[]) => {
  const map = new Map<string, { quantity: number; partName: string }>();
  lines.forEach((line) => {
    const key = String(line.partId || '').trim();
    if (!key) return;
    const prev = map.get(key);
    map.set(key, {
      quantity: Number(prev?.quantity || 0) + Number(line.quantity || 0),
      partName: line.partName || prev?.partName || '',
    });
  });
  return map;
};

const nextInvoiceNo = async (): Promise<string> => {
  if (!isConfigured) return formatInvoiceNo(1);
  const q = query(collection(db, REPAIR_SALES_INVOICES_COLLECTION), orderBy('createdAt', 'desc'), limit(200));
  const snap = await getDocs(q);
  const maxSerial = snap.docs.reduce((max, row) => {
    const no = String((row.data() as RepairSalesInvoice).invoiceNo || '');
    const m = no.match(/^RSI-(\d+)$/);
    if (!m) return max;
    return Math.max(max, Number(m[1] || 0));
  }, 0);
  return formatInvoiceNo(maxSerial + 1);
};

export const repairSalesInvoiceService = {
  async list(branchId?: string): Promise<RepairSalesInvoice[]> {
    if (!isConfigured) return [];
    const constraints = [orderBy('createdAt', 'desc')] as Parameters<typeof query>[1][];
    if (branchId) constraints.unshift(where('branchId', '==', branchId));
    const q = query(collection(db, REPAIR_SALES_INVOICES_COLLECTION), ...constraints);
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
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    createdBy: string;
    createdByName?: string;
  }): Promise<string | null> {
    if (!isConfigured) return null;
    if (!input.branchId) throw new Error('الفرع مطلوب.');
    if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error('أضف سطرًا واحدًا على الأقل.');
    const tenantId = getCurrentTenantId();
    const invoiceNo = await nextInvoiceNo();
    const at = nowIso();
    const normalized = normalizeLines(input.lines);
    const total = normalized.reduce((sum, l) => sum + Number(l.lineTotal || 0), 0);
    const ref = await addDoc(collection(db, REPAIR_SALES_INVOICES_COLLECTION), {
      tenantId,
      branchId: input.branchId,
      invoiceNo,
      status: 'active',
      warehouseId: input.warehouseId || '',
      warehouseName: input.warehouseName || '',
      repairJobId: input.repairJobId || '',
      customerName: input.customerName || '',
      customerPhone: input.customerPhone || '',
      notes: input.notes || '',
      total,
      lines: normalized,
      createdBy: input.createdBy,
      createdByName: input.createdByName || '',
      createdAt: at,
      updatedAt: at,
      updatedBy: input.createdBy,
      updatedByName: input.createdByName || '',
    } as RepairSalesInvoice);

    for (const line of normalized) {
      await sparePartsService.adjustStock({
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        warehouseName: input.warehouseName,
        partId: line.partId,
        partName: line.partName,
        quantity: line.quantity,
        type: 'OUT',
        createdBy: input.createdByName || input.createdBy || 'system',
        referenceId: ref.id,
        notes: `بيع مباشر - فاتورة ${invoiceNo}`,
      });
    }

    return ref.id;
  },

  async updateInvoice(input: {
    id: string;
    branchId: string;
    warehouseId?: string;
    warehouseName?: string;
    lines: RepairSalesInvoiceLine[];
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    updatedBy: string;
    updatedByName?: string;
  }): Promise<void> {
    if (!isConfigured) return;
    if (!input.id) throw new Error('رقم الفاتورة غير صالح.');
    if (!input.branchId) throw new Error('الفرع مطلوب.');
    if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error('أضف سطرًا واحدًا على الأقل.');
    const invoice = await this.getById(input.id);
    if (!invoice?.id) throw new Error('الفاتورة غير موجودة.');
    if ((invoice.status || 'active') === 'cancelled') throw new Error('لا يمكن تعديل فاتورة ملغاة.');
    if (invoice.branchId !== input.branchId) throw new Error('لا يمكن نقل الفاتورة إلى فرع مختلف.');

    const normalized = normalizeLines(input.lines);
    const prevTotal = Number(invoice.total || 0);
    const nextTotal = normalized.reduce((sum, l) => sum + Number(l.lineTotal || 0), 0);
    const deltaTotal = nextTotal - prevTotal;

    const prevMap = toLineMap(invoice.lines || []);
    const nextMap = toLineMap(normalized);
    const allPartIds = new Set([...prevMap.keys(), ...nextMap.keys()]);
    for (const partId of allPartIds) {
      const oldQty = Number(prevMap.get(partId)?.quantity || 0);
      const newQty = Number(nextMap.get(partId)?.quantity || 0);
      const deltaQty = newQty - oldQty;
      if (deltaQty === 0) continue;
      const partName = nextMap.get(partId)?.partName || prevMap.get(partId)?.partName || '';
      await sparePartsService.adjustStock({
        branchId: input.branchId,
        warehouseId: input.warehouseId || invoice.warehouseId,
        warehouseName: input.warehouseName || invoice.warehouseName,
        partId,
        partName,
        quantity: Math.abs(deltaQty),
        type: deltaQty > 0 ? 'OUT' : 'IN',
        createdBy: input.updatedByName || input.updatedBy || 'system',
        referenceId: invoice.id,
        notes: `تعديل فاتورة ${invoice.invoiceNo || invoice.id}`,
      });
    }

    if (Math.abs(deltaTotal) > 0.00001) {
      await repairTreasuryService.addEntry({
        branchId: input.branchId,
        entryType: deltaTotal > 0 ? 'INCOME' : 'EXPENSE',
        amount: Math.abs(deltaTotal),
        note: `تسوية تعديل فاتورة ${invoice.invoiceNo || invoice.id}`,
        referenceId: `${invoice.id}:edit:${Date.now()}`,
        createdBy: input.updatedBy,
        createdByName: input.updatedByName || '',
      });
    }

    const at = nowIso();
    await updateDoc(doc(db, REPAIR_SALES_INVOICES_COLLECTION, invoice.id), {
      lines: normalized,
      total: nextTotal,
      warehouseId: input.warehouseId || invoice.warehouseId || '',
      warehouseName: input.warehouseName || invoice.warehouseName || '',
      customerName: input.customerName || '',
      customerPhone: input.customerPhone || '',
      notes: input.notes || '',
      updatedAt: at,
      updatedBy: input.updatedBy,
      updatedByName: input.updatedByName || '',
    } as Partial<RepairSalesInvoice>);
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
    if (await repairTreasuryService.hasEntryByReference(invoice.id, 'EXPENSE')) {
      throw new Error('تم تنفيذ الإلغاء سابقًا ولا يمكن تكراره.');
    }

    for (const line of invoice.lines || []) {
      await sparePartsService.adjustStock({
        branchId: invoice.branchId,
        warehouseId: invoice.warehouseId,
        warehouseName: invoice.warehouseName,
        partId: line.partId,
        partName: line.partName,
        quantity: Math.abs(Number(line.quantity || 0)),
        type: 'IN',
        createdBy: input.cancelledByName || input.cancelledBy || 'system',
        referenceId: invoice.id,
        notes: `إلغاء فاتورة ${invoice.invoiceNo || invoice.id}`,
      });
    }

    await repairTreasuryService.addEntry({
      branchId: invoice.branchId,
      entryType: 'EXPENSE',
      amount: Math.abs(Number(invoice.total || 0)),
      note: `إلغاء فاتورة بيع قطع غيار ${invoice.invoiceNo || invoice.id}`,
      referenceId: invoice.id,
      createdBy: input.cancelledBy,
      createdByName: input.cancelledByName || '',
    });

    const at = nowIso();
    await updateDoc(doc(db, REPAIR_SALES_INVOICES_COLLECTION, invoice.id), {
      status: 'cancelled',
      cancelledAt: at,
      cancelledBy: input.cancelledBy,
      cancelledByName: input.cancelledByName || '',
      cancelReason: input.cancelReason || '',
      updatedAt: at,
      updatedBy: input.cancelledBy,
      updatedByName: input.cancelledByName || '',
    } as Partial<RepairSalesInvoice>);
  },
};
