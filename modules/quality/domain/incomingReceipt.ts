export const PLASTIC_DECISIONS = ['مقبول', 'مرفوض', 'في انتظار فحص المورد', 'مقبول بنسبة'] as const;
export type PlasticDecision = (typeof PLASTIC_DECISIONS)[number];

export const DEFAULT_PLASTIC_REJECTION_REASONS = [
  'Material & Raw Color',
  'Wrong Item',
  'Flash / Burrs',
  'Short Shot / Unfilled',
  'Sink Marks',
  'Weld Lines / Flow Marks',
  'Color Mismatch / Discoloration',
  'Scratches / Dirty / Stains',
  'Warpage/Deformation',
  'Silver Marks / Bubbles',
  'Ejector Marks / Cracks',
  'Assembly / Fitting Trial',
  'Weight & Wall Thickness',
  'Critical Dimensions (L, W, H/ Pin diameters)',
] as const;

export interface CartonReceiptInput {
  supplier: string;
  receivedDate: string;
  shipmentNumber: string;
  totalQuantity: number;
  deliveryNoteNumber: string;
  totalItems: number;
  acceptedItems: number;
  rejectedItems: number;
  rejectedItemCode: string;
  notes: string;
}

export interface PlasticReceiptInput {
  supplier: string;
  receivedDate: string;
  productName: string;
  partName: string;
  quantity: number;
  inspectedSamples: number;
  rejectedSamples: number;
  reasonIds: string[];
  notes: string;
  finalDecision: PlasticDecision;
  acceptedPercentage: number | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(value: string): string {
  const date = value.trim();
  const parsed = ISO.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('تاريخ الاستلام غير صالح');
  }
  return date;
}

function requireInteger(value: unknown, label: string): number {
  const text = typeof value === 'string' ? value.trim() : null;
  const number = typeof value === 'number' ? value : text && /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} يجب أن يكون رقمًا صحيحًا غير سالب`);
  return number;
}

export function excelSerialToIsoDate(value: unknown): string {
  if (typeof value === 'string' && ISO.test(value.trim())) return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const serial = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(serial) || serial < 1) throw new Error('تاريخ الاستلام غير صالح');
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return utc.toISOString().slice(0, 10);
}

export function normalizeCartonReceipt(data: {
  supplier?: unknown;
  receivedDate?: unknown;
  shipmentNumber?: unknown;
  totalQuantity?: unknown;
  deliveryNoteNumber?: unknown;
  totalItems?: unknown;
  acceptedItems?: unknown;
  rejectedItems?: unknown;
  rejectedItemCode?: unknown;
  notes?: unknown;
}): CartonReceiptInput {
  const supplier = String(data.supplier ?? '').trim();
  if (!supplier || supplier.length > 150) throw new Error('اسم المورد مطلوب وبحد أقصى 150 حرفًا');
  const receipt: CartonReceiptInput = {
    supplier,
    receivedDate: requireDate(String(data.receivedDate ?? '')),
    shipmentNumber: String(data.shipmentNumber ?? '').trim(),
    totalQuantity: requireInteger(data.totalQuantity, 'إجمالي الكمية'),
    deliveryNoteNumber: String(data.deliveryNoteNumber ?? '').trim(),
    totalItems: requireInteger(data.totalItems, 'إجمالي الأصناف'),
    acceptedItems: requireInteger(data.acceptedItems, 'الأصناف المقبولة'),
    rejectedItems: requireInteger(data.rejectedItems, 'الأصناف المرفوضة'),
    rejectedItemCode: String(data.rejectedItemCode ?? '').trim(),
    notes: String(data.notes ?? '').trim(),
  };
  if (receipt.notes.length > 1000) throw new Error('الملاحظات يجب ألا تتجاوز 1000 حرف');
  if (receipt.shipmentNumber.length > 80) throw new Error('رقم الشحنة يتجاوز 80 حرفًا');
  if (receipt.deliveryNoteNumber.length > 100) throw new Error('رقم إذن التسليم يتجاوز 100 حرفًا');
  if (receipt.rejectedItemCode.length > 150) throw new Error('كود الصنف المرفوض يتجاوز 150 حرفًا');
  if (receipt.acceptedItems + receipt.rejectedItems !== receipt.totalItems) {
    throw new Error('إجمالي الأصناف يجب أن يساوي مجموع الأصناف المقبولة والمرفوضة');
  }
  return receipt;
}

export function normalizePlasticReceipt(data: {
  supplier?: unknown;
  receivedDate?: unknown;
  productName?: unknown;
  partName?: unknown;
  quantity?: unknown;
  inspectedSamples?: unknown;
  rejectedSamples?: unknown;
  reasonIds?: unknown;
  notes?: unknown;
  finalDecision?: unknown;
  acceptedPercentage?: unknown;
}): PlasticReceiptInput {
  const supplier = String(data.supplier ?? '').trim();
  const productName = String(data.productName ?? '').trim();
  const partName = String(data.partName ?? '').trim();
  const notes = String(data.notes ?? '').trim();
  const finalDecision = String(data.finalDecision ?? '').trim();
  if (!supplier || supplier.length > 150) throw new Error('اسم المورد مطلوب وبحد أقصى 150 حرفًا');
  if (!productName || productName.length > 150) throw new Error('اختيار الصنف مطلوب');
  if (partName.length > 150) throw new Error('اسم الجزء يجب ألا يتجاوز 150 حرفًا');
  if (notes.length > 1000) throw new Error('الملاحظات يجب ألا تتجاوز 1000 حرف');
  if (!PLASTIC_DECISIONS.includes(finalDecision as PlasticDecision)) throw new Error('القرار النهائي غير صالح');
  const inspectedSamples = requireInteger(data.inspectedSamples, 'عدد العينات المفحوصة');
  const rejectedSamples = requireInteger(data.rejectedSamples, 'عدد العينات المرفوضة');
  if (rejectedSamples > inspectedSamples) throw new Error('عدد العينات المرفوضة يجب أن يكون بين صفر وعدد العينات المفحوصة');
  const reasonIds = [...new Set(Array.isArray(data.reasonIds) ? data.reasonIds.map((id) => String(id)) : [])].filter(Boolean);
  if (rejectedSamples > 0 && reasonIds.length === 0) throw new Error('اختر سبب رفض واحدًا على الأقل');
  let acceptedPercentage: number | null = null;
  if (finalDecision === 'مقبول بنسبة') {
    acceptedPercentage = Number(data.acceptedPercentage);
    if (!Number.isFinite(acceptedPercentage) || acceptedPercentage < 0 || acceptedPercentage > 100) {
      throw new Error('نسبة القبول يجب أن تكون من 0 إلى 100');
    }
  }
  return {
    supplier,
    receivedDate: requireDate(String(data.receivedDate ?? '')),
    productName,
    partName,
    quantity: requireInteger(data.quantity, 'الكمية'),
    inspectedSamples,
    rejectedSamples,
    reasonIds,
    notes,
    finalDecision: finalDecision as PlasticDecision,
    acceptedPercentage,
  };
}

const CARTON_HEADERS: Record<string, keyof CartonReceiptInput> = {
  'المورد': 'supplier',
  'الشركة': 'supplier',
  'تاريخ الاستلام': 'receivedDate',
  'التاريخ': 'receivedDate',
  'رقم الشحنة': 'shipmentNumber',
  'إجمالي الكمية': 'totalQuantity',
  'الكمية': 'totalQuantity',
  'رقم إذن التسليم': 'deliveryNoteNumber',
  'رقم الإذن': 'deliveryNoteNumber',
  'إجمالي الأصناف': 'totalItems',
  'الأصناف المقبولة': 'acceptedItems',
  'المقبول': 'acceptedItems',
  'الأصناف المرفوضة': 'rejectedItems',
  'المرفوض': 'rejectedItems',
  'كود الصنف': 'rejectedItemCode',
  'كود الصنف المرفوض': 'rejectedItemCode',
  'ملاحظات': 'notes',
  'الملاحظات': 'notes',
};

export function cartonRowsFromSheet(rows: Array<Record<string, unknown>>): CartonReceiptInput[] {
  if (rows.length === 0) throw new Error('لم يتم العثور على سجلات صالحة للاستيراد');
  if (rows.length > 400) throw new Error('الحد الأقصى للاستيراد في المرة الواحدة هو 400 سجل');
  return rows.map((row, index) => {
    const mapped: Record<string, unknown> = {};
    Object.entries(row).forEach(([header, value]) => {
      const field = CARTON_HEADERS[header.trim()];
      if (!field) return;
      mapped[field] = field === 'receivedDate' ? excelSerialToIsoDate(value) : value;
    });
    try {
      return normalizeCartonReceipt(mapped);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'سجل غير صالح';
      throw new Error(`الصف ${index + 2}: ${message}`);
    }
  });
}

export interface PreparedCartonReceipt extends CartonReceiptInput {
  shipmentCount: 0 | 1;
}

export function prepareCartonImport(
  rows: CartonReceiptInput[],
  existing: Array<Pick<CartonReceiptInput, 'supplier' | 'receivedDate' | 'shipmentNumber' | 'deliveryNoteNumber'>>,
): PreparedCartonReceipt[] {
  const noteKeys = new Set(existing
    .filter((row) => row.deliveryNoteNumber)
    .map((row) => `${row.supplier}\u0000${row.receivedDate}\u0000${row.deliveryNoteNumber}`));
  rows.forEach((row, index) => {
    if (!row.deliveryNoteNumber) return;
    const key = `${row.supplier}\u0000${row.receivedDate}\u0000${row.deliveryNoteNumber}`;
    if (noteKeys.has(key)) throw new Error(`الصف ${index + 2}: رقم إذن التسليم مكرر لنفس المورد والتاريخ`);
    noteKeys.add(key);
  });
  const flags = firstShipmentFlags(rows, new Set(existing
    .filter((row) => row.shipmentNumber)
    .map((row) => `${row.supplier}\u0000${row.receivedDate}\u0000${row.shipmentNumber}`)));
  return rows.map((row, index) => ({ ...row, shipmentCount: flags[index] === 1 ? 1 : 0 }));
}

const PLASTIC_HEADERS: Record<string, string> = {
  'التاريخ': 'receivedDate',
  'تاريخ الاستلام': 'receivedDate',
  'اسم المورد': 'supplier',
  'المورد': 'supplier',
  'اسم الصنف': 'productName',
  'الصنف': 'productName',
  'اسم الجزء': 'partName',
  'الجزء': 'partName',
  'الكمية': 'quantity',
  'العينات المفحوصة': 'inspectedSamples',
  'العينات المرفوضة': 'rejectedSamples',
  'أسباب الرفض': 'reasons',
  'القرار النهائي': 'finalDecision',
  'نسبة القبول': 'acceptedPercentage',
  'ملاحظات': 'notes',
  'الملاحظات': 'notes',
};

export function plasticRowsFromSheet(
  rows: Array<Record<string, unknown>>,
  catalogs: { items: Array<{ id: string; name: string; isActive?: boolean }>; reasons: Array<{ id: string; name: string; isActive?: boolean }> },
): PlasticReceiptInput[] {
  if (rows.length === 0) throw new Error('لم يتم العثور على سجلات صالحة للاستيراد');
  if (rows.length > 400) throw new Error('الحد الأقصى للاستيراد في المرة الواحدة هو 400 سجل');
  const activeItems = catalogs.items.filter((item) => item.isActive !== false);
  const activeReasons = catalogs.reasons.filter((reason) => reason.isActive !== false);
  return rows.map((row, index) => {
    const mapped: Record<string, unknown> = {};
    Object.entries(row).forEach(([header, value]) => {
      const field = PLASTIC_HEADERS[header.trim()];
      if (!field) return;
      mapped[field] = field === 'receivedDate' ? excelSerialToIsoDate(value) : value;
    });
    const productName = String(mapped.productName ?? '').trim();
    const item = activeItems.find((entry) => entry.name === productName);
    if (!item) throw new Error(`الصف ${index + 2}: اختيار الصنف مطلوب`);
    const reasonNames = String(mapped.reasons ?? '').split('|').map((name) => name.trim()).filter(Boolean);
    const reasonIds = reasonNames.map((name) => activeReasons.find((reason) => reason.name === name)?.id || '');
    if (reasonIds.some((id) => !id)) throw new Error(`الصف ${index + 2}: سبب الرفض غير موجود في القائمة النشطة`);
    try {
      return normalizePlasticReceipt({ ...mapped, productName: item.name, reasonIds });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'سجل غير صالح';
      throw new Error(`الصف ${index + 2}: ${message}`);
    }
  });
}

export function summarizeCartons(rows: Array<Pick<CartonReceiptInput, 'supplier' | 'totalQuantity' | 'totalItems' | 'acceptedItems' | 'rejectedItems'> & { shipmentCount?: number }>) {
  const bySupplier = new Map<string, { records: number; shipments: number; quantity: number; items: number; accepted: number; rejected: number }>();
  rows.forEach((row) => {
    const current = bySupplier.get(row.supplier) || { records: 0, shipments: 0, quantity: 0, items: 0, accepted: 0, rejected: 0 };
    current.records += 1;
    current.shipments += Number(row.shipmentCount || 0);
    current.quantity += row.totalQuantity;
    current.items += row.totalItems;
    current.accepted += row.acceptedItems;
    current.rejected += row.rejectedItems;
    bySupplier.set(row.supplier, current);
  });
  return {
    records: rows.length,
    quantity: rows.reduce((sum, row) => sum + row.totalQuantity, 0),
    accepted: rows.reduce((sum, row) => sum + row.acceptedItems, 0),
    rejected: rows.reduce((sum, row) => sum + row.rejectedItems, 0),
    shipments: rows.reduce((sum, row) => sum + Number(row.shipmentCount || 0), 0),
    suppliers: [...bySupplier.entries()].map(([supplier, value]) => ({ supplier, ...value })).sort((left, right) => right.quantity - left.quantity),
  };
}

export function summarizePlastic(rows: PlasticReceiptInput[]) {
  const bySupplier = new Map<string, { records: number; quantity: number; inspected: number; rejected: number }>();
  const byReason = new Map<string, number>();
  rows.forEach((row) => {
    const current = bySupplier.get(row.supplier) || { records: 0, quantity: 0, inspected: 0, rejected: 0 };
    current.records += 1;
    current.quantity += row.quantity;
    current.inspected += row.inspectedSamples;
    current.rejected += row.rejectedSamples;
    bySupplier.set(row.supplier, current);
    row.reasonIds.forEach((reasonId) => byReason.set(reasonId, (byReason.get(reasonId) || 0) + 1));
  });
  return {
    records: rows.length,
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    inspected: rows.reduce((sum, row) => sum + row.inspectedSamples, 0),
    rejected: rows.reduce((sum, row) => sum + row.rejectedSamples, 0),
    suppliers: [...bySupplier.entries()].map(([supplier, value]) => ({ supplier, ...value })).sort((left, right) => right.quantity - left.quantity),
    reasons: [...byReason.entries()].map(([reasonId, count]) => ({ reasonId, count })).sort((left, right) => right.count - left.count),
  };
}

export function firstShipmentFlags(rows: Array<{ supplier: string; receivedDate: string; shipmentNumber: string }>, existingKeys: Set<string>): number[] {
  const seen = new Set(existingKeys);
  return rows.map((row) => {
    if (!row.shipmentNumber) return 1;
    const key = `${row.supplier}\u0000${row.receivedDate}\u0000${row.shipmentNumber}`;
    if (seen.has(key)) return 0;
    seen.add(key);
    return 1;
  });
}
