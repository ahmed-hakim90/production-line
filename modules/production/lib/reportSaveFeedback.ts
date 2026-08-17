export const SAVE_ERROR_TOAST_DURATION_MS = 8000;
export const REPORT_SAVE_TOAST_ID = 'production-report-save';
export const REPORT_SAVE_PENDING_MESSAGE = 'جارٍ حفظ التقرير...';
export const REPORT_SAVE_SUCCESS_MESSAGE = 'تم حفظ التقرير بنجاح.';

export const DELEGATED_WORK_ORDER_REQUIRED_MESSAGE =
  'التسجيل باسم مشرف آخر يحتاج أمر شغل مطابق، حتى لو كان أمر الشغل غير إلزامي في الإعدادات.';

export type MissingReportSaveFields = {
  missingLine?: boolean;
  missingEmployee?: boolean;
  missingProduct?: boolean;
  missingQuantity?: boolean;
  missingHours?: boolean;
  missingLabor?: boolean;
  missingShift?: boolean;
  missingWorkOrder?: boolean;
  packagingLinesMissing?: boolean;
};

export function describeMissingReportSaveFields(input: MissingReportSaveFields): string | null {
  const parts: string[] = [];
  if (input.missingLine) parts.push('الخط');
  if (input.missingEmployee) parts.push('المشرف');
  if (input.missingProduct) parts.push('المنتج');
  if (input.packagingLinesMissing) parts.push('سطر منتج بكمية صحيحة');
  if (input.missingQuantity) parts.push('الكمية المنتجة');
  if (input.missingLabor) parts.push('تفاصيل العمالة');
  if (input.missingHours) parts.push('ساعات العمل');
  if (input.missingShift) parts.push('الوردية');
  if (input.missingWorkOrder) parts.push('أمر الشغل');
  if (parts.length === 0) return null;
  if (parts.length === 1) return `أكمل ${parts[0]} قبل الحفظ.`;
  const last = parts.pop()!;
  return `أكمل ${parts.join('، ')} و${last} قبل الحفظ.`;
}

export function describeSelectedWorkOrderMismatch(input: {
  workOrderSupervisorId?: string;
  workOrderLineId?: string;
  workOrderProductId?: string;
  employeeId: string;
  lineId: string;
  productId: string;
}): string | null {
  if (!String(input.workOrderSupervisorId || '').trim()) {
    return 'أمر الشغل المختار بلا مشرف معيّن. اختر أمر شغل آخر أو احفظ بدون أمر شغل إن كان غير إلزامي.';
  }
  const mismatches: string[] = [];
  if (input.workOrderSupervisorId !== input.employeeId) mismatches.push('المشرف');
  if (input.workOrderLineId !== input.lineId) mismatches.push('الخط');
  if (input.workOrderProductId !== input.productId) mismatches.push('المنتج');
  if (mismatches.length === 0) return null;
  return `${mismatches.join(' و')} في التقرير لا يطابق أمر الشغل المختار. عدّل البيانات أو ألغِ أمر الشغل إن كان غير إلزامي.`;
}

export function productionIssueRequiredMessage(hasLinkedWorkOrderOrPlan: boolean): string {
  if (hasLinkedWorkOrderOrPlan) {
    return 'لا يمكن حفظ تقرير الإنتاج قبل اعتماد وإصدار إذن صرف إنتاج لأمر الشغل أو الخطة المرتبطة. أنشئ الصرف من صفحة «صرف إنتاج» ثم أعد المحاولة.';
  }
  return 'لا يمكن حفظ تقرير الإنتاج بدون إذن صرف معتمد. اربط التقرير بخطة أو أمر شغل له صرف صادر، أو أوقف «إلزام صرف إنتاج معتمد» من إعدادات تقارير الإنتاج.';
}
