import type { PrintDocumentTypeId } from '../../types';

export type PrintDocumentFieldDef = {
  key: string;
  labelAr: string;
  defaultVisible: boolean;
  descriptionAr?: string;
  icon?: string;
};

export type PrintDocumentRegistryEntry = {
  id: PrintDocumentTypeId;
  labelAr: string;
  fields: PrintDocumentFieldDef[];
};

export const PRINT_DOCUMENT_TYPE_IDS: readonly PrintDocumentTypeId[] = [
  'productionReport',
  'repairSalesInvoice',
  'stockTransfer',
  'itemCard',
  'accountingReport',
  'qualityReport',
  'payslip',
  'suppliesReceipt',
  'repairPayment',
  'repairSpareIssue',
  'repairSparePartsCount',
  'warehouseStockCount',
  'repairTreasuryMonthly',
  'routingExecution',
  'productionWorkerReport',
  'missingComponentsReport',
  'supervisorPerformance',
  'productBomCountCard',
  'repairJobReceipt',
  'repairJobCard',
  'repairDeliveryReceipt',
  'catalogProductDetail',
  'workOrder',
  'productionIssue',
] as const;

export const PRINT_CUSTOM_LINES_MAX = 5;

const COMMON_SIGNATURES: PrintDocumentFieldDef = {
  key: 'signatures',
  labelAr: 'التواقيع',
  defaultVisible: true,
  descriptionAr: 'خانات التوقيع أسفل المستند',
  icon: 'draw',
};

const COMMON_KPIS: PrintDocumentFieldDef = {
  key: 'kpis',
  labelAr: 'مؤشرات الملخص',
  defaultVisible: true,
  descriptionAr: 'بطاقات الأرقام أعلى المستند',
  icon: 'analytics',
};

const COMMON_META: PrintDocumentFieldDef = {
  key: 'meta',
  labelAr: 'بيانات الترويسة',
  defaultVisible: true,
  descriptionAr: 'بطاقات البيانات التعريفية',
  icon: 'info',
};

export const PRINT_DOCUMENT_REGISTRY: PrintDocumentRegistryEntry[] = [
  {
    id: 'productionReport',
    labelAr: 'تقرير إنتاج',
    fields: [
      { key: 'waste', labelAr: 'الهالك', defaultVisible: true, descriptionAr: 'عمود/بطاقة الهالك ونسبته', icon: 'delete_sweep' },
      { key: 'employee', labelAr: 'المشرف', defaultVisible: true, descriptionAr: 'اسم المشرف / الإشراف', icon: 'person' },
      { key: 'costs', labelAr: 'التكاليف', defaultVisible: true, descriptionAr: 'تكلفة الوحدة والتكاليف الصناعية', icon: 'payments' },
      { key: 'workOrder', labelAr: 'أمر الشغل', defaultVisible: true, descriptionAr: 'رقم أمر الشغل', icon: 'assignment' },
      { key: 'sellingPrice', labelAr: 'سعر البيع', defaultVisible: true, descriptionAr: 'سعر البيع عند توفره في بيانات الطباعة', icon: 'sell' },
      { key: 'qrCode', labelAr: 'رمز QR', defaultVisible: false, descriptionAr: 'رمز تحقق التقرير', icon: 'qr_code' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'repairSalesInvoice',
    labelAr: 'فاتورة صيانة',
    fields: [
      { key: 'customerBlock', labelAr: 'بيانات العميل', defaultVisible: true, descriptionAr: 'اسم العميل والهاتف ومنشئ الفاتورة', icon: 'badge' },
      { key: 'discount', labelAr: 'الخصم', defaultVisible: true, descriptionAr: 'بطاقة/سطر الخصم عند وجوده', icon: 'percent' },
      COMMON_SIGNATURES,
      { key: 'lineSku', labelAr: 'كود القطعة', defaultVisible: true, descriptionAr: 'معرّف القطعة تحت اسم البند', icon: 'qr_code_2' },
      { key: 'statusBadge', labelAr: 'حالة الفاتورة', defaultVisible: true, descriptionAr: 'بطاقة الحالة في الترويسة', icon: 'flag' },
    ],
  },
  {
    id: 'stockTransfer',
    labelAr: 'تحويل مخزون',
    fields: [
      { key: 'itemCode', labelAr: 'كود الصنف', defaultVisible: true, descriptionAr: 'كود الصنف تحت الاسم', icon: 'tag' },
      { key: 'quantityPieces', labelAr: 'عمود القطع', defaultVisible: true, descriptionAr: 'عمود عدد القطع', icon: 'numbers' },
      { key: 'unitsPerCarton', labelAr: 'وحدات الكرتونة', defaultVisible: true, descriptionAr: 'عرض سعة الكرتونة مع الوحدة', icon: 'inventory_2' },
      { key: 'version', labelAr: 'إصدار النظام', defaultVisible: true, descriptionAr: 'وسم Factory في التذييل', icon: 'info' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'itemCard',
    labelAr: 'كارت الصنف',
    fields: [
      { key: 'balances', labelAr: 'الأرصدة', defaultVisible: true, descriptionAr: 'جدول الأرصدة حسب المخزن', icon: 'warehouse' },
      { key: 'bom', labelAr: 'المكونات (BOM)', defaultVisible: true, descriptionAr: 'جدول مكونات التصنيع', icon: 'account_tree' },
      { key: 'movements', labelAr: 'الحركات', defaultVisible: true, descriptionAr: 'آخر حركات المخزون', icon: 'swap_horiz' },
      { key: 'category', labelAr: 'التصنيف', defaultVisible: true, descriptionAr: 'حقل التصنيف في الترويسة', icon: 'category' },
      { key: 'warehouse', labelAr: 'المخزن', defaultVisible: true, descriptionAr: 'اسم المخزن في الترويسة', icon: 'store' },
    ],
  },
  {
    id: 'accountingReport',
    labelAr: 'تقرير محاسبي',
    fields: [COMMON_META, COMMON_KPIS, COMMON_SIGNATURES],
  },
  {
    id: 'qualityReport',
    labelAr: 'تقرير جودة',
    fields: [
      COMMON_META,
      COMMON_KPIS,
      { key: 'defects', labelAr: 'أسباب العيوب', defaultVisible: true, descriptionAr: 'قسم أهم أسباب العيوب', icon: 'bug_report' },
      { key: 'qrCode', labelAr: 'رمز QR', defaultVisible: false, descriptionAr: 'رمز تحقق التقرير', icon: 'qr_code' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'payslip',
    labelAr: 'كشف راتب',
    fields: [
      COMMON_META,
      COMMON_KPIS,
      { key: 'earnings', labelAr: 'الاستحقاقات', defaultVisible: true, descriptionAr: 'جدول المستحقات', icon: 'payments' },
      { key: 'deductions', labelAr: 'الخصومات', defaultVisible: true, descriptionAr: 'جدول الخصومات', icon: 'money_off' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'suppliesReceipt',
    labelAr: 'إذن استلام مستلزمات',
    fields: [
      COMMON_META,
      COMMON_KPIS,
      { key: 'notes', labelAr: 'الملاحظات', defaultVisible: true, descriptionAr: 'ملاحظة الإذن إن وُجدت', icon: 'notes' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'repairPayment',
    labelAr: 'تحصيل / تفصيل حساب صيانة',
    fields: [
      COMMON_META,
      COMMON_KPIS,
      { key: 'customerBlock', labelAr: 'بيانات العميل والحساب', defaultVisible: true, descriptionAr: 'شبكة بيانات العميل والمبالغ', icon: 'badge' },
      { key: 'products', labelAr: 'تفصيل المنتجات', defaultVisible: true, descriptionAr: 'جدول منتجات الطلب', icon: 'inventory_2' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'repairSpareIssue',
    labelAr: 'سند صرف قطع غيار',
    fields: [COMMON_META, COMMON_KPIS, COMMON_SIGNATURES],
  },
  {
    id: 'repairSparePartsCount',
    labelAr: 'ورقة جرد قطع غيار',
    fields: [COMMON_META, COMMON_KPIS, COMMON_SIGNATURES],
  },
  {
    id: 'warehouseStockCount',
    labelAr: 'ورقة جرد مخزن',
    fields: [COMMON_META, COMMON_KPIS, COMMON_SIGNATURES],
  },
  {
    id: 'repairTreasuryMonthly',
    labelAr: 'تقرير خزائن شهري',
    fields: [COMMON_META, COMMON_KPIS, COMMON_SIGNATURES],
  },
  {
    id: 'routingExecution',
    labelAr: 'تقرير تنفيذ مسار',
    fields: [
      COMMON_KPIS,
      { key: 'productBlock', labelAr: 'المنتج والخطة', defaultVisible: true, descriptionAr: 'قسم المنتج وإصدار الخطة', icon: 'precision_manufacturing' },
      { key: 'costs', labelAr: 'التكلفة والأداء', defaultVisible: true, descriptionAr: 'تكلفة الوحدة وإجمالي التكلفة', icon: 'payments' },
      { key: 'steps', labelAr: 'خطوات التنفيذ', defaultVisible: true, descriptionAr: 'تفاصيل خطوات المسار', icon: 'list_alt' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'productionWorkerReport',
    labelAr: 'تقرير عامل إنتاج',
    fields: [COMMON_META, COMMON_SIGNATURES],
  },
  {
    id: 'missingComponentsReport',
    labelAr: 'تقرير مكونات ناقصة',
    fields: [
      COMMON_META,
      COMMON_KPIS,
      { key: 'warehouse', labelAr: 'المخزن', defaultVisible: true, descriptionAr: 'اسم مخزن الصرف', icon: 'warehouse' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'supervisorPerformance',
    labelAr: 'أداء مشرف',
    fields: [
      COMMON_META,
      COMMON_KPIS,
      { key: 'products', labelAr: 'أداء المنتجات', defaultVisible: true, descriptionAr: 'جدول المنتجات', icon: 'inventory_2' },
      { key: 'lines', labelAr: 'أداء الخطوط', defaultVisible: true, descriptionAr: 'جدول خطوط الإنتاج', icon: 'account_tree' },
      { key: 'recommendations', labelAr: 'التوصيات', defaultVisible: true, descriptionAr: 'قسم التوصيات', icon: 'lightbulb' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'productBomCountCard',
    labelAr: 'كارت جرد BOM',
    fields: [
      { key: 'stock', labelAr: 'أرصدة المخزون', defaultVisible: true, descriptionAr: 'أعمدة الرصيد في الكارت', icon: 'warehouse' },
      { key: 'category', labelAr: 'التصنيف', defaultVisible: true, descriptionAr: 'فئة المنتج', icon: 'category' },
      { key: 'warehouse', labelAr: 'المخزن', defaultVisible: true, descriptionAr: 'اسم المخزن في الترويسة', icon: 'store' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'repairJobReceipt',
    labelAr: 'إيصال استلام صيانة',
    fields: [
      { key: 'costs', labelAr: 'التكاليف', defaultVisible: true, descriptionAr: 'عرض التكلفة عند توفرها', icon: 'payments' },
      { key: 'qrCode', labelAr: 'رمز QR', defaultVisible: true, descriptionAr: 'رمز تتبع العميل', icon: 'qr_code' },
      { key: 'products', labelAr: 'المنتجات', defaultVisible: true, descriptionAr: 'جدول المنتجات', icon: 'inventory_2' },
      { key: 'parts', labelAr: 'قطع الغيار', defaultVisible: true, descriptionAr: 'قطع مستخدمة عند وجود تكلفة', icon: 'build' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'repairJobCard',
    labelAr: 'كارت داخلي صيانة',
    fields: [
      { key: 'qrCode', labelAr: 'رمز QR الفني', defaultVisible: true, descriptionAr: 'رمز ورشة الفني', icon: 'qr_code' },
      { key: 'statusBadge', labelAr: 'حالة الطلب', defaultVisible: true, descriptionAr: 'شارة الحالة', icon: 'flag' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'repairDeliveryReceipt',
    labelAr: 'إذن تسليم منتج',
    fields: [
      COMMON_META,
      COMMON_KPIS,
      { key: 'customerBlock', labelAr: 'بيانات العميل', defaultVisible: true, descriptionAr: 'شبكة بيانات المستلم', icon: 'badge' },
      { key: 'products', labelAr: 'المنتجات المسلّمة', defaultVisible: true, descriptionAr: 'جدول المنتجات', icon: 'inventory_2' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'catalogProductDetail',
    labelAr: 'تقرير تفاصيل منتج',
    fields: [
      COMMON_META,
      COMMON_KPIS,
      { key: 'reportsTable', labelAr: 'التقارير التفصيلية', defaultVisible: true, descriptionAr: 'جدول تقارير الإنتاج', icon: 'table_chart' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'workOrder',
    labelAr: 'أمر شغل',
    fields: [
      COMMON_META,
      COMMON_KPIS,
      { key: 'costs', labelAr: 'التكاليف', defaultVisible: true, descriptionAr: 'التكلفة التقديرية والفعلية عند توفرها', icon: 'payments' },
      { key: 'notes', labelAr: 'الملاحظات', defaultVisible: true, descriptionAr: 'ملاحظات أمر الشغل', icon: 'notes' },
      COMMON_SIGNATURES,
    ],
  },
  {
    id: 'productionIssue',
    labelAr: 'إذن صرف إنتاج',
    fields: [
      COMMON_META,
      COMMON_KPIS,
      { key: 'warehouse', labelAr: 'المخزن', defaultVisible: true, descriptionAr: 'مخزن الصرف في الترويسة', icon: 'warehouse' },
      { key: 'lines', labelAr: 'بنود الصرف', defaultVisible: true, descriptionAr: 'جدول المكونات والكميات', icon: 'list_alt' },
      { key: 'notes', labelAr: 'الملاحظات', defaultVisible: true, descriptionAr: 'ملاحظات الإذن', icon: 'notes' },
      COMMON_SIGNATURES,
    ],
  },
];

const registryById = new Map(
  PRINT_DOCUMENT_REGISTRY.map((entry) => [entry.id, entry] as const),
);

export function getPrintDocumentEntry(
  id: PrintDocumentTypeId,
): PrintDocumentRegistryEntry {
  const entry = registryById.get(id);
  if (!entry) {
    throw new Error(`Unknown print document type: ${id}`);
  }
  return entry;
}

export function defaultFieldsForDocument(
  id: PrintDocumentTypeId,
): Record<string, boolean> {
  const fields: Record<string, boolean> = {};
  for (const field of getPrintDocumentEntry(id).fields) {
    fields[field.key] = field.defaultVisible;
  }
  return fields;
}
