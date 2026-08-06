import * as XLSX from 'xlsx';
import type { Material } from '../../manufacturing/types';
import { normalizeRepairSalePrice } from '../utils/sparePartPricing';

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2_000;

const HEADERS = {
  materialId: 'معرف المادة',
  code: 'الكود',
  name: 'اسم القطعة',
  category: 'الفئة',
  consumer: 'سعر المستهلك',
  trader: 'سعر التاجر',
  cost: 'سعر التكلفة',
} as const;

type PriceValues = {
  consumer: number;
  trader: number;
  cost: number;
};

export type RepairPartsPricingImportChange = {
  materialId: string;
  code: string;
  name: string;
  current: PriceValues;
  next: PriceValues;
};

export type RepairPartsPricingImportResult = {
  totalRows: number;
  unchangedRows: number;
  changes: RepairPartsPricingImportChange[];
  errors: string[];
};

function normalizeCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function currentPrices(material: Material): PriceValues {
  return {
    consumer: normalizeRepairSalePrice(material.defaultSalePrice),
    trader: normalizeRepairSalePrice(material.traderSalePrice),
    cost: normalizeRepairSalePrice(material.purchaseCost),
  };
}

function parseOptionalPrice(
  value: unknown,
  label: string,
  rowNumber: number,
  errors: string[],
): number | undefined {
  if (value == null || String(value).trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push(`صف ${rowNumber}: ${label} يجب أن يكون رقمًا موجبًا أو صفرًا.`);
    return undefined;
  }
  return normalizeRepairSalePrice(parsed);
}

function applyRtlSheet(sheet: XLSX.WorkSheet): void {
  sheet['!views'] = [{ rightToLeft: true }];
  sheet['!cols'] = [
    { wch: 30 },
    { wch: 18 },
    { wch: 35 },
    { wch: 25 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];
}

export function downloadRepairPartsPricingSheet(materials: Material[]): void {
  const rows = materials.map((material) => ({
    [HEADERS.materialId]: String(material.id || ''),
    [HEADERS.code]: String(material.code || ''),
    [HEADERS.name]: String(material.name || ''),
    [HEADERS.category]: String(material.categoryName || ''),
    [HEADERS.consumer]: normalizeRepairSalePrice(material.defaultSalePrice),
    [HEADERS.trader]: normalizeRepairSalePrice(material.traderSalePrice),
    [HEADERS.cost]: normalizeRepairSalePrice(material.purchaseCost),
  }));
  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: Object.values(HEADERS),
  });
  applyRtlSheet(sheet);

  const instructions = XLSX.utils.aoa_to_sheet([
    ['تعليمات تحديث تسعير قطع الغيار'],
    ['عدّل أعمدة الأسعار فقط، ولا تغيّر معرف المادة أو الكود.'],
    ['الخانة الفارغة لا تغيّر السعر الحالي. اكتب 0 لتصفير السعر.'],
    ['سيتم رفض الصفوف المكررة أو الأكواد غير الموجودة أو الأسعار السالبة.'],
  ]);
  instructions['!views'] = [{ rightToLeft: true }];
  instructions['!cols'] = [{ wch: 90 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'تسعير قطع الغيار');
  XLSX.utils.book_append_sheet(workbook, instructions, 'تعليمات');
  XLSX.writeFile(workbook, `تسعير-قطع-الغيار-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function parseRepairPartsPricingBuffer(
  buffer: ArrayBuffer | Uint8Array,
  materials: Material[],
): RepairPartsPricingImportResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames.find((name) => name === 'تسعير قطع الغيار')
    || workbook.SheetNames[0];
  if (!sheetName) {
    return { totalRows: 0, unchangedRows: 0, changes: [], errors: ['الملف لا يحتوي على أوراق.'] };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
  });
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      totalRows: rows.length,
      unchangedRows: 0,
      changes: [],
      errors: [`الملف يتجاوز الحد الأقصى المسموح (${MAX_IMPORT_ROWS} صف).`],
    };
  }

  const byId = new Map(materials.map((material) => [String(material.id || '').trim(), material]));
  const byCode = new Map(materials.map((material) => [normalizeCode(material.code), material]));
  const seenMaterialIds = new Set<string>();
  const errors: string[] = [];
  const changes: RepairPartsPricingImportChange[] = [];
  let unchangedRows = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const materialId = String(row[HEADERS.materialId] || '').trim();
    const code = normalizeCode(row[HEADERS.code]);
    const material = (materialId && byId.get(materialId)) || (code && byCode.get(code));
    if (!material?.id) {
      errors.push(`صف ${rowNumber}: لم يتم العثور على قطعة بالمعرف أو الكود المحدد.`);
      return;
    }
    const resolvedId = String(material.id);
    if (seenMaterialIds.has(resolvedId)) {
      errors.push(`صف ${rowNumber}: القطعة ${material.code || resolvedId} مكررة في الملف.`);
      return;
    }
    seenMaterialIds.add(resolvedId);
    if (materialId && materialId !== resolvedId) {
      errors.push(`صف ${rowNumber}: معرف المادة لا يطابق القطعة.`);
      return;
    }
    if (code && code !== normalizeCode(material.code)) {
      errors.push(`صف ${rowNumber}: الكود لا يطابق معرف المادة.`);
      return;
    }

    const rowErrors: string[] = [];
    const consumer = parseOptionalPrice(row[HEADERS.consumer], HEADERS.consumer, rowNumber, rowErrors);
    const trader = parseOptionalPrice(row[HEADERS.trader], HEADERS.trader, rowNumber, rowErrors);
    const cost = parseOptionalPrice(row[HEADERS.cost], HEADERS.cost, rowNumber, rowErrors);
    errors.push(...rowErrors);
    if (rowErrors.length > 0) return;

    const current = currentPrices(material);
    const next = {
      consumer: consumer ?? current.consumer,
      trader: trader ?? current.trader,
      cost: cost ?? current.cost,
    };
    if (
      next.consumer === current.consumer
      && next.trader === current.trader
      && next.cost === current.cost
    ) {
      unchangedRows += 1;
      return;
    }
    changes.push({
      materialId: resolvedId,
      code: normalizeCode(material.code),
      name: String(material.name || material.code || resolvedId),
      current,
      next,
    });
  });

  return { totalRows: rows.length, unchangedRows, changes, errors };
}

export async function parseRepairPartsPricingFile(
  file: File,
  materials: Material[],
): Promise<RepairPartsPricingImportResult> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('حجم ملف Excel أكبر من 5 ميجابايت.');
  }
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    throw new Error('ارفع ملف Excel بصيغة XLSX أو XLS فقط.');
  }
  return parseRepairPartsPricingBuffer(await file.arrayBuffer(), materials);
}
