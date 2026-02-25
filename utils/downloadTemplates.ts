import * as XLSX from 'xlsx';

export function downloadProductsTemplate() {
  const wb = XLSX.utils.book_new();
  const productsAoa: (string | number)[][] = [
    ['اسم المنتج', 'الكود', 'الفئة', 'الرصيد الافتتاحي', 'تكلفة الوحدة الصينية', 'تكلفة العلبة الداخلية', 'تكلفة الكرتونة الخارجية', 'عدد الوحدات في الكرتونة', 'سعر البيع'],
    ['خلاط سوكانى 6000 وات', 'SK-999N', 'منزلي', 100, 45.5, 2.5, 18, 6, 150],
    ['صمام V-200', 'PRD-002', 'منزلي', 250, 30, 1.8, 12, 12, 85],
    ['مرتبة طبية 120', 'PRD-003', 'سريري', 500, 40, 3, 20, 4, 200],
    ['محور دوران', 'PRD-004', 'سريري', 80, 15, 1, 10, 8, 60],
    ['خلاط يدوي', 'PRD-005', 'منزلي', 2000, 25, 1.5, 14, 10, 90],
  ];
  const productsWs = XLSX.utils.aoa_to_sheet(productsAoa);
  productsWs['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 24 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, productsWs, 'المنتجات');

  const materialsAoa: (string | number)[][] = [
    ['كود المنتج', 'اسم المادة الخام', 'الكمية المستخدمة', 'تكلفة الوحدة'],
    ['SK-999N', 'موتور نحاس', 1, 18],
    ['SK-999N', 'هيكل بلاستيك', 1, 7.5],
    ['PRD-002', 'جلدة مانعة للتسرب', 2, 1.2],
    ['PRD-003', 'قماش خارجي', 1.5, 22],
    ['PRD-003', 'إسفنج', 3, 31],
  ];
  const materialsWs = XLSX.utils.aoa_to_sheet(materialsAoa);
  materialsWs['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, materialsWs, 'المواد الخام');

  XLSX.writeFile(wb, 'template_products.xlsx');
}

export interface ReportsTemplateLookups {
  lines: { name: string }[];
  products: { name: string; code: string }[];
  employees: { name: string; code: string }[];
}

export function downloadReportsTemplate(lookups?: ReportsTemplateLookups) {
  const wb = XLSX.utils.book_new();

  const lineNames = lookups?.lines.map((l) => l.name) ?? [];
  const productNames = lookups?.products.map((p) => p.name) ?? [];
  const employeeEntries = lookups?.employees ?? [];

  // Sheet 1: Main data entry
  const headers = ['التاريخ', 'خط الإنتاج', 'المنتج', 'المشرف', 'كود المشرف', 'الكمية المنتجة', 'الهالك', 'عدد العمال', 'ساعات العمل'];
  const sampleRows: (string | number)[][] = lineNames.length > 0
    ? [
        [getTodayForTemplate(), lineNames[0] ?? '', productNames[0] ?? '', employeeEntries[0]?.name ?? '', employeeEntries[0]?.code ?? '', 500, 10, 8, 8],
        [getTodayForTemplate(), lineNames[Math.min(1, lineNames.length - 1)] ?? '', productNames[Math.min(1, productNames.length - 1)] ?? '', employeeEntries[Math.min(1, employeeEntries.length - 1)]?.name ?? '', employeeEntries[Math.min(1, employeeEntries.length - 1)]?.code ?? '', 300, 5, 6, 8],
      ]
    : [
        ['2026-02-16', 'خط 1', 'منتج أ', 'أحمد محمد', 'EMP-001', 500, 10, 8, 8],
        ['2026-02-16', 'خط 2', 'منتج ب', 'سعيد علي', 'EMP-002', 300, 5, 6, 8],
      ];

  const mainAoa = [headers, ...sampleRows];
  const wsMain = XLSX.utils.aoa_to_sheet(mainAoa);
  wsMain['!cols'] = [
    { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 14 },
    { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
  ];

  // Data validation (dropdowns) — only if we have real data
  if (lineNames.length > 0 || productNames.length > 0 || employeeEntries.length > 0) {
    const maxRows = 500;
    const validations: any[] = [];

    if (lineNames.length > 0) {
      validations.push({
        sqref: `B2:B${maxRows}`,
        type: 'list',
        formula1: `'خطوط الإنتاج'!$A$2:$A$${lineNames.length + 1}`,
      });
    }
    if (productNames.length > 0) {
      validations.push({
        sqref: `C2:C${maxRows}`,
        type: 'list',
        formula1: `'المنتجات'!$A$2:$A$${productNames.length + 1}`,
      });
    }
    if (employeeEntries.length > 0) {
      validations.push({
        sqref: `D2:D${maxRows}`,
        type: 'list',
        formula1: `'المشرفين'!$A$2:$A$${employeeEntries.length + 1}`,
      });
    }

    if (validations.length > 0) {
      wsMain['!dataValidation'] = validations;
    }
  }

  if (!wsMain['!views']) wsMain['!views'] = [];
  (wsMain['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, wsMain, 'تقارير الإنتاج');

  // Sheet 2: Lines reference
  if (lineNames.length > 0) {
    const linesAoa: string[][] = [['خط الإنتاج'], ...lineNames.map((n) => [n])];
    const wsLines = XLSX.utils.aoa_to_sheet(linesAoa);
    wsLines['!cols'] = [{ wch: 28 }];
    XLSX.utils.book_append_sheet(wb, wsLines, 'خطوط الإنتاج');
  }

  // Sheet 3: Products reference
  if (productNames.length > 0) {
    const prodAoa: (string)[][] = [
      ['المنتج', 'الكود'],
      ...lookups!.products.map((p) => [p.name, p.code]),
    ];
    const wsProducts = XLSX.utils.aoa_to_sheet(prodAoa);
    wsProducts['!cols'] = [{ wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsProducts, 'المنتجات');
  }

  // Sheet 4: Employees/Supervisors reference
  if (employeeEntries.length > 0) {
    const empAoa: (string)[][] = [
      ['المشرف', 'الكود'],
      ...employeeEntries.map((e) => [e.name, e.code]),
    ];
    const wsEmps = XLSX.utils.aoa_to_sheet(empAoa);
    wsEmps['!cols'] = [{ wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsEmps, 'المشرفين');
  }

  XLSX.writeFile(wb, 'template_reports.xlsx');
}

function getTodayForTemplate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function downloadHRTemplate() {
  const wb = XLSX.utils.book_new();

  // Sheet 1: الأقسام
  const deptAoa: (string | number)[][] = [
    ['اسم القسم', 'الرمز'],
    ['قسم الإنتاج', 'PRD'],
    ['قسم الجودة', 'QA'],
    ['قسم الصيانة', 'MNT'],
    ['قسم المخازن', 'WH'],
  ];
  const wsDept = XLSX.utils.aoa_to_sheet(deptAoa);
  wsDept['!cols'] = [{ wch: 24 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsDept, 'الأقسام');

  // Sheet 2: المناصب
  const posAoa: (string | number)[][] = [
    ['المنصب', 'القسم', 'المستوى'],
    ['مشغل آلة', 'قسم الإنتاج', 1],
    ['مشرف خط', 'قسم الإنتاج', 2],
    ['مدير الإنتاج', 'قسم الإنتاج', 3],
    ['فاحص جودة', 'قسم الجودة', 1],
    ['مشرف الجودة', 'قسم الجودة', 2],
    ['فني صيانة', 'قسم الصيانة', 1],
    ['أمين مخزن', 'قسم المخازن', 1],
  ];
  const wsPos = XLSX.utils.aoa_to_sheet(posAoa);
  wsPos['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsPos, 'المناصب');

  // Sheet 3: الموظفين
  const empAoa: (string | number | string)[][] = [
    ['اسم الموظف', 'الرمز', 'القسم', 'المنصب', 'المستوى', 'نوع التوظيف', 'الراتب الأساسي', 'أجر الساعة', 'الوردية', 'البريد الإلكتروني', 'الحالة', 'صلاحية النظام'],
    ['أحمد محمد', 'EMP-001', 'قسم الإنتاج', 'مشغل آلة', 1, 'دوام كامل', 3000, 18.75, 'وردية صباحية', 'ahmed@company.com', 'نشط', 'لا'],
    ['سعيد علي', 'EMP-002', 'قسم الإنتاج', 'مشرف خط', 2, 'دوام كامل', 4500, 28.13, 'وردية صباحية', 'saeed@company.com', 'نشط', 'نعم'],
    ['خالد إبراهيم', 'EMP-003', 'قسم الجودة', 'فاحص جودة', 1, 'دوام كامل', 3200, 20, 'وردية صباحية', '', 'نشط', 'لا'],
    ['محمود حسن', 'EMP-004', 'قسم الصيانة', 'فني صيانة', 1, 'عقد', 2800, 17.5, '', '', 'نشط', 'لا'],
  ];
  const wsEmp = XLSX.utils.aoa_to_sheet(empAoa);
  wsEmp['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 18 },
    { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 18 },
    { wch: 24 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsEmp, 'الموظفين');

  XLSX.writeFile(wb, 'template_hr_import.xlsx');
}
