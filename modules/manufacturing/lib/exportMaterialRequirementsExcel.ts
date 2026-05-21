import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  aggregateByMaterialKey,
  aggregateByProductCategoryKey,
  type MaterialRequirementDetailExportRow,
  type MaterialRequirementSummaryExportRow,
} from './materialRequirementsExportLib';

export type {
  MaterialRequirementDetailExportRow,
  MaterialRequirementSummaryExportRow,
} from './materialRequirementsExportLib';

export {
  aggregateByMaterialKey,
  aggregateByProductCategoryKey,
  materialAggregateKey,
  productCategoryAggregateKey,
  resolveMaterialCategoryLabel,
} from './materialRequirementsExportLib';

const arNum = (n: number) => Number(n || 0);

function detailToSheetRows(rows: MaterialRequirementDetailExportRow[]) {
  return rows.map((r) => ({
    'فئة المنتج': r.productCategoryLabel,
    'كود المنتج': r.productCode,
    'اسم المنتج': r.productName,
    'كمية المنتج': arNum(r.productQuantity),
    'فئة المادة': r.materialCategoryName,
    'كود المادة': r.materialCode,
    'اسم المادة': r.materialName,
    'نوع المادة': r.materialTypeLabel,
    'الاحتياج المطلوب': arNum(r.requiredQty),
    الوحدة: r.unit,
    المتاح: arNum(r.availableQty),
    النقص: arNum(r.shortageQty),
    'التكلفة التقديرية': arNum(r.estimatedCost),
  }));
}

function summaryMaterialToSheetRows(rows: MaterialRequirementSummaryExportRow[]) {
  return rows.map((r) => ({
    'فئة المادة': r.categoryLabel,
    'كود المادة': r.materialCode ?? '',
    'اسم المادة': r.materialName ?? '',
    'عدد البنود': r.itemCount,
    'الاحتياج المجمع': arNum(r.requiredQty),
    المتاح: arNum(r.availableQty),
    النقص: arNum(r.shortageQty),
    'التكلفة المجمعة': arNum(r.estimatedCost),
  }));
}

function summaryProductCategoryToSheetRows(rows: MaterialRequirementSummaryExportRow[]) {
  return rows.map((r) => ({
    'فئة المنتج': r.categoryLabel,
    'كود المادة': r.materialCode ?? '',
    'اسم المادة': r.materialName ?? '',
    'عدد البنود': r.itemCount,
    'الاحتياج المجمع': arNum(r.requiredQty),
    'التكلفة المجمعة': arNum(r.estimatedCost),
  }));
}

function applyRtlSheet(ws: XLSX.WorkSheet) {
  if (!ws['!views']) ws['!views'] = [];
  (ws['!views'] as XLSX.WorkSheet['!views'])?.push({ rightToLeft: true });
}

export function downloadMaterialRequirementsExcel(args: {
  fileName: string;
  detailRows: MaterialRequirementDetailExportRow[];
  summaryByMaterial?: MaterialRequirementSummaryExportRow[];
  summaryByProductCategory?: MaterialRequirementSummaryExportRow[];
}): void {
  const summaryByMaterial = args.summaryByMaterial ?? aggregateByMaterialKey(args.detailRows);
  const summaryByProductCategory =
    args.summaryByProductCategory ?? aggregateByProductCategoryKey(args.detailRows);

  const wb = XLSX.utils.book_new();

  const wsDetail = XLSX.utils.json_to_sheet(detailToSheetRows(args.detailRows));
  applyRtlSheet(wsDetail);
  XLSX.utils.book_append_sheet(wb, wsDetail, 'تفصيل الاحتياجات');

  const wsMat = XLSX.utils.json_to_sheet(summaryMaterialToSheetRows(summaryByMaterial));
  applyRtlSheet(wsMat);
  XLSX.utils.book_append_sheet(wb, wsMat, 'مجمع حسب المادة');

  const wsProd = XLSX.utils.json_to_sheet(summaryProductCategoryToSheetRows(summaryByProductCategory));
  applyRtlSheet(wsProd);
  XLSX.utils.book_append_sheet(wb, wsProd, 'مجمع حسب فئة المنتج');

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  saveAs(new Blob([buf]), args.fileName.endsWith('.xlsx') ? args.fileName : `${args.fileName}.xlsx`);
}
