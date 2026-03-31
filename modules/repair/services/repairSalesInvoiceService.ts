import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { REPAIR_SALES_INVOICES_COLLECTION } from '../collections';
import { sparePartsService } from './sparePartsService';
import type { RepairSalesInvoice, RepairSalesInvoiceLine } from '../types';

const nowIso = () => new Date().toISOString();
const formatInvoiceNo = (seq: number) => `RSI-${String(seq).padStart(5, '0')}`;

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

  async create(input: {
    branchId: string;
    warehouseId?: string;
    warehouseName?: string;
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
    const normalized = input.lines.map((l) => ({
      partId: l.partId,
      partName: l.partName,
      quantity: Math.max(1, Number(l.quantity || 0)),
      unitPrice: Math.max(0, Number(l.unitPrice || 0)),
      lineTotal: Math.max(0, Number(l.quantity || 0)) * Math.max(0, Number(l.unitPrice || 0)),
    }));
    const total = normalized.reduce((sum, l) => sum + Number(l.lineTotal || 0), 0);
    const ref = await addDoc(collection(db, REPAIR_SALES_INVOICES_COLLECTION), {
      tenantId,
      branchId: input.branchId,
      invoiceNo,
      customerName: input.customerName || '',
      customerPhone: input.customerPhone || '',
      notes: input.notes || '',
      total,
      lines: normalized,
      createdBy: input.createdBy,
      createdByName: input.createdByName || '',
      createdAt: at,
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
        notes: `بيع مباشر - فاتورة ${invoiceNo}`,
      });
    }

    return ref.id;
  },
};
