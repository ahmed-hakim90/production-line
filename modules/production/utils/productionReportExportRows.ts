import type { ProductionReport, WorkOrder } from '../../../types';
import { getReportWaste } from '../../../utils/calculations';
import { summarizeWorkerPresenceDays } from './workerPresence';

export interface ProductionReportExportRow {
  'كود التقرير': string;
  التاريخ: string;
  'خط الإنتاج': string;
  المنتج: string;
  الموظف: string;
  'الكمية المنتجة': number;
  الهالك: number;
  'نسبة الهالك %': string;
  'عدد العمال': number;
  'عمالة الإنتاج'?: number;
  'عمالة التعبئة'?: number;
  'عمالة الجودة'?: number;
  'عمالة الصيانة'?: number;
  'عمالة خارجية'?: number;
  'أيام حضور'?: number;
  'أيام غياب'?: number;
  'ساعات العمل': number;
  'تكلفة الوحدة'?: number | string;
  'أمر الشغل'?: string;
  'كمية أمر الشغل'?: number | string;
  'عمالة أمر الشغل'?: number | string;
}

export interface ProductionReportExportLookupFns {
  getLineName: (id: string) => string;
  getProductName: (id: string) => string;
  getEmployeeName: (id: string) => string;
  getWorkOrder?: (id: string) => WorkOrder | undefined;
}

export const buildProductionReportExportRows = (
  reports: ProductionReport[],
  lookups: ProductionReportExportLookupFns,
  costMap?: Map<string, number>,
): ProductionReportExportRow[] => {
  const hasWO = lookups.getWorkOrder && reports.some((r) => r.workOrderId);
  const hasCosts = costMap && costMap.size > 0;
  return reports.map((r) => {
    const wasteQuantity = getReportWaste(r);
    const presence = summarizeWorkerPresenceDays((r.workerOutputs ?? []).map((row) => ({
      workerId: row.workerId,
      date: r.date,
      isPresent: row.isPresent,
    })));
    const total = (r.quantityProduced || 0) + wasteQuantity;
    const wasteRatio = total > 0 ? ((wasteQuantity / total) * 100).toFixed(1) : '0';
    const row: ProductionReportExportRow = {
      'كود التقرير': r.reportCode || '—',
      التاريخ: r.date,
      'خط الإنتاج': lookups.getLineName(r.lineId),
      المنتج: lookups.getProductName(r.productId),
      الموظف: lookups.getEmployeeName(r.employeeId),
      'الكمية المنتجة': r.quantityProduced || 0,
      الهالك: wasteQuantity,
      'نسبة الهالك %': `${wasteRatio}%`,
      'عدد العمال': r.workersCount || 0,
      'عمالة الإنتاج': r.workersProductionCount || 0,
      'عمالة التعبئة': r.workersPackagingCount || 0,
      'عمالة الجودة': r.workersQualityCount || 0,
      'عمالة الصيانة': r.workersMaintenanceCount || 0,
      'عمالة خارجية': r.workersExternalCount || 0,
      'أيام حضور': presence.presentDays,
      'أيام غياب': presence.absentDays,
      'ساعات العمل': r.workHours || 0,
    };
    if (hasCosts) {
      const cost = r.id ? costMap.get(r.id) : undefined;
      row['تكلفة الوحدة'] = cost != null && cost > 0 ? Number(cost.toFixed(2)) : '—';
    }
    if (hasWO) {
      const wo = r.workOrderId && lookups.getWorkOrder ? lookups.getWorkOrder(r.workOrderId) : undefined;
      row['أمر الشغل'] = wo ? wo.workOrderNumber : '—';
      row['كمية أمر الشغل'] = wo ? wo.quantity : '—';
      row['عمالة أمر الشغل'] = wo ? wo.maxWorkers : '—';
    }
    return row;
  });
};
