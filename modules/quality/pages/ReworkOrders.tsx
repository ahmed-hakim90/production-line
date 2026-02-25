import React, { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import type { QualityReworkOrder } from '@/types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityNotificationService } from '../services/qualityNotificationService';
import { qualityPrintService } from '../services/qualityPrintService';

const STATUS_OPTIONS: QualityReworkOrder['status'][] = ['open', 'in_progress', 'done', 'scrap'];

export const ReworkOrders: React.FC = () => {
  const { can } = usePermission();
  const canManageRework = can('quality.rework.manage');
  const canPrint = can('quality.print');
  const workOrders = useAppStore((s) => s.workOrders);
  const lines = useAppStore((s) => s._rawLines);
  const products = useAppStore((s) => s._rawProducts);
  const [rows, setRows] = useState<QualityReworkOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => qualityInspectionService.subscribeRework(setRows), []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-black">Rework Orders</h2>
          <p className="text-sm text-slate-500">متابعة حالات إعادة التشغيل</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={!canPrint}>طباعة التقرير</Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current) return;
              await qualityPrintService.exportDocumentPdf(printRef.current, 'quality-rework-orders', 'rework');
            }}
            disabled={!canPrint}
          >
            PDF
          </Button>
        </div>
      </div>

      <Card>
        <div ref={printRef}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                <th className="text-right py-2 px-2">Work Order</th>
                <th className="text-right py-2 px-2">Defect</th>
                <th className="text-right py-2 px-2">Serial</th>
                <th className="text-right py-2 px-2">Status</th>
                <th className="text-right py-2 px-2">Update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 px-2 font-mono">{row.workOrderId}</td>
                  <td className="py-2 px-2 font-mono">{row.defectId}</td>
                  <td className="py-2 px-2">{row.serialBarcode ?? '—'}</td>
                  <td className="py-2 px-2 font-bold">{row.status}</td>
                  <td className="py-2 px-2">
                    <div className="flex flex-wrap gap-1">
                      {STATUS_OPTIONS.map((status) => (
                        <button
                          key={status}
                          onClick={async () => {
                            if (!row.id) return;
                            setBusyId(row.id);
                            try {
                              await qualityInspectionService.updateRework(row.id, { status });
                              const workOrder = workOrders.find((item) => item.id === row.workOrderId);
                              if (!workOrder) return;
                              const summary = await qualityInspectionService.buildWorkOrderSummary(workOrder.id!);
                              await qualityNotificationService.notifyReportStatusChanged({
                                workOrderId: workOrder.id!,
                                workOrderNumber: workOrder.workOrderNumber,
                                lineName: lines.find((line) => line.id === workOrder.lineId)?.name ?? workOrder.lineId,
                                productName: products.find((product) => product.id === workOrder.productId)?.name ?? workOrder.productId,
                                typeLabel: 'Rework',
                                statusLabel: status,
                                summary,
                                updatedAt: new Date().toLocaleString(),
                                supervisorId: workOrder.supervisorId,
                              });
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          disabled={!canManageRework || busyId === row.id || row.status === status}
                          className={`px-2 py-1 rounded text-xs font-bold border ${
                            row.status === status ? 'bg-primary/10 border-primary/30 text-primary' : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </Card>
    </div>
  );
};
