import * as XLSX from 'xlsx';
import { EMPLOYMENT_TYPE_LABELS, type EmploymentType } from '../types';

/**
 * Product master template only (no BOM sheet).
 * Correct order: 1) مواد تصنيعية → 2) منتجات → 3) مكونات.
 */
export function downloadProductsTemplate() {
  const wb = XLSX.utils.book_new();
  const productsAoa: (string | number)[][] = [
    [
      'اسم المنتج',
      'كود المنتج',
      'باركود العبوة',
      'الفئة',
      'منتج تصنيعي',
      'تكلفة الوحدة الصينية',
      'تكلفة العلبة الداخلية',
      'تكلفة الكرتونة الخارجية',
      'عدد الوحدات في الكرتونة',
      'سعر البيع',
      'تارجت المتوقع تقارير (ث)',
    ],
    ['خلاط سوكانى 6000 وات', 'SK-999N', '622000000001', 'منزلي', 'نعم', 45.5, 2.5, 18, 6, 150],
    ['صمام V-200', 'PRD-002', '622000000002', 'منزلي', 'نعم', 30, 1.8, 12, 12, 85],
    ['مكنسة مستوردة', 'PRD-SP-01', '622000000099', 'منزلي', 'لا', '', '', '', '', 350],
    ['مرتبة طبية 120', 'PRD-003', '622000000003', 'سريري', 'نعم', 40, 3, 20, 4, 200],
  ];
  const productsWs = XLSX.utils.aoa_to_sheet(productsAoa);
  productsWs['!cols'] = [
    { wch: 28 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
    { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 24 }, { wch: 14 }, { wch: 22 },
  ];
  if (!productsWs['!views']) productsWs['!views'] = [];
  (productsWs['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, productsWs, 'المنتجات');

  const guideAoa: (string | number)[][] = [
    ['الموضوع', 'التفاصيل'],
    ['ترتيب العمل الصحيح', '1) ارفع المواد من شاشة المواد التصنيعية  2) ارفع المنتجات من هنا  3) اربط المكونات من «رفع/تحديث مكونات المنتجات»'],
    ['هذا الملف', 'بيانات المنتج فقط — لا يربط قطع الغيار ولا يكتب BOM'],
    ['بعد الرفع', 'استخدم «تحميل قالب المكونات» أو «تصدير مكونات المنتجات (للاستيراد)» للربط بكود المنتج + كود المادة'],
    ['—', '—'],
    ['العمود', 'إلزامي؟ / ملاحظات'],
    ['اسم المنتج', 'للإنشاء — عند التحديث: فاضي = لا تغيّر'],
    ['كود المنتج', 'نعم — مفتاح المطابقة؛ لا يُغيَّر عبر الاستيراد'],
    ['باركود العبوة', 'للإنشاء — فريد داخل الشركة'],
    ['الفئة', 'لا'],
    ['منتج تصنيعي', 'لا — نعم = يظهر في الإنتاج؛ لا = للصيانة/قطع الغيار فقط'],
    ['التكاليف / سعر البيع / التارجت', 'لا — حسب الصلاحيات'],
  ];
  const guideWs = XLSX.utils.aoa_to_sheet(guideAoa);
  guideWs['!cols'] = [{ wch: 28 }, { wch: 72 }];
  if (!guideWs['!views']) guideWs['!views'] = [];
  (guideWs['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, guideWs, 'تعليمات');

  XLSX.writeFile(wb, 'template_products.xlsx');
}

/** BOM / spare-catalog lines + optional location + absolute balance. */
export function downloadProductComponentsTemplate() {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [
    [
      'كود المنتج',
      'كود المادة',
      'اسم المادة',
      'الكمية المستخدمة',
      'تكلفة الوحدة',
      'كود اللوكيشن',
      'كود اللوكيشن السابق',
      'رصيد المكون',
    ],
    ['SK-999N', 'MAT-001', 'موتور نحاس', 1, 18, '20-01-0', '20-01-0', 100],
    ['SK-999N', 'MAT-002', 'هيكل بلاستيك', 1, 7.5, '20-01-0', '20-01-0', 50],
    ['PRD-SP-01', 'MAT-498', 'بودي', '', '', '', '', ''],
    ['PRD-002', 'MAT-003', 'جلدة مانعة للتسرب', 2, 1.2, '', '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 20 },
    { wch: 14 },
  ];
  if (!ws['!views']) ws['!views'] = [];
  (ws['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, ws, 'مكونات المنتجات');

  const guideAoa: (string | number)[][] = [
    ['الموضوع', 'التفاصيل'],
    ['متى تستخدم هذا الملف؟', 'بعد وجود المنتجات والمواد — لربط المكونات (BOM أو كتالوج قطع صيانة)'],
    ['الربط', 'كود المنتج (موجود) + كود المادة (موجودة أو كود جديد + اسم لإنشائها)'],
    ['كمية الاستخدام', 'رقم > 0 للمنتج التصنيعي؛ فاضي/صفر = قطعة غيار بدون استهلاك تصنيع'],
    ['الرصيد / اللوكيشن', 'اختياري للجرد — فاضي = تحديث المكونات فقط بدون لمس المخزون'],
    ['—', '—'],
    ['العمود', 'إلزامي؟ / ملاحظات'],
    ['كود المنتج', 'نعم — منتج موجود مسبقاً'],
    ['كود المادة / اسم المادة', 'نعم — كود جديد + اسم = إنشاء مادة تلقائياً (بيانات أساسية فقط)'],
    ['الكمية المستخدمة', 'لا — فاضي/صفر = كتالوج قطع صيانة'],
    ['تكلفة الوحدة', 'لا'],
    ['كود اللوكيشن', 'لا — اللوكيشن الهدف للجرد/النقل'],
    ['كود اللوكيشن السابق', 'لا — للنقل وتصفير اللوكيشن القديم'],
    ['رصيد المكون', 'لا — الكمية الفعلية؛ فاضي = بدون تسوية مخزون'],
  ];
  const guideWs = XLSX.utils.aoa_to_sheet(guideAoa);
  guideWs['!cols'] = [{ wch: 28 }, { wch: 72 }];
  if (!guideWs['!views']) guideWs['!views'] = [];
  (guideWs['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, guideWs, 'تعليمات');

  XLSX.writeFile(wb, 'template_product_components.xlsx');
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

export interface HRTemplateLookups {
  departments: Array<{ id?: string; name: string; code?: string }>;
  positions: Array<{ id?: string; title: string; departmentId?: string; level?: number }>;
  employees: Array<{
    name: string;
    code?: string;
    phone?: string;
    departmentId?: string;
    jobPositionId?: string;
    level?: number;
    employmentType?: EmploymentType;
    baseSalary?: number;
    hourlyRate?: number;
    shiftId?: string;
    vehicleId?: string;
    email?: string;
    isActive?: boolean;
    hasSystemAccess?: boolean;
  }>;
  shifts: Array<{ id?: string; name: string }>;
  vehicles: Array<{ id?: string; name: string }>;
}

export function downloadHRTemplate(lookups?: HRTemplateLookups) {
  const wb = XLSX.utils.book_new();
  const hasSystemLookups = !!lookups && lookups.employees.length > 0;

  const departments = hasSystemLookups
    ? lookups!.departments
    : [
        { name: 'قسم الإنتاج', code: 'PRD' },
        { name: 'قسم الجودة', code: 'QA' },
        { name: 'قسم الصيانة', code: 'MNT' },
        { name: 'قسم المخازن', code: 'WH' },
      ];
  const departmentNameById = new Map(departments.map((d) => [d.id ?? '', d.name]));

  const positions = hasSystemLookups
    ? lookups!.positions
    : [
        { title: 'مشغل آلة', departmentId: '', level: 1 },
        { title: 'مشرف خط', departmentId: '', level: 2 },
        { title: 'مدير الإنتاج', departmentId: '', level: 3 },
        { title: 'فاحص جودة', departmentId: '', level: 1 },
        { title: 'مشرف الجودة', departmentId: '', level: 2 },
        { title: 'فني صيانة', departmentId: '', level: 1 },
        { title: 'أمين مخزن', departmentId: '', level: 1 },
      ];
  const positionTitleById = new Map(positions.map((p) => [p.id ?? '', p.title]));
  const shiftNameById = new Map((lookups?.shifts ?? []).map((s) => [s.id ?? '', s.name]));
  const vehicleNameById = new Map((lookups?.vehicles ?? []).map((v) => [v.id ?? '', v.name]));

  // Sheet 1: الأقسام
  const deptAoa: (string | number)[][] = [
    ['اسم القسم', 'الرمز'],
    ...departments.slice(0, 12).map((dept) => [
      dept.name,
      dept.code?.trim() || dept.name.substring(0, 3).toUpperCase(),
    ]),
  ];
  const wsDept = XLSX.utils.aoa_to_sheet(deptAoa);
  wsDept['!cols'] = [{ wch: 24 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsDept, 'الأقسام');

  // Sheet 2: المناصب
  const posAoa: (string | number)[][] = [
    ['المنصب', 'القسم', 'المستوى'],
    ...positions.slice(0, 20).map((pos) => [
      pos.title,
      departmentNameById.get(pos.departmentId ?? '') || departments[0]?.name || '',
      Number(pos.level) || 1,
    ]),
  ];
  const wsPos = XLSX.utils.aoa_to_sheet(posAoa);
  wsPos['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsPos, 'المناصب');

  // Sheet 3: الموظفين
  const employeeRowsFromSystem: (string | number)[][] = hasSystemLookups
    ? lookups!.employees
        .filter((emp) => String(emp.name || '').trim().length > 0)
        .slice(0, 6)
        .map((emp) => [
          emp.name,
          emp.code || '',
          emp.phone || '',
          departmentNameById.get(emp.departmentId ?? '') || '',
          positionTitleById.get(emp.jobPositionId ?? '') || '',
          Number(emp.level) || 1,
          EMPLOYMENT_TYPE_LABELS[(emp.employmentType ?? 'full_time') as EmploymentType] || 'دوام كامل',
          Number(emp.baseSalary) || 0,
          Number(emp.hourlyRate) || 0,
          shiftNameById.get(emp.shiftId ?? '') || '',
          vehicleNameById.get(emp.vehicleId ?? '') || '',
          emp.email || '',
          emp.isActive === false ? 'غير نشط' : 'نشط',
          emp.hasSystemAccess ? 'نعم' : 'لا',
        ])
    : [];

  const empAoa: (string | number | string)[][] = [
    ['اسم الموظف', 'الرمز', 'رقم الهاتف', 'القسم', 'المنصب', 'المستوى', 'نوع التوظيف', 'الراتب الأساسي', 'أجر الساعة', 'الوردية', 'المركبة', 'البريد الإلكتروني', 'الحالة', 'صلاحية النظام'],
    ...(employeeRowsFromSystem.length > 0
      ? employeeRowsFromSystem
      : [
          ['أحمد محمد', 'EMP-001', '201001112233', 'قسم الإنتاج', 'مشغل آلة', 1, 'دوام كامل', 3000, 18.75, 'وردية صباحية', 'سيارة نقل 1', 'ahmed@company.com', 'نشط', 'لا'],
          ['سعيد علي', 'EMP-002', '201009998877', 'قسم الإنتاج', 'مشرف خط', 2, 'دوام كامل', 4500, 28.13, 'وردية صباحية', '', 'saeed@company.com', 'نشط', 'نعم'],
          ['خالد إبراهيم', 'EMP-003', '01012345678', 'قسم الجودة', 'فاحص جودة', 1, 'دوام كامل', 3200, 20, 'وردية صباحية', '', '', 'نشط', 'لا'],
          ['محمود حسن', 'EMP-004', '', 'قسم الصيانة', 'فني صيانة', 1, 'عقد', 2800, 17.5, '', '', '', 'نشط', 'لا'],
          ['محمد سمير', 'EMP-005', '01055555555', 'قسم المخازن', 'أمين مخزن', 1, 'دوام كامل', 2900, 18, '', '', '', 'نشط', 'لا'],
          ['سارة عبدالله', 'EMP-006', '01066666666', 'قسم الجودة', 'مشرف الجودة', 2, 'دوام كامل', 4800, 30, '', '', 'sara@company.com', 'نشط', 'نعم'],
        ]),
  ];
  const wsEmp = XLSX.utils.aoa_to_sheet(empAoa);
  wsEmp['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
    { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 18 },
    { wch: 20 }, { wch: 24 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsEmp, 'الموظفين');

  XLSX.writeFile(wb, 'template_hr_import.xlsx');
}

export function downloadInventoryInByCodeTemplate() {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [
    ['كود المنتج', 'الكمية', 'كود اللوكيشن'],
    ['SK-999N', 120, '20-01-0'],
    ['PRD-002', 45, '20-01-0'],
    ['PRD-003', 200, ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 16 }];
  if (!ws['!views']) ws['!views'] = [];
  (ws['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, ws, 'إضافة منتج نهائي');
  XLSX.writeFile(wb, 'template_inventory_in_by_code.xlsx');
}

export function downloadInventoryRawInByCodeTemplate() {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [
    ['كود المادة الخام', 'الكمية', 'كود اللوكيشن'],
    ['RM-0001', 300, '20-01-0'],
    ['RM-0002', 125, '20-01-0'],
    ['RM-0003', 40, ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 16 }];
  if (!ws['!views']) ws['!views'] = [];
  (ws['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, ws, 'إضافة مواد خام');
  XLSX.writeFile(wb, 'template_inventory_raw_in_by_code.xlsx');
}

/** Template for manufacturing materials master (round-trip with export). */
export function downloadMaterialsTemplate() {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [
    [
      'مصدر المادة',
      'كود المادة',
      'اسم المادة',
      'الفئة',
      'النوع',
      'الوحدة الأساسية',
      'وحدة الشراء',
      'معامل التحويل',
      'تكلفة الشراء',
      'هالك %',
      'الحد الأدنى للمخزون',
      'كود المنتج المرتبط',
      'تظهر في قطع الغيار',
      'الحالة',
    ],
    ['شراء خارجي', 'MAT-001', 'موتور نحاس', 'كهرباء', 'مادة خام', 'قطعة', 'قطعة', 1, 18, 2, 10, '', 'نعم', 'نشط'],
    ['شراء خارجي', 'MAT-002', 'خام بلاستيك', 'بلاستيك', 'مادة خام', 'كجم', 'كجم', 1, 60, 0, 20, '', 'نعم', 'نشط'],
    ['تُصنع داخلياً', 'SF-010', 'قطعة حقن نصف مصنعة', 'حقن', 'نصف مصنع', 'قطعة', '', '', '', '', 5, '', 'لا', 'نشط'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 10 },
  ];
  if (!ws['!views']) ws['!views'] = [];
  (ws['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, ws, 'المواد التصنيعية');

  const guideAoa: (string | number)[][] = [
    ['الموضوع', 'التفاصيل'],
    ['ترتيب العمل الصحيح', '1) ارفع المواد من هنا أولاً  2) ارفع المنتجات من شاشة المنتجات  3) اربط المكونات من «رفع/تحديث مكونات المنتجات»'],
    ['هذا الملف', 'ماستر المواد التصنيعية فقط — لا يكتب منتجات ولا BOM'],
    ['للتعديل الجماعي', 'صدّر المواد من الشاشة ← عدّل الشيت ← ارفعه من «رفع/تحديث المواد»'],
    ['—', '—'],
    ['العمود', 'إلزامي؟ / القيم المقبولة'],
    ['مصدر المادة', 'للإنشاء — شراء خارجي | تُصنع داخلياً'],
    ['كود المادة', 'نعم — مفتاح المطابقة؛ لا يُغيَّر عبر الاستيراد'],
    ['اسم المادة', 'للإنشاء — عند التحديث: فاضي = لا تغيّر'],
    ['الفئة', 'لا — اسم الفئة أو المسار (أ > ب)'],
    ['النوع', 'لا — مادة خام | نصف مصنع | مستهلكات | تعبئة وتغليف'],
    ['الوحدة الأساسية', 'لا — قطعة | كجم | جرام | متر | لتر'],
    ['وحدة الشراء', 'للشراء فقط'],
    ['معامل التحويل', 'للشراء فقط'],
    ['تكلفة الشراء', 'للشراء فقط'],
    ['هالك %', 'للشراء فقط'],
    ['الحد الأدنى للمخزون', 'لا — رقم ≥ 0'],
    ['كود المنتج المرتبط', 'لا — لربط تكلفة التصنيع الداخلي بمنتج'],
    ['تظهر في قطع الغيار', 'لا — نعم | لا (الافتراضي نعم؛ لا = ممنوع من السيرفر)'],
    ['الحالة', 'لا — نشط | موقوف'],
    ['—', 'الأعمدة غير المعبأة لا تُعاد كتابتها عند التحديث'],
  ];
  const guideWs = XLSX.utils.aoa_to_sheet(guideAoa);
  guideWs['!cols'] = [{ wch: 28 }, { wch: 72 }];
  if (!guideWs['!views']) guideWs['!views'] = [];
  (guideWs['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, guideWs, 'تعليمات');

  XLSX.writeFile(wb, 'template_manufacturing_materials.xlsx');
}

/** @deprecated Use downloadMaterialsTemplate — manufacturing materials master. */
export function downloadRawMaterialsMasterTemplate() {
  downloadMaterialsTemplate();
}

export function downloadUsersTemplate() {
  const wb = XLSX.utils.book_new();

  const usersAoa: (string | number)[][] = [
    ['الاسم', 'البريد الإلكتروني', 'كلمة المرور', 'الدور', 'كود الموظف'],
    ['أحمد محمد', 'ahmed.user@company.com', '123456', 'مشرف', 'EMP-001'],
    ['سارة علي', 'sara.user@company.com', '123456', 'مدير المصنع', 'EMP-002'],
    ['مستخدم بدون موظف', 'no.employee@company.com', '123456', 'مشرف', ''],
  ];

  const usersWs = XLSX.utils.aoa_to_sheet(usersAoa);
  usersWs['!cols'] = [
    { wch: 24 },
    { wch: 30 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
  ];
  if (!usersWs['!views']) usersWs['!views'] = [];
  (usersWs['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, usersWs, 'المستخدمون');

  const notesAoa: (string | number)[][] = [
    ['ملاحظات الاستيراد'],
    ['- الحقول المطلوبة: الاسم + البريد الإلكتروني + كلمة المرور + الدور.'],
    ['- كود الموظف اختياري، وإذا تم إدخاله يجب أن يكون موجودًا في بيانات الموظفين.'],
    ['- يمكن كتابة الدور بالاسم أو بالـ Role ID.'],
    ['- الاستيراد لا ينشئ الحسابات فورًا، سيتم مراجعة الصفوف ثم إنشاء الحسابات يدويًا من الشاشة.'],
  ];
  const notesWs = XLSX.utils.aoa_to_sheet(notesAoa);
  notesWs['!cols'] = [{ wch: 100 }];
  if (!notesWs['!views']) notesWs['!views'] = [];
  (notesWs['!views'] as any[]).push({ rightToLeft: true });
  XLSX.utils.book_append_sheet(wb, notesWs, 'ملاحظات');

  XLSX.writeFile(wb, 'template_users_import.xlsx');
}
