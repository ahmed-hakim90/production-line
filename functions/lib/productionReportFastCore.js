export function validateProductionReportAssignment(input) {
    if (!input.targetEmployeeExists
        || input.targetEmployeeTenantId !== input.actorTenantId
        || !input.targetEmployeeActive) {
        return { code: 'failed-precondition', message: 'مشرف التقرير غير موجود أو غير نشط.' };
    }
    const targetsAnotherEmployee = Boolean(input.actorEmployeeId
        && input.actorEmployeeId !== input.targetEmployeeId);
    const delegated = input.canCreateForAnySupervisor && targetsAnotherEmployee;
    if (input.actorEmployeeLevel === 2
        && targetsAnotherEmployee
        && !input.canCreateForAnySupervisor) {
        return { code: 'permission-denied', message: 'غير مصرح بإنشاء تقرير لمشرف آخر.' };
    }
    if (delegated && !input.workOrderId) {
        return { code: 'failed-precondition', message: 'إنشاء التقرير بالنيابة يتطلب أمر شغل.' };
    }
    if (!input.workOrderId)
        return null;
    const workOrder = input.workOrder;
    if (!workOrder
        || workOrder.tenantId !== input.actorTenantId
        || !['pending', 'in_progress', 'paused'].includes(workOrder.status)) {
        return { code: 'failed-precondition', message: 'أمر الشغل غير موجود أو غير نشط.' };
    }
    if (!workOrder.supervisorId) {
        return { code: 'failed-precondition', message: 'لا يمكن إنشاء تقرير لأمر شغل بلا مشرف.' };
    }
    // Line may change after the work order was opened; product + supervisor remain the authority.
    if (workOrder.supervisorId !== input.targetEmployeeId
        || workOrder.productId !== input.reportProductId) {
        return { code: 'failed-precondition', message: 'المشرف أو المنتج لا يطابق أمر الشغل.' };
    }
    return null;
}
const keyPart = (value) => encodeURIComponent(String(value ?? '').trim().toLowerCase());
export function buildProductionReportFastUniqueKey(input, includeShift = true) {
    const reportType = String(input.reportType || 'finished_product').trim() || 'finished_product';
    const parts = [input.date, input.lineId, input.employeeId, input.productId, reportType].map(keyPart);
    if (includeShift && reportType === 'component_injection')
        parts.push(keyPart(input.shift || 'morning'));
    const workOrderId = String(input.workOrderId || '').trim();
    if (workOrderId)
        parts.push(`wo_${keyPart(workOrderId)}`);
    return parts.join('__');
}
