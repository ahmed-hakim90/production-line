export const MODAL_KEYS = {
  REPORTS_CREATE: 'reports.create',
  REPORTS_IMPORT: 'reports.import',
  WORK_ORDERS_CREATE: 'workOrders.create',
  PRODUCTS_CREATE: 'products.create',
  LINES_CREATE: 'lines.create',
  EMPLOYEES_CREATE: 'employees.create',
  ORGANIZATION_CREATE: 'organization.create',
  VEHICLES_CREATE: 'vehicles.create',
  COST_CENTERS_CREATE: 'costCenters.create',
  INVENTORY_WAREHOUSES_CREATE: 'inventory.warehouses.create',
  INVENTORY_RAW_MATERIALS_CREATE: 'inventory.rawMaterials.create',
  SYSTEM_ROLES_CREATE: 'system.roles.create',
} as const;

export type ModalKey = (typeof MODAL_KEYS)[keyof typeof MODAL_KEYS];

const normalizeText = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');

export const inferModalKeyFromLegacyContext = (
  title: string,
  route: string,
  openerText?: string,
): ModalKey | undefined => {
  const t = normalizeText(title || '');
  const o = normalizeText(openerText || '');
  const hay = `${t} ${o}`.trim();
  const r = route.startsWith('/') ? route : `/${route}`;

  if (r.includes('/reports') && (hay.includes('انشاء تقرير') || hay.includes('تقرير انتاج') || hay.includes('تعديل تقرير'))) {
    return MODAL_KEYS.REPORTS_CREATE;
  }
  if (r.includes('/reports') && (hay.includes('استيراد') || hay.includes('excel') || hay.includes('رفع'))) {
    return MODAL_KEYS.REPORTS_IMPORT;
  }
  if (r.includes('/work-orders') && (hay.includes('امر شغل جديد') || hay.includes('انشاء امر شغل') || hay.includes('امر شغل'))) {
    return MODAL_KEYS.WORK_ORDERS_CREATE;
  }
  if (r.includes('/products') && (hay.includes('اضافه منتج جديد') || hay.includes('اضافة منتج جديد') || hay.includes('تعديل المنتج') || hay.includes('منتج جديد'))) {
    return MODAL_KEYS.PRODUCTS_CREATE;
  }
  if (r.includes('/lines') && (hay.includes('اضافه خط انتاج') || hay.includes('اضافة خط انتاج') || hay.includes('تعديل خط الانتاج') || hay.includes('خط انتاج'))) {
    return MODAL_KEYS.LINES_CREATE;
  }
  if (r.includes('/employees') && (hay.includes('اضافه موظف') || hay.includes('اضافة موظف') || hay.includes('موظف جديد'))) {
    return MODAL_KEYS.EMPLOYEES_CREATE;
  }
  if (r.includes('/organization') && (hay.includes('اضافه') || hay.includes('اضافة') || hay.includes('قسم') || hay.includes('منصب') || hay.includes('ورديه') || hay.includes('وردية'))) {
    return MODAL_KEYS.ORGANIZATION_CREATE;
  }
  if (r.includes('/vehicles') && (hay.includes('اضافه مركبه') || hay.includes('اضافة مركبة') || hay.includes('مركبه') || hay.includes('مركبة'))) {
    return MODAL_KEYS.VEHICLES_CREATE;
  }
  if (r.includes('/cost-centers') && (hay.includes('اضافه مركز تكلفه') || hay.includes('اضافة مركز تكلفة') || hay.includes('مركز تكلفه') || hay.includes('مركز تكلفة'))) {
    return MODAL_KEYS.COST_CENTERS_CREATE;
  }
  if (r.includes('/inventory') && r.includes('/movements') && (hay.includes('اضافه مخزن جديد') || hay.includes('اضافة مخزن جديد') || hay.includes('مخزن جديد') || hay.includes('اضافه مخزن'))) {
    return MODAL_KEYS.INVENTORY_WAREHOUSES_CREATE;
  }
  if (r.includes('/inventory') && r.includes('/movements') && (hay.includes('اضافه ماده خام') || hay.includes('اضافة مادة خام') || hay.includes('ماده خام') || hay.includes('مواد خام'))) {
    return MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE;
  }
  if ((r.includes('/roles') || r.includes('/system')) && (hay.includes('انشاء دور جديد') || hay.includes('اضافه دور') || hay.includes('اضافة دور') || hay.includes('دور جديد'))) {
    return MODAL_KEYS.SYSTEM_ROLES_CREATE;
  }
  return undefined;
};

