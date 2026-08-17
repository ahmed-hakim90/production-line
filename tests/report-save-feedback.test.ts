import assert from 'node:assert/strict';
import {
  DELEGATED_WORK_ORDER_REQUIRED_MESSAGE,
  REPORT_SAVE_PENDING_MESSAGE,
  describeMissingReportSaveFields,
  describeSelectedWorkOrderMismatch,
  productionIssueRequiredMessage,
} from '../modules/production/lib/reportSaveFeedback.ts';

assert.equal(describeMissingReportSaveFields({}), null);
assert.equal(
  describeMissingReportSaveFields({ missingHours: true }),
  'أكمل ساعات العمل قبل الحفظ.',
);
assert.equal(
  describeMissingReportSaveFields({ missingQuantity: true, missingHours: true }),
  'أكمل الكمية المنتجة وساعات العمل قبل الحفظ.',
);
assert.equal(
  describeMissingReportSaveFields({
    missingLine: true,
    missingEmployee: true,
    missingWorkOrder: true,
  }),
  'أكمل الخط، المشرف وأمر الشغل قبل الحفظ.',
);

assert.equal(
  describeSelectedWorkOrderMismatch({
    workOrderSupervisorId: 'sup-1',
    workOrderLineId: 'line-1',
    workOrderProductId: 'p-1',
    employeeId: 'sup-1',
    lineId: 'line-1',
    productId: 'p-1',
  }),
  null,
);
assert.match(
  describeSelectedWorkOrderMismatch({
    workOrderSupervisorId: 'sup-1',
    workOrderLineId: 'line-1',
    workOrderProductId: 'p-1',
    employeeId: 'sup-2',
    lineId: 'line-1',
    productId: 'p-1',
  }) || '',
  /المشرف/,
);
assert.match(
  describeSelectedWorkOrderMismatch({
    workOrderSupervisorId: 'sup-1',
    workOrderLineId: 'line-1',
    workOrderProductId: 'p-1',
    employeeId: 'sup-1',
    lineId: 'line-2',
    productId: 'p-2',
  }) || '',
  /الخط والمنتج/,
);
assert.match(
  describeSelectedWorkOrderMismatch({
    workOrderSupervisorId: '',
    workOrderLineId: 'line-1',
    workOrderProductId: 'p-1',
    employeeId: 'sup-1',
    lineId: 'line-1',
    productId: 'p-1',
  }) || '',
  /بلا مشرف/,
);

assert.match(DELEGATED_WORK_ORDER_REQUIRED_MESSAGE, /مشرف آخر/);
assert.match(productionIssueRequiredMessage(true), /أمر الشغل أو الخطة المرتبطة/);
assert.match(productionIssueRequiredMessage(false), /أوقف «إلزام صرف إنتاج معتمد»/);
assert.equal(REPORT_SAVE_PENDING_MESSAGE.includes('حفظ'), true);

console.log('report-save-feedback tests passed');
