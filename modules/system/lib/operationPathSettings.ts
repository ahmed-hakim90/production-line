import type {
  OperationPathControl,
  OperationPathSettings,
  SystemSettings,
} from '../../../types';

export const PRODUCTION_REPORT_OPERATION_KEYS = {
  create: 'production.report.create',
  update: 'production.report.update',
  delete: 'production.report.delete',
  shift: 'production.report.shift',
  reconcile: 'production.report.reconcile',
} as const;

export const PRODUCTION_REPORT_CREATE_PATHS = {
  reportsPage: 'reports_page',
  globalModal: 'global_modal',
  productionPlan: 'production_plan',
  supervisorDetails: 'supervisor_details',
  quickAction: 'quick_action',
  reportsImport: 'reports_import',
  globalImport: 'global_import',
  workOrderCompletion: 'work_order_completion',
  componentWaste: 'component_waste',
} as const;

export const PRODUCTION_REPORT_UPDATE_PATHS = {
  reportsPage: 'reports_page',
  shiftClose: 'shift_close',
  importUpdate: 'import_update',
  attendanceSync: 'attendance_sync',
  costSnapshot: 'cost_snapshot',
} as const;

export const PRODUCTION_REPORT_DELETE_PATHS = {
  reportsPage: 'reports_page',
  bulkDelete: 'bulk_delete',
} as const;

export const PRODUCTION_REPORT_SHIFT_PATHS = {
  employeeDashboard: 'employee_dashboard',
} as const;

export const PRODUCTION_REPORT_RECONCILE_PATHS = {
  reportsPage: 'reports_page',
  workOrdersPage: 'work_orders_page',
} as const;

export const PRODUCTION_PLAN_OPERATION_KEYS = {
  create: 'production.plan.create',
  update: 'production.plan.update',
} as const;

export const PRODUCTION_PLAN_CREATE_PATHS = {
  plansPage: 'plans_page',
  globalImport: 'global_import',
  productionIssueRequests: 'production_issue_requests',
} as const;

export const PRODUCTION_PLAN_UPDATE_PATHS = {
  plansPageEdit: 'plans_page_edit',
  plansPageStatus: 'plans_page_status',
  plansPageBulkDateShift: 'plans_page_bulk_date_shift',
} as const;

export const WORK_ORDER_OPERATION_KEYS = {
  create: 'production.workOrder.create',
  update: 'production.workOrder.update',
} as const;

export const WORK_ORDER_CREATE_PATHS = {
  workOrdersPage: 'work_orders_page',
  productionPlan: 'production_plan',
} as const;

export const WORK_ORDER_UPDATE_PATHS = {
  workOrderModal: 'work_order_modal',
  workOrdersPageStatus: 'work_orders_page_status',
  employeeDashboard: 'employee_dashboard',
  scanner: 'scanner',
  qualityIpqc: 'quality_ipqc',
  qualityFinalInspection: 'quality_final_inspection',
} as const;

export const PRODUCT_OPERATION_KEYS = {
  create: 'catalog.product.create',
  update: 'catalog.product.update',
} as const;

export const PRODUCT_CREATE_PATHS = {
  globalModal: 'global_modal',
  productsImport: 'products_import',
} as const;

export const PRODUCT_UPDATE_PATHS = {
  globalModal: 'global_modal',
  productsPageBulk: 'products_page_bulk',
  productsImport: 'products_import',
  productsPageToggle: 'products_page_toggle',
} as const;

export const INVENTORY_OPERATION_KEYS = {
  stockMove: 'inventory.stock.move',
  transferCreate: 'inventory.transfer.create',
  transferApprove: 'inventory.transfer.approve',
  transferReject: 'inventory.transfer.reject',
  productionHandoverConfirm: 'inventory.productionHandover.confirmReceipt',
} as const;

export const INVENTORY_STOCK_MOVE_PATHS = {
  movementsForm: 'movements_form',
  immediateTransfer: 'immediate_transfer',
  adjustmentModal: 'adjustment_modal',
  importInByCode: 'import_in_by_code',
  consumableAddStock: 'consumable_add_stock',
  consumableSheetImport: 'consumable_sheet_import',
  productsComponentImport: 'products_component_import',
  transferApproval: 'transfer_approval',
  suppliesReceipt: 'supplies_receipt',
  disassembly: 'disassembly',
  componentReturn: 'component_return',
  componentCompensation: 'component_compensation',
  productionIssueReverse: 'production_issue_reverse',
} as const;

export const INVENTORY_TRANSFER_CREATE_PATHS = {
  movementsForm: 'movements_form',
  quickTransfer: 'quick_transfer',
} as const;

export const INVENTORY_TRANSFER_DECISION_PATHS = {
  transferApprovalsPage: 'transfer_approvals_page',
  stockTransactionsPage: 'stock_transactions_page',
} as const;

export const INVENTORY_HANDOVER_RECEIPT_PATHS = {
  packagingControl: 'packaging_control',
} as const;

export const INVENTORY_DOCUMENT_OPERATION_KEYS = {
  suppliesReceiptApprove: 'inventory.suppliesReceipt.approve',
  suppliesReceiptReject: 'inventory.suppliesReceipt.reject',
  suppliesReceiptExecute: 'inventory.suppliesReceipt.execute',
  disassemblyApprove: 'inventory.disassembly.approve',
  disassemblyReject: 'inventory.disassembly.reject',
  disassemblyExecute: 'inventory.disassembly.execute',
} as const;

export const INVENTORY_DOCUMENT_PATHS = {
  operationPage: 'operation_page',
  approvalsHub: 'approvals_hub',
} as const;

export const MANUFACTURING_OPERATION_KEYS = {
  materialCreate: 'manufacturing.material.create',
  materialUpdate: 'manufacturing.material.update',
  bomUpsert: 'manufacturing.bom.manage',
} as const;

export const MATERIAL_CREATE_PATHS = {
  materialsPage: 'materials_page',
  materialsImport: 'materials_import',
  consumableDefineModal: 'consumable_define_modal',
  consumableSheetImport: 'consumable_sheet_import',
  productsComponentsImport: 'products_components_import',
  migration: 'migration',
} as const;

export const MATERIAL_UPDATE_PATHS = {
  materialsPage: 'materials_page',
  materialsImport: 'materials_import',
  repairPartsPricing: 'repair_parts_pricing',
  migration: 'migration',
} as const;

export const BOM_UPSERT_PATHS = {
  productBomSection: 'product_bom_section',
  productsImportBom: 'products_import_bom',
  productsComponentsImport: 'products_components_import',
  migration: 'migration',
} as const;

export const WORKER_ASSIGNMENT_OPERATION_KEYS = {
  permanent: 'production.lineWorker.managePermanentAssignment',
  daily: 'production.lineWorker.manageDailyAssignment',
} as const;

export const PERMANENT_WORKER_ASSIGNMENT_PATHS = {
  lineWorkersPage: 'line_workers_page',
  quickAction: 'quick_action',
  productionWorkersPage: 'production_workers_page',
  workerProfileSection: 'worker_profile_section',
} as const;

export const DAILY_WORKER_ASSIGNMENT_PATHS = {
  quickAction: 'quick_action',
  reportsWorkersModal: 'reports_workers_modal',
  lineWorkersPage: 'line_workers_page',
  productionWorkersPage: 'production_workers_page',
} as const;

export type ProductionReportCreatePath =
  (typeof PRODUCTION_REPORT_CREATE_PATHS)[keyof typeof PRODUCTION_REPORT_CREATE_PATHS];
export type ProductionReportUpdatePath =
  (typeof PRODUCTION_REPORT_UPDATE_PATHS)[keyof typeof PRODUCTION_REPORT_UPDATE_PATHS];
export type ProductionReportReconcilePath =
  (typeof PRODUCTION_REPORT_RECONCILE_PATHS)[keyof typeof PRODUCTION_REPORT_RECONCILE_PATHS];
export type ProductionPlanCreatePath =
  (typeof PRODUCTION_PLAN_CREATE_PATHS)[keyof typeof PRODUCTION_PLAN_CREATE_PATHS];
export type ProductionPlanUpdatePath =
  (typeof PRODUCTION_PLAN_UPDATE_PATHS)[keyof typeof PRODUCTION_PLAN_UPDATE_PATHS];
export type WorkOrderCreatePath =
  (typeof WORK_ORDER_CREATE_PATHS)[keyof typeof WORK_ORDER_CREATE_PATHS];
export type WorkOrderUpdatePath =
  (typeof WORK_ORDER_UPDATE_PATHS)[keyof typeof WORK_ORDER_UPDATE_PATHS];
export type ProductCreatePath =
  (typeof PRODUCT_CREATE_PATHS)[keyof typeof PRODUCT_CREATE_PATHS];
export type ProductUpdatePath =
  (typeof PRODUCT_UPDATE_PATHS)[keyof typeof PRODUCT_UPDATE_PATHS];
export type InventoryStockMovePath =
  (typeof INVENTORY_STOCK_MOVE_PATHS)[keyof typeof INVENTORY_STOCK_MOVE_PATHS];
export type InventoryTransferCreatePath =
  (typeof INVENTORY_TRANSFER_CREATE_PATHS)[keyof typeof INVENTORY_TRANSFER_CREATE_PATHS];
export type InventoryTransferDecisionPath =
  (typeof INVENTORY_TRANSFER_DECISION_PATHS)[keyof typeof INVENTORY_TRANSFER_DECISION_PATHS];
export type InventoryDocumentPath =
  (typeof INVENTORY_DOCUMENT_PATHS)[keyof typeof INVENTORY_DOCUMENT_PATHS];
export type MaterialCreatePath =
  (typeof MATERIAL_CREATE_PATHS)[keyof typeof MATERIAL_CREATE_PATHS];
export type MaterialUpdatePath =
  (typeof MATERIAL_UPDATE_PATHS)[keyof typeof MATERIAL_UPDATE_PATHS];
export type BomUpsertPath =
  (typeof BOM_UPSERT_PATHS)[keyof typeof BOM_UPSERT_PATHS];
export type PermanentWorkerAssignmentPath =
  (typeof PERMANENT_WORKER_ASSIGNMENT_PATHS)[keyof typeof PERMANENT_WORKER_ASSIGNMENT_PATHS];
export type DailyWorkerAssignmentPath =
  (typeof DAILY_WORKER_ASSIGNMENT_PATHS)[keyof typeof DAILY_WORKER_ASSIGNMENT_PATHS];

export type OperationPathRegistryEntry = {
  key: string;
  module: 'production' | 'inventory' | 'hr' | 'system' | 'catalog' | 'costs' | 'quality' | 'repair' | 'manufacturing';
  label: string;
  description: string;
  paths: ReadonlyArray<{
    key: string;
    label: string;
    description: string;
  }>;
};

export const OPERATION_PATH_REGISTRY: ReadonlyArray<OperationPathRegistryEntry> = [
  {
    key: INVENTORY_OPERATION_KEYS.stockMove,
    module: 'inventory',
    label: 'ترحيل حركة مخزون',
    description: 'كل الإدخالات والإخراجات والتسويات والتحويلات تستخدم محرك الأرصدة نفسه.',
    paths: [
      { key: INVENTORY_STOCK_MOVE_PATHS.movementsForm, label: 'نموذج حركة المخزون', description: 'إضافة إدخال أو إخراج يدوي.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.immediateTransfer, label: 'تحويل فوري', description: 'تحويل لا يحتاج موافقة.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.adjustmentModal, label: 'مودال التسوية', description: 'تسوية من الأرصدة أو الاستثناءات أو التنبيهات.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.importInByCode, label: 'استيراد إدخال بالكود', description: 'حركات إدخال من ملف.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.consumableAddStock, label: 'إضافة رصيد مستهلك', description: 'إدخال رصيد صنف مستهلك.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.consumableSheetImport, label: 'رفع شيت مستهلكات', description: 'تحديث أرصدة وأسعار المستهلكات من ملف Excel.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.productsComponentImport, label: 'استيراد مكونات المنتجات', description: 'تسوية أرصدة مرتبطة باستيراد المكونات.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.transferApproval, label: 'تنفيذ تحويل معتمد', description: 'ترحيل الحركة بعد اعتماد التحويل.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.suppliesReceipt, label: 'تنفيذ استلام توريد', description: 'إدخال المخزون من أمر استلام.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.disassembly, label: 'تنفيذ فك تجميع', description: 'حركات ناتجة عن فك التجميع.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.componentReturn, label: 'مرتجع مكون', description: 'إرجاع مكون من أرضية الإنتاج.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.componentCompensation, label: 'تعويض مكون', description: 'صرف مكون تعويضي معتمد.' },
      { key: INVENTORY_STOCK_MOVE_PATHS.productionIssueReverse, label: 'عكس صرف إنتاج', description: 'عكس المخزون عند إلغاء الصرف.' },
    ],
  },
  {
    key: INVENTORY_OPERATION_KEYS.transferCreate,
    module: 'inventory',
    label: 'إنشاء طلب تحويل مخزون',
    description: 'النموذج الكامل والتحويل السريع يستخدمان نفس عقد الطلب.',
    paths: [
      { key: INVENTORY_TRANSFER_CREATE_PATHS.movementsForm, label: 'نموذج الحركات', description: 'تحويل من شاشة حركة المخزون.' },
      { key: INVENTORY_TRANSFER_CREATE_PATHS.quickTransfer, label: 'التحويل السريع', description: 'صفحة التحويل السريع.' },
    ],
  },
  {
    key: INVENTORY_OPERATION_KEYS.transferApprove,
    module: 'inventory',
    label: 'اعتماد تحويل مخزون',
    description: 'اعتماد التحويل وتنفيذ الحركة من شاشة الاعتمادات أو الحركات.',
    paths: [
      { key: INVENTORY_TRANSFER_DECISION_PATHS.transferApprovalsPage, label: 'صفحة اعتماد التحويلات', description: 'اعتماد فردي أو جماعي.' },
      { key: INVENTORY_TRANSFER_DECISION_PATHS.stockTransactionsPage, label: 'صفحة حركات المخزون', description: 'اعتماد طلب معلق من سجل الحركات.' },
    ],
  },
  {
    key: INVENTORY_OPERATION_KEYS.transferReject,
    module: 'inventory',
    label: 'رفض تحويل مخزون',
    description: 'رفض الطلب يستخدم نفس تحديث الحالة والتدقيق.',
    paths: [
      { key: INVENTORY_TRANSFER_DECISION_PATHS.transferApprovalsPage, label: 'صفحة اعتماد التحويلات', description: 'رفض من قائمة الاعتمادات.' },
      { key: INVENTORY_TRANSFER_DECISION_PATHS.stockTransactionsPage, label: 'صفحة حركات المخزون', description: 'رفض من سجل الحركات.' },
    ],
  },
  {
    key: INVENTORY_OPERATION_KEYS.productionHandoverConfirm,
    module: 'inventory',
    label: 'استلام تغليف بكمية',
    description: 'تأكيد الكمية الفعلية من تحت التسليم إلى بانتظار التغليف، مع إمكانية إقفال الفرق على المحوّل.',
    paths: [
      {
        key: INVENTORY_HANDOVER_RECEIPT_PATHS.packagingControl,
        label: 'تحكم التغليف',
        description: 'استلام جزئي أو إقفال نهائي بفرق من صفحة تحكم التغليف.',
      },
    ],
  },
  ...([
    [INVENTORY_DOCUMENT_OPERATION_KEYS.suppliesReceiptApprove, 'اعتماد استلام توريد', 'اعتماد'],
    [INVENTORY_DOCUMENT_OPERATION_KEYS.suppliesReceiptReject, 'رفض استلام توريد', 'رفض'],
    [INVENTORY_DOCUMENT_OPERATION_KEYS.suppliesReceiptExecute, 'تنفيذ استلام توريد', 'تنفيذ'],
    [INVENTORY_DOCUMENT_OPERATION_KEYS.disassemblyApprove, 'اعتماد فك تجميع', 'اعتماد'],
    [INVENTORY_DOCUMENT_OPERATION_KEYS.disassemblyReject, 'رفض فك تجميع', 'رفض'],
    [INVENTORY_DOCUMENT_OPERATION_KEYS.disassemblyExecute, 'تنفيذ فك تجميع', 'تنفيذ'],
  ] as const).map(([key, label, verb]) => ({
    key,
    module: 'inventory' as const,
    label,
    description: `${verb} المستند من شاشة التشغيل أو مركز الاعتمادات عبر نفس الخدمة.`,
    paths: [
      { key: INVENTORY_DOCUMENT_PATHS.operationPage, label: 'صفحة العملية', description: `${verb} من الصفحة التشغيلية للمستند.` },
      { key: INVENTORY_DOCUMENT_PATHS.approvalsHub, label: 'مركز اعتمادات المخزون', description: `${verb} من شاشة الاعتمادات الموحدة.` },
    ],
  })),
  {
    key: MANUFACTURING_OPERATION_KEYS.materialCreate,
    module: 'manufacturing',
    label: 'إنشاء مادة تصنيع',
    description: 'النموذج والاستيراد وتعريف المستهلكات ومكونات المنتجات تستخدم نفس عقد المادة.',
    paths: [
      { key: MATERIAL_CREATE_PATHS.materialsPage, label: 'صفحة المواد', description: 'إنشاء مادة من نموذج الصفحة.' },
      { key: MATERIAL_CREATE_PATHS.materialsImport, label: 'استيراد المواد', description: 'إنشاء مواد من ملف.' },
      { key: MATERIAL_CREATE_PATHS.consumableDefineModal, label: 'تعريف مستهلك', description: 'إنشاء مادة مستهلكة من شاشة المستهلكات.' },
      { key: MATERIAL_CREATE_PATHS.consumableSheetImport, label: 'رفع شيت مستهلكات', description: 'إنشاء مستهلك جديد أثناء رفع شيت الأرصدة/الأسعار.' },
      { key: MATERIAL_CREATE_PATHS.productsComponentsImport, label: 'استيراد مكونات المنتجات', description: 'إنشاء مادة مفقودة أثناء استيراد المكونات.' },
      { key: MATERIAL_CREATE_PATHS.migration, label: 'ترحيل بيانات التصنيع', description: 'إنشاء مواد خلال الترحيل الإداري.' },
    ],
  },
  {
    key: MANUFACTURING_OPERATION_KEYS.materialUpdate,
    module: 'manufacturing',
    label: 'تعديل مادة تصنيع',
    description: 'التعديل والاستيراد والترحيل تستخدم خدمة المادة الموحدة.',
    paths: [
      { key: MATERIAL_UPDATE_PATHS.materialsPage, label: 'صفحة المواد', description: 'تعديل مادة من النموذج.' },
      { key: MATERIAL_UPDATE_PATHS.materialsImport, label: 'استيراد المواد', description: 'تحديث مواد من ملف.' },
      { key: MATERIAL_UPDATE_PATHS.repairPartsPricing, label: 'تسعير قطع الغيار', description: 'حفظ سعر المستهلك وسعر التاجر وسعر التكلفة على المكوّن لكل مراكز الصيانة.' },
      { key: MATERIAL_UPDATE_PATHS.migration, label: 'ترحيل بيانات التصنيع', description: 'تحديث مادة خلال الترحيل.' },
    ],
  },
  {
    key: MANUFACTURING_OPERATION_KEYS.bomUpsert,
    module: 'manufacturing',
    label: 'إدارة مكونات BOM',
    description: 'إضافة وتعديل وحذف مكونات BOM والاستيراد والترحيل تستخدم نفس سياسة المسار.',
    paths: [
      { key: BOM_UPSERT_PATHS.productBomSection, label: 'قسم مكونات المنتج', description: 'إضافة أو تعديل مكون من واجهة BOM.' },
      { key: BOM_UPSERT_PATHS.productsImportBom, label: 'استيراد المنتجات مع BOM', description: 'حفظ BOM من ملف المنتجات.' },
      { key: BOM_UPSERT_PATHS.productsComponentsImport, label: 'استيراد المكونات', description: 'حفظ BOM من ملف المكونات.' },
      { key: BOM_UPSERT_PATHS.migration, label: 'ترحيل بيانات التصنيع', description: 'إنشاء BOM خلال الترحيل.' },
    ],
  },
  {
    key: WORKER_ASSIGNMENT_OPERATION_KEYS.permanent,
    module: 'production',
    label: 'إدارة التعيين الدائم للعامل على الخط',
    description: 'الربط والتعديل والإنهاء تستخدم خدمة تعيين واحدة مهما اختلفت الشاشة.',
    paths: [
      { key: PERMANENT_WORKER_ASSIGNMENT_PATHS.lineWorkersPage, label: 'صفحة تعيين العمال', description: 'الإدارة من صفحة الخطوط والعمال.' },
      { key: PERMANENT_WORKER_ASSIGNMENT_PATHS.quickAction, label: 'الإجراء السريع', description: 'الربط بالمسح من شاشة Quick Action.' },
      { key: PERMANENT_WORKER_ASSIGNMENT_PATHS.productionWorkersPage, label: 'صفحة عمال الإنتاج', description: 'إدارة ربط العامل من القائمة.' },
      { key: PERMANENT_WORKER_ASSIGNMENT_PATHS.workerProfileSection, label: 'ملف عامل الإنتاج', description: 'إدارة الخطوط من تفاصيل العامل.' },
    ],
  },
  {
    key: WORKER_ASSIGNMENT_OPERATION_KEYS.daily,
    module: 'production',
    label: 'إدارة حضور وتعيين العامل اليومي',
    description: 'إنشاء الحضور وتغيير الدور والحذف تستخدم سجل التعيين اليومي نفسه.',
    paths: [
      { key: DAILY_WORKER_ASSIGNMENT_PATHS.quickAction, label: 'الإجراء السريع', description: 'تسجيل الحضور أو الدور بالمسح.' },
      { key: DAILY_WORKER_ASSIGNMENT_PATHS.reportsWorkersModal, label: 'عمال تقرير الإنتاج', description: 'إضافة أو إزالة عامل من مودال التقرير.' },
      { key: DAILY_WORKER_ASSIGNMENT_PATHS.lineWorkersPage, label: 'صفحة تعيين العمال', description: 'تحديث الدور أو حذف سجل يومي.' },
      { key: DAILY_WORKER_ASSIGNMENT_PATHS.productionWorkersPage, label: 'صفحة عمال الإنتاج', description: 'الحذف الجماعي للتعيينات اليومية.' },
    ],
  },
  {
    key: PRODUCTION_PLAN_OPERATION_KEYS.create,
    module: 'production',
    label: 'إنشاء خطة إنتاج',
    description: 'إنشاء الخطط يدويًا أو بالاستيراد أو من طلبات صرف الإنتاج عبر بوابة واحدة.',
    paths: [
      { key: PRODUCTION_PLAN_CREATE_PATHS.plansPage, label: 'صفحة خطط الإنتاج', description: 'النموذج المباشر داخل صفحة الخطط.' },
      { key: PRODUCTION_PLAN_CREATE_PATHS.globalImport, label: 'استيراد الخطط', description: 'الاستيراد الجماعي من المودال العام.' },
      { key: PRODUCTION_PLAN_CREATE_PATHS.productionIssueRequests, label: 'طلبات صرف الإنتاج', description: 'إنشاء خطة من احتياج طلب صرف.' },
    ],
  },
  {
    key: PRODUCTION_PLAN_OPERATION_KEYS.update,
    module: 'production',
    label: 'تعديل خطة إنتاج',
    description: 'التعديل وتغيير الحالة وإزاحة التواريخ تمر من أكشن الخطة الموحد.',
    paths: [
      { key: PRODUCTION_PLAN_UPDATE_PATHS.plansPageEdit, label: 'تعديل بيانات الخطة', description: 'تعديل الخطة من صفحة الخطط.' },
      { key: PRODUCTION_PLAN_UPDATE_PATHS.plansPageStatus, label: 'تغيير حالة الخطة', description: 'بدء أو إكمال أو إلغاء الخطة.' },
      { key: PRODUCTION_PLAN_UPDATE_PATHS.plansPageBulkDateShift, label: 'إزاحة التواريخ جماعيًا', description: 'تعديل تواريخ مجموعة من الخطط.' },
    ],
  },
  {
    key: WORK_ORDER_OPERATION_KEYS.create,
    module: 'production',
    label: 'إنشاء أمر شغل',
    description: 'أوامر الشغل اليدوية والمرتبطة بالخطة تستخدم نفس بوابة الإنشاء.',
    paths: [
      { key: WORK_ORDER_CREATE_PATHS.workOrdersPage, label: 'صفحة أوامر الشغل', description: 'إنشاء أمر شغل مستقل من الصفحة.' },
      { key: WORK_ORDER_CREATE_PATHS.productionPlan, label: 'من خطة الإنتاج', description: 'إنشاء أمر مرتبط بخطة محددة.' },
    ],
  },
  {
    key: WORK_ORDER_OPERATION_KEYS.update,
    module: 'production',
    label: 'تعديل أو تغيير حالة أمر شغل',
    description: 'كل تغييرات أمر الشغل تمر من نفس حواجز الإغلاق والجودة والتقارير.',
    paths: [
      { key: WORK_ORDER_UPDATE_PATHS.workOrderModal, label: 'مودال أمر الشغل', description: 'تعديل البيانات الأساسية.' },
      { key: WORK_ORDER_UPDATE_PATHS.workOrdersPageStatus, label: 'حالة من صفحة الأوامر', description: 'تغيير الحالة من قائمة أوامر الشغل.' },
      { key: WORK_ORDER_UPDATE_PATHS.employeeDashboard, label: 'لوحة الموظف', description: 'بدء أو إنهاء الأمر من لوحة التشغيل.' },
      { key: WORK_ORDER_UPDATE_PATHS.scanner, label: 'ماسح أمر الشغل', description: 'تحديث أوقات وحالة التشغيل بالمسح.' },
      { key: WORK_ORDER_UPDATE_PATHS.qualityIpqc, label: 'فحص الجودة أثناء التشغيل', description: 'تحديث ملخص الجودة من IPQC.' },
      { key: WORK_ORDER_UPDATE_PATHS.qualityFinalInspection, label: 'الفحص النهائي', description: 'تحديث ملخص الجودة من الفحص النهائي.' },
    ],
  },
  {
    key: PRODUCT_OPERATION_KEYS.create,
    module: 'production',
    label: 'إنشاء منتج',
    description: 'الإنشاء اليدوي والاستيراد يستخدمان نفس تطبيع الكود والتصنيف.',
    paths: [
      { key: PRODUCT_CREATE_PATHS.globalModal, label: 'مودال المنتج', description: 'إنشاء منتج يدويًا.' },
      { key: PRODUCT_CREATE_PATHS.productsImport, label: 'استيراد المنتجات', description: 'إنشاء منتجات من ملف الاستيراد.' },
    ],
  },
  {
    key: PRODUCT_OPERATION_KEYS.update,
    module: 'production',
    label: 'تعديل منتج',
    description: 'التعديل الفردي والجماعي والاستيراد تمر من بوابة واحدة.',
    paths: [
      { key: PRODUCT_UPDATE_PATHS.globalModal, label: 'مودال المنتج', description: 'تعديل بيانات منتج واحد.' },
      { key: PRODUCT_UPDATE_PATHS.productsPageBulk, label: 'التعديل الجماعي', description: 'تعديل التصنيف أو نمط التجميع لمجموعة.' },
      { key: PRODUCT_UPDATE_PATHS.productsImport, label: 'تحديث بالاستيراد', description: 'تحديث منتج موجود من ملف.' },
      { key: PRODUCT_UPDATE_PATHS.productsPageToggle, label: 'إعدادات المنتج السريعة', description: 'تشغيل أو إيقاف إعدادات الهالك من الجدول.' },
    ],
  },
  {
    key: PRODUCTION_REPORT_OPERATION_KEYS.create,
    module: 'production',
    label: 'إنشاء تقرير إنتاج',
    description: 'كل نقاط إنشاء التقرير تستخدم نفس منطق التحقق والربط والترحيل.',
    paths: [
      { key: PRODUCTION_REPORT_CREATE_PATHS.reportsPage, label: 'صفحة تقارير الإنتاج', description: 'نموذج الإنشاء المباشر داخل صفحة التقارير.' },
      { key: PRODUCTION_REPORT_CREATE_PATHS.globalModal, label: 'مودال إنشاء التقرير', description: 'الإنشاء من المودال العام داخل النظام.' },
      { key: PRODUCTION_REPORT_CREATE_PATHS.productionPlan, label: 'خطة الإنتاج', description: 'إنشاء تقرير من أكشن الخطة مع ربطها صراحةً.' },
      { key: PRODUCTION_REPORT_CREATE_PATHS.supervisorDetails, label: 'تفاصيل المشرف', description: 'إنشاء تقرير من متابعة خطة المشرف.' },
      { key: PRODUCTION_REPORT_CREATE_PATHS.quickAction, label: 'الإدخال السريع', description: 'صفحة الإدخال السريع لتقارير الإنتاج.' },
      { key: PRODUCTION_REPORT_CREATE_PATHS.reportsImport, label: 'استيراد صفحة التقارير', description: 'استيراد التقارير من داخل الصفحة.' },
      { key: PRODUCTION_REPORT_CREATE_PATHS.globalImport, label: 'مودال الاستيراد العام', description: 'استيراد التقارير من المودال العام.' },
      { key: PRODUCTION_REPORT_CREATE_PATHS.workOrderCompletion, label: 'إكمال أمر الشغل', description: 'إنشاء تقرير الإقفال التلقائي عند إكمال أمر الشغل.' },
      { key: PRODUCTION_REPORT_CREATE_PATHS.componentWaste, label: 'تقرير هالك المكونات', description: 'إنشاء تقرير الهالك من شاشة الهالك.' },
    ],
  },
  {
    key: PRODUCTION_REPORT_OPERATION_KEYS.update,
    module: 'production',
    label: 'تعديل أو إنهاء تقرير إنتاج',
    description: 'تعديلات التقرير تمر من بوابة موحدة قبل تحديث البيانات التابعة.',
    paths: [
      { key: PRODUCTION_REPORT_UPDATE_PATHS.reportsPage, label: 'تعديل من صفحة التقارير', description: 'تعديل تقرير محفوظ من نموذج الصفحة.' },
      { key: PRODUCTION_REPORT_UPDATE_PATHS.shiftClose, label: 'إنهاء الوردية', description: 'تحويل تقرير الوردية المفتوح إلى تقرير نهائي.' },
      { key: PRODUCTION_REPORT_UPDATE_PATHS.importUpdate, label: 'تحديث بالاستيراد', description: 'تحديث تقارير موجودة بواسطة كود التقرير.' },
      { key: PRODUCTION_REPORT_UPDATE_PATHS.attendanceSync, label: 'مزامنة الحضور', description: 'تحديث حقول الحضور المشتقة آليًا.' },
      { key: PRODUCTION_REPORT_UPDATE_PATHS.costSnapshot, label: 'لقطة التكلفة', description: 'تحديث حقول التكلفة المشتقة آليًا.' },
    ],
  },
  {
    key: PRODUCTION_REPORT_OPERATION_KEYS.delete,
    module: 'production',
    label: 'حذف تقرير إنتاج',
    description: 'الحذف الفردي والجماعي يستخدمان نفس العكس والتسوية.',
    paths: [
      { key: PRODUCTION_REPORT_DELETE_PATHS.reportsPage, label: 'حذف فردي', description: 'حذف تقرير واحد من صفحة التقارير.' },
      { key: PRODUCTION_REPORT_DELETE_PATHS.bulkDelete, label: 'حذف جماعي', description: 'حذف مجموعة تقارير من صفحة التقارير.' },
    ],
  },
  {
    key: PRODUCTION_REPORT_OPERATION_KEYS.shift,
    module: 'production',
    label: 'بدء وردية إنتاج',
    description: 'التحكم في إنشاء التقرير المفتوح من لوحة الموظف.',
    paths: [
      { key: PRODUCTION_REPORT_SHIFT_PATHS.employeeDashboard, label: 'لوحة الموظف', description: 'بدء الوردية من بطاقة تشغيل الإنتاج.' },
    ],
  },
  {
    key: PRODUCTION_REPORT_OPERATION_KEYS.reconcile,
    module: 'production',
    label: 'مزامنة التقارير مع أوامر الشغل',
    description: 'إعادة الربط والتسوية من أدوات التقارير أو أمر الشغل.',
    paths: [
      { key: PRODUCTION_REPORT_RECONCILE_PATHS.reportsPage, label: 'أدوات صفحة التقارير', description: 'الربط الجماعي وإصلاح التقارير القديمة.' },
      { key: PRODUCTION_REPORT_RECONCILE_PATHS.workOrdersPage, label: 'صفحة أوامر الشغل', description: 'مزامنة أمر شغل محدد من تقاريره.' },
    ],
  },
];

export const DEFAULT_OPERATION_PATH_SETTINGS: OperationPathSettings = {
  operations: {},
};

const MENU_ITEM_OPERATION_PATHS: Readonly<Record<string, {
  operationKey: string;
  pathKey: string;
}>> = {
  quick: {
    operationKey: PRODUCTION_REPORT_OPERATION_KEYS.create,
    pathKey: PRODUCTION_REPORT_CREATE_PATHS.quickAction,
  },
  reports: {
    operationKey: PRODUCTION_REPORT_OPERATION_KEYS.create,
    pathKey: PRODUCTION_REPORT_CREATE_PATHS.reportsPage,
  },
  plans: {
    operationKey: PRODUCTION_PLAN_OPERATION_KEYS.create,
    pathKey: PRODUCTION_PLAN_CREATE_PATHS.plansPage,
  },
  'work-orders': {
    operationKey: WORK_ORDER_OPERATION_KEYS.create,
    pathKey: WORK_ORDER_CREATE_PATHS.workOrdersPage,
  },
  'packaging-control': {
    operationKey: INVENTORY_OPERATION_KEYS.productionHandoverConfirm,
    pathKey: INVENTORY_HANDOVER_RECEIPT_PATHS.packagingControl,
  },
  'inv-transfer-approvals': {
    operationKey: INVENTORY_OPERATION_KEYS.transferApprove,
    pathKey: INVENTORY_TRANSFER_DECISION_PATHS.transferApprovalsPage,
  },
  'inv-production-issues': {
    operationKey: INVENTORY_OPERATION_KEYS.stockMove,
    pathKey: INVENTORY_STOCK_MOVE_PATHS.movementsForm,
  },
  'line-workers': {
    operationKey: WORKER_ASSIGNMENT_OPERATION_KEYS.permanent,
    pathKey: PERMANENT_WORKER_ASSIGNMENT_PATHS.lineWorkersPage,
  },
};

export const resolveOperationPathSettings = (input: unknown): OperationPathSettings => {
  const source = input && typeof input === 'object'
    ? input as { operations?: unknown }
    : {};
  const operationRows = source.operations && typeof source.operations === 'object'
    ? source.operations as Record<string, unknown>
    : {};
  const operations: NonNullable<OperationPathSettings['operations']> = {};

  Object.entries(operationRows).forEach(([operationKey, rawControl]) => {
    if (!rawControl || typeof rawControl !== 'object') return;
    const control = rawControl as { enabled?: unknown; paths?: unknown };
    const paths: Record<string, boolean> = {};
    if (control.paths && typeof control.paths === 'object') {
      Object.entries(control.paths as Record<string, unknown>).forEach(([pathKey, value]) => {
        if (typeof value === 'boolean') paths[pathKey] = value;
      });
    }
    operations[operationKey] = {
      ...(typeof control.enabled === 'boolean' ? { enabled: control.enabled } : {}),
      ...(Object.keys(paths).length > 0 ? { paths } : {}),
    };
  });

  return { operations };
};

const getOperationControl = (
  settings: Pick<SystemSettings, 'operationPaths'> | OperationPathSettings | null | undefined,
  operationKey: string,
): OperationPathControl | undefined => {
  if (!settings) return undefined;
  const operationPaths = 'operationPaths' in settings
    ? settings.operationPaths
    : settings;
  if (!operationPaths || typeof operationPaths !== 'object') return undefined;
  const operations = (operationPaths as { operations?: unknown }).operations;
  if (!operations || typeof operations !== 'object') return undefined;
  const control = (operations as Record<string, unknown>)[operationKey];
  return control && typeof control === 'object'
    ? control as OperationPathControl
    : undefined;
};

export const isOperationPathEnabled = (
  settings: Pick<SystemSettings, 'operationPaths'> | OperationPathSettings | null | undefined,
  operationKey: string,
  pathKey: string,
): boolean => {
  const control = getOperationControl(settings, operationKey);
  if (control?.enabled === false) return false;
  return control?.paths?.[pathKey] !== false;
};

export const isMenuItemOperationPathEnabled = (
  settings: Pick<SystemSettings, 'operationPaths'> | OperationPathSettings | null | undefined,
  menuItemKey: string,
): boolean => {
  const requirement = MENU_ITEM_OPERATION_PATHS[menuItemKey];
  return !requirement || isOperationPathEnabled(
    settings,
    requirement.operationKey,
    requirement.pathKey,
  );
};

export class OperationPathDisabledError extends Error {
  readonly code = 'OPERATION_PATH_DISABLED';

  constructor() {
    super('هذا المسار متوقف من إعدادات النظام. استخدم مسارًا مفعّلًا أو راجع مسؤول النظام.');
    this.name = 'OperationPathDisabledError';
  }
}

export const assertOperationPathEnabled = (
  settings: Pick<SystemSettings, 'operationPaths'> | OperationPathSettings | null | undefined,
  operationKey: string,
  pathKey: string,
): void => {
  if (!isOperationPathEnabled(settings, operationKey, pathKey)) {
    throw new OperationPathDisabledError();
  }
};

export const assertCurrentTenantOperationPathEnabled = async (
  operationKey: string,
  pathKey: string,
): Promise<void> => {
  const { systemSettingsService } = await import('../services/systemSettingsService');
  const settings = await systemSettingsService.getStrict();
  assertOperationPathEnabled(settings, operationKey, pathKey);
};

export const patchOperationPathControl = (
  settings: OperationPathSettings | undefined,
  operationKey: string,
  patch: Partial<OperationPathControl>,
): OperationPathSettings => {
  const current = settings?.operations?.[operationKey] ?? {};
  return {
    operations: {
      ...(settings?.operations ?? {}),
      [operationKey]: {
        ...current,
        ...patch,
        paths: {
          ...(current.paths ?? {}),
          ...(patch.paths ?? {}),
        },
      },
    },
  };
};

export const diffOperationPathSettings = (
  base: OperationPathSettings | undefined,
  next: OperationPathSettings | undefined,
): OperationPathSettings => {
  const baseOperations = resolveOperationPathSettings(base).operations ?? {};
  const nextOperations = resolveOperationPathSettings(next).operations ?? {};
  const operations: Record<string, OperationPathControl> = {};

  Object.entries(nextOperations).forEach(([operationKey, nextControl]) => {
    const baseControl = baseOperations[operationKey] ?? {};
    const controlPatch: OperationPathControl = {};
    if (
      typeof nextControl.enabled === 'boolean'
      && nextControl.enabled !== baseControl.enabled
    ) {
      controlPatch.enabled = nextControl.enabled;
    }
    const paths = Object.fromEntries(
      Object.entries(nextControl.paths ?? {}).filter(
        ([pathKey, value]) => typeof value === 'boolean' && value !== baseControl.paths?.[pathKey],
      ),
    );
    if (Object.keys(paths).length > 0) controlPatch.paths = paths;
    if (controlPatch.enabled !== undefined || controlPatch.paths) {
      operations[operationKey] = controlPatch;
    }
  });

  return { operations };
};

export const mergeOperationPathSettingsPatch = (
  latest: OperationPathSettings | undefined,
  patch: OperationPathSettings | undefined,
): OperationPathSettings => {
  let merged = resolveOperationPathSettings(latest);
  const patchOperations = resolveOperationPathSettings(patch).operations ?? {};
  Object.entries(patchOperations).forEach(([operationKey, controlPatch]) => {
    merged = patchOperationPathControl(merged, operationKey, controlPatch);
  });
  return merged;
};
