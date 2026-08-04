import * as XLSX from 'xlsx';

export type ConsumableSheetLookupMaterial = {
  id: string;
  code: string;
  name: string;
  unit: string;
  purchaseCost: number;
};

export type ConsumableSheetLookupWarehouse = {
  id: string;
  code: string;
  name: string;
};

export type ConsumableSheetLookupLocation = {
  id: string;
  code: string;
  warehouseId: string;
  isActive?: boolean;
};

export type ConsumableSheetBalanceLookup = {
  warehouseId: string;
  itemId: string;
  locationId?: string;
  quantity: number;
};

export type ParsedConsumableSheetRow = {
  rowIndex: number;
  itemCode: string;
  itemName: string;
  itemId: string;
  unit: string;
  warehouseCode: string;
  warehouseName: string;
  warehouseId: string;
  locationCode: string;
  locationId?: string;
  currentQty: number;
  targetQty: number | null;
  qtyDelta: number;
  currentPrice: number;
  targetPrice: number | null;
  priceChanged: boolean;
  willUpdateQty: boolean;
  willUpdatePrice: boolean;
  errors: string[];
};

export type ConsumableSheetParseResult = {
  rows: ParsedConsumableSheetRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  qtyUpdateCount: number;
  priceUpdateCount: number;
  fileErrors: string[];
};

type HeaderField =
  | 'itemCode'
  | 'itemName'
  | 'warehouseCode'
  | 'warehouseName'
  | 'locationCode'
  | 'quantity'
  | 'unitPrice';

const HEADER_MAP: Record<string, HeaderField> = {
  'كود الصنف': 'itemCode',
  'كود المستهلك': 'itemCode',
  'كود المادة': 'itemCode',
  الكود: 'itemCode',
  code: 'itemCode',
  'item code': 'itemCode',
  'اسم الصنف': 'itemName',
  الاسم: 'itemName',
  name: 'itemName',
  'كود المخزن': 'warehouseCode',
  'كود مخزن': 'warehouseCode',
  'warehouse code': 'warehouseCode',
  'اسم المخزن': 'warehouseName',
  المخزن: 'warehouseName',
  warehouse: 'warehouseName',
  'كود الرف': 'locationCode',
  'كود الموقع': 'locationCode',
  'كود اللوكيشن': 'locationCode',
  اللوكيشن: 'locationCode',
  'location code': 'locationCode',
  الرصيد: 'quantity',
  الكمية: 'quantity',
  quantity: 'quantity',
  qty: 'quantity',
  'سعر الوحدة': 'unitPrice',
  السعر: 'unitPrice',
  'purchase cost': 'unitPrice',
  cost: 'unitPrice',
  price: 'unitPrice',
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function mapHeader(raw: string): HeaderField | undefined {
  const norm = normalizeHeader(raw);
  if (!norm) return undefined;
  if (HEADER_MAP[norm]) return HEADER_MAP[norm];
  if (/سعر|cost|price/.test(norm)) return 'unitPrice';
  if (/رصيد|كمي|qty|quantity/.test(norm)) return 'quantity';
  if (/رف|لوكيشن|location|shelf/.test(norm)) return 'locationCode';
  if (/مخزن|warehouse/.test(norm) && /كود|code/.test(norm)) return 'warehouseCode';
  if (/مخزن|warehouse/.test(norm)) return 'warehouseName';
  if (/كود|code/.test(norm)) return 'itemCode';
  if (/اسم|name/.test(norm)) return 'itemName';
  return undefined;
}

function normalizeCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[–—−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '');
}

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function parseNumericCell(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value)
    .trim()
    .replace(/,/g, '')
    .replace(/٬/g, '')
    .replace(/[^\d.\-]/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function cellEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

export function downloadDepartmentConsumablesSheetTemplate(): void {
  const rows = [
    {
      'كود الصنف': 'CNS-001',
      'اسم الصنف': 'قفازات',
      'كود المخزن': 'WH-01',
      'اسم المخزن': 'مخزن المستلزمات',
      'كود الرف': '',
      الرصيد: 100,
      'سعر الوحدة': 2.5,
    },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'مستهلكات');
  XLSX.writeFile(wb, 'قالب-شيت-مستهلكات.xlsx');
}

export function exportDepartmentConsumablesBalancesSheet(
  rows: Array<{
    itemCode: string;
    itemName: string;
    warehouseCode: string;
    warehouseName: string;
    locationCode?: string;
    quantity: number;
    unitPrice: number;
  }>,
): void {
  const exportRows = rows.map((row) => ({
    'كود الصنف': row.itemCode,
    'اسم الصنف': row.itemName,
    'كود المخزن': row.warehouseCode,
    'اسم المخزن': row.warehouseName,
    'كود الرف': row.locationCode || '',
    الرصيد: row.quantity,
    'سعر الوحدة': row.unitPrice,
  }));
  const ws = XLSX.utils.json_to_sheet(
    exportRows.length
      ? exportRows
      : [{
          'كود الصنف': '',
          'اسم الصنف': '',
          'كود المخزن': '',
          'اسم المخزن': '',
          'كود الرف': '',
          الرصيد: 0,
          'سعر الوحدة': 0,
        }],
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'أرصدة مستهلكات');
  XLSX.writeFile(wb, `أرصدة-مستهلكات-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function parseDepartmentConsumablesSheetFromBuffer(
  data: ArrayBuffer | Uint8Array,
  input: {
    materials: ConsumableSheetLookupMaterial[];
    warehouses: ConsumableSheetLookupWarehouse[];
    locations: ConsumableSheetLookupLocation[];
    balances: ConsumableSheetBalanceLookup[];
    allowedWarehouseIds?: string[] | null;
  },
): ConsumableSheetParseResult {
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
      qtyUpdateCount: 0,
      priceUpdateCount: 0,
      fileErrors: ['الملف لا يحتوي على ورقة عمل.'],
    };
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });
  if (aoa.length < 2) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
      qtyUpdateCount: 0,
      priceUpdateCount: 0,
      fileErrors: ['الملف فارغ أو بدون صفوف بيانات.'],
    };
  }

  const headers = (aoa[0] || []).map((h) => mapHeader(String(h || '')));
  const itemCodeIdx = headers.findIndex((h) => h === 'itemCode');
  const itemNameIdx = headers.findIndex((h) => h === 'itemName');
  const warehouseCodeIdx = headers.findIndex((h) => h === 'warehouseCode');
  const warehouseNameIdx = headers.findIndex((h) => h === 'warehouseName');
  const locationCodeIdx = headers.findIndex((h) => h === 'locationCode');
  const qtyIdx = headers.findIndex((h) => h === 'quantity');
  const priceIdx = headers.findIndex((h) => h === 'unitPrice');

  const fileErrors: string[] = [];
  if (itemCodeIdx < 0) fileErrors.push('عمود «كود الصنف» مطلوب.');
  if (warehouseCodeIdx < 0 && warehouseNameIdx < 0) {
    fileErrors.push('عمود «كود المخزن» أو «اسم المخزن» مطلوب.');
  }
  if (qtyIdx < 0 && priceIdx < 0) {
    fileErrors.push('يلزم عمود «الرصيد» أو «سعر الوحدة» على الأقل.');
  }
  if (fileErrors.length) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
      qtyUpdateCount: 0,
      priceUpdateCount: 0,
      fileErrors,
    };
  }

  const materialByCode = new Map(
    input.materials.map((m) => [normalizeCode(m.code), m] as const),
  );
  const warehouseByCode = new Map(
    input.warehouses.map((w) => [normalizeCode(w.code), w] as const),
  );
  const warehouseByName = new Map(
    input.warehouses.map((w) => [normalizeName(w.name), w] as const),
  );
  const locationsByWarehouse = new Map<string, ConsumableSheetLookupLocation[]>();
  for (const loc of input.locations) {
    if (loc.isActive === false) continue;
    const list = locationsByWarehouse.get(loc.warehouseId) || [];
    list.push(loc);
    locationsByWarehouse.set(loc.warehouseId, list);
  }
  const balanceKey = (warehouseId: string, itemId: string, locationId?: string) =>
    `${warehouseId}__${itemId}__${locationId || ''}`;
  const balanceByKey = new Map(
    input.balances.map((b) => [balanceKey(b.warehouseId, b.itemId, b.locationId), Number(b.quantity || 0)] as const),
  );
  const allowed = input.allowedWarehouseIds?.length
    ? new Set(input.allowedWarehouseIds)
    : null;

  const rows: ParsedConsumableSheetRow[] = [];
  for (let i = 1; i < aoa.length; i += 1) {
    const line = aoa[i] || [];
    const itemCode = normalizeCode(itemCodeIdx >= 0 ? line[itemCodeIdx] : '');
    const itemNameHint = String(itemNameIdx >= 0 ? line[itemNameIdx] ?? '' : '').trim();
    const warehouseCode = normalizeCode(warehouseCodeIdx >= 0 ? line[warehouseCodeIdx] : '');
    const warehouseNameHint = String(warehouseNameIdx >= 0 ? line[warehouseNameIdx] ?? '' : '').trim();
    const locationCode = normalizeCode(locationCodeIdx >= 0 ? line[locationCodeIdx] : '');
    const qtyEmpty = qtyIdx < 0 || cellEmpty(line[qtyIdx]);
    const priceEmpty = priceIdx < 0 || cellEmpty(line[priceIdx]);
    const targetQty = qtyEmpty ? null : parseNumericCell(line[qtyIdx]);
    const targetPrice = priceEmpty ? null : parseNumericCell(line[priceIdx]);

    if (!itemCode && !warehouseCode && !warehouseNameHint && qtyEmpty && priceEmpty) {
      continue;
    }

    const errors: string[] = [];
    const material = itemCode ? materialByCode.get(itemCode) : undefined;
    if (!itemCode) errors.push('كود الصنف مطلوب.');
    else if (!material) errors.push('المستهلك غير موجود أو ليس من نوع مستهلكات.');

    let warehouse =
      (warehouseCode ? warehouseByCode.get(warehouseCode) : undefined)
      || (warehouseNameHint ? warehouseByName.get(normalizeName(warehouseNameHint)) : undefined);
    if (!warehouse) errors.push('المخزن غير موجود.');
    else if (allowed && !allowed.has(warehouse.id)) {
      errors.push('المخزن خارج نطاق حسابك.');
      warehouse = undefined;
    }

    const warehouseLocations = warehouse
      ? (locationsByWarehouse.get(warehouse.id) || [])
      : [];
    let locationId: string | undefined;
    if (locationCode) {
      const loc = warehouseLocations.find((l) => normalizeCode(l.code) === locationCode);
      if (!loc) errors.push('كود الرف غير موجود في هذا المخزن.');
      else locationId = loc.id;
    } else if (warehouseLocations.length > 0) {
      errors.push('حدد كود الرف لأن المخزن يستخدم مواقع.');
    }

    if (!qtyEmpty && (targetQty === null || targetQty < 0)) {
      errors.push('الرصيد يجب أن يكون رقمًا ≥ 0.');
    }
    if (!priceEmpty && (targetPrice === null || targetPrice < 0)) {
      errors.push('سعر الوحدة يجب أن يكون رقمًا ≥ 0.');
    }
    if (qtyEmpty && priceEmpty) {
      errors.push('أدخل رصيدًا أو سعرًا للتحديث.');
    }

    const currentQty = material && warehouse
      ? Number(balanceByKey.get(balanceKey(warehouse.id, material.id, locationId)) || 0)
      : 0;
    const currentPrice = Number(material?.purchaseCost || 0);
    const qtyDelta = targetQty === null ? 0 : targetQty - currentQty;
    const priceChanged = targetPrice !== null
      && Math.abs(targetPrice - currentPrice) > 0.000_001;
    const willUpdateQty = targetQty !== null && Math.abs(qtyDelta) > 0.000_001;
    const willUpdatePrice = priceChanged;

    if (!errors.length && !willUpdateQty && !willUpdatePrice) {
      errors.push('لا تغيير عن الرصيد/السعر الحالي.');
    }

    rows.push({
      rowIndex: i + 1,
      itemCode: itemCode || '',
      itemName: material?.name || itemNameHint,
      itemId: material?.id || '',
      unit: material?.unit || '',
      warehouseCode: warehouse?.code || warehouseCode,
      warehouseName: warehouse?.name || warehouseNameHint,
      warehouseId: warehouse?.id || '',
      locationCode,
      locationId,
      currentQty,
      targetQty,
      qtyDelta,
      currentPrice,
      targetPrice,
      priceChanged,
      willUpdateQty,
      willUpdatePrice,
      errors,
    });
  }

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  return {
    rows,
    totalRows: rows.length,
    validCount,
    errorCount: rows.length - validCount,
    qtyUpdateCount: rows.filter((r) => r.errors.length === 0 && r.willUpdateQty).length,
    priceUpdateCount: rows.filter((r) => r.errors.length === 0 && r.willUpdatePrice).length,
    fileErrors: [],
  };
}

export async function parseDepartmentConsumablesSheet(
  file: File,
  input: Parameters<typeof parseDepartmentConsumablesSheetFromBuffer>[1],
): Promise<ConsumableSheetParseResult> {
  const buffer = await file.arrayBuffer();
  return parseDepartmentConsumablesSheetFromBuffer(buffer, input);
}
