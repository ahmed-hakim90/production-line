import * as XLSX from 'xlsx';

export function downloadProductsTemplate() {
  const wb = XLSX.utils.book_new();
  const aoa: (string | number)[][] = [
    ['اسم المنتج', 'الكود', 'الفئة', 'الرصيد الافتتاحي'],
    ['محرك H-400', 'PRD-001', 'المنتجات النهائية', 100],
    ['صمام V-200', 'PRD-002', 'المنتجات النهائية', 250],
    ['لوح معدني خام', 'PRD-003', 'المواد الخام', 500],
    ['محور دوران', 'PRD-004', 'نصف مصنع', 80],
    ['مسمار 10مم', 'PRD-005', 'المواد الخام', 2000],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, 'template_products.xlsx');
}

export function downloadReportsTemplate() {
  const wb = XLSX.utils.book_new();
  const aoa: (string | number)[][] = [
    ['التاريخ', 'خط الإنتاج', 'المنتج', 'المشرف', 'الكمية المنتجة', 'الهالك', 'عدد العمال', 'ساعات العمل'],
    ['2026-02-16', 'خط 1', 'منتج أ', 'أحمد محمد', 500, 10, 8, 8],
    ['2026-02-16', 'خط 2', 'منتج ب', 'سعيد علي', 300, 5, 6, 8],
    ['2026-02-17', 'خط 1', 'منتج أ', 'أحمد محمد', 450, 8, 8, 8],
    ['2026-02-17', 'خط 3', 'منتج ج', 'محمود حسن', 600, 12, 10, 8],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
    { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, 'template_reports.xlsx');
}
