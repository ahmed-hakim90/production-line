import type {
  ProductionAttendanceRecord,
  ProductionReport,
  ProductionReportWorkerOutput,
  ProductionShiftWorkerSnapshot,
} from '../../../types';

const cleanText = (value: unknown): string => String(value || '').trim();

const shouldRecordReportAttendance = (report: Pick<ProductionReport, 'id' | 'lifecycleStatus'>): boolean => (
  Boolean(report.id) && report.lifecycleStatus !== 'open'
);

const recordKey = (
  reportId: string,
  row: Pick<ProductionAttendanceRecord, 'employeeId' | 'workerId' | 'source'>,
): string => {
  const subject = cleanText(row.employeeId) || cleanText(row.workerId) || row.source;
  return `${reportId}_${encodeURIComponent(subject)}`;
};

function mapShiftWorker(
  report: ProductionReport,
  worker: ProductionShiftWorkerSnapshot,
): ProductionAttendanceRecord | null {
  const employeeId = cleanText(worker.employeeId);
  if (!employeeId) return null;
  const reportId = cleanText(report.id);
  const record: ProductionAttendanceRecord = {
    reportId,
    reportCode: report.reportCode,
    date: report.date,
    lineId: report.lineId,
    productId: report.productId,
    employeeId,
    employeeCode: cleanText(worker.employeeCode) || undefined,
    employeeName: cleanText(worker.employeeName) || employeeId,
    laborRole: worker.laborRole,
    status: worker.isPresent === false ? 'absent' : 'present',
    source: 'shift_workers',
    quantityProduced: Number(report.quantityProduced || 0),
    workHours: Number(report.workHours || 0),
  };
  return { ...record, id: recordKey(reportId, record) };
}

function mapWorkerOutput(
  report: ProductionReport,
  row: ProductionReportWorkerOutput,
): ProductionAttendanceRecord | null {
  const workerId = cleanText(row.workerId);
  if (!workerId) return null;
  const reportId = cleanText(report.id);
  const record: ProductionAttendanceRecord = {
    reportId,
    reportCode: report.reportCode,
    date: report.date,
    lineId: report.lineId,
    productId: report.productId,
    workerId,
    workerName: cleanText(row.workerName) || workerId,
    employeeName: cleanText(row.workerName) || workerId,
    laborRole: 'production',
    status: row.isPresent === false ? 'absent' : 'present',
    source: 'worker_outputs',
    quantityProduced: Number(row.outputQty || 0),
    workHours: Number(report.workHours || 0),
    notes: cleanText(row.notes) || undefined,
  };
  return { ...record, id: recordKey(reportId, record) };
}

export function buildProductionAttendanceRecords(
  report: ProductionReport,
): ProductionAttendanceRecord[] {
  if (!shouldRecordReportAttendance(report)) return [];

  const rows = new Map<string, ProductionAttendanceRecord>();
  (report.shiftWorkers || [])
    .map((worker) => mapShiftWorker(report, worker))
    .forEach((record) => {
      if (record?.id) rows.set(record.id, record);
    });

  if (rows.size === 0) {
    (report.workerOutputs || [])
      .map((worker) => mapWorkerOutput(report, worker))
      .forEach((record) => {
        if (record?.id) rows.set(record.id, record);
      });
  }

  return Array.from(rows.values());
}
