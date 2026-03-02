export const MODAL_KEYS = {
  REPORTS_CREATE: 'reports.create',
  REPORTS_IMPORT: 'reports.import',
  WORK_ORDERS_CREATE: 'workOrders.create',
  PRODUCTS_CREATE: 'products.create',
  LINES_CREATE: 'lines.create',
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
  return undefined;
};

