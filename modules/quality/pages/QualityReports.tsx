import React, { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, KPIBox } from '@/components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityPrintService } from '../services/qualityPrintService';
import type { QualityDefect } from '@/types';

export const QualityReports: React.FC = () => {
  const { can } = usePermission();
  const canPrint = can('quality.print');
  const [searchParams] = useSearchParams();
  const workOrders = useAppStore((s) => s.workOrders);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(searchParams.get('workOrderId') ?? '');
  const [summary, setSummary] = useState({
    inspectedUnits: 0,
    passedUnits: 0,
    failedUnits: 0,
    reworkUnits: 0,
    defectRate: 0,
    firstPassYield: 0,
  });
  const [loading, setLoading] = useState(false);
  const [defects, setDefects] = useState<QualityDefect[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  const selectedWorkOrder = useMemo(
    () => workOrders.find((wo) => wo.id === selectedWorkOrderId) ?? null,
    [workOrders, selectedWorkOrderId],
  );

  const runReport = async () => {
    if (!selectedWorkOrderId) return;
    setLoading(true);
    try {
      const [built, defectsRows] = await Promise.all([
        qualityInspectionService.buildWorkOrderSummary(selectedWorkOrderId),
        qualityInspectionService.getDefectsByWorkOrder(selectedWorkOrderId),
      ]);
      setSummary(built);
      setDefects(defectsRows);
    } finally {
      setLoading(false);
    }
  };

  const topDefectReasons = useMemo(() => {
    const grouped = defects.reduce<Record<string, number>>((acc, item) => {
      acc[item.reasonLabel] = (acc[item.reasonLabel] ?? 0) + (item.quantity || 1);
      return acc;
    }, {});
    return Object.entries(grouped)
      .map(([reasonLabel, quantity]) => ({ reasonLabel, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [defects]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-black">تقارير الجودة</h2>
          <p className="text-sm text-slate-500">ملخص جودة لكل أمر شغل + جاهز للطباعة</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={!canPrint}>طباعة التقرير</Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current) return;
              await qualityPrintService.exportDocumentPdf(
                printRef.current,
                `quality-kpi-${selectedWorkOrder?.workOrderNumber ?? 'snapshot'}`,
                'quality_kpi',
                selectedWorkOrder?.id,
              );
            }}
            disabled={!canPrint}
          >
            PDF KPI
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current || !selectedWorkOrder?.id) return;
              await qualityPrintService.exportDocumentPdf(
                printRef.current,
                `quality-defects-${selectedWorkOrder.workOrderNumber ?? 'snapshot'}`,
                'defects',
                selectedWorkOrder.id,
              );
            }}
            disabled={!canPrint || !selectedWorkOrder?.id}
          >
            PDF Defects
          </Button>
        </div>
      </div>

      <div ref={printRef} className="space-y-6">
      <Card>
        <div className="grid md:grid-cols-4 gap-3">
          <select
            value={selectedWorkOrderId}
            onChange={(e) => setSelectedWorkOrderId(e.target.value)}
            className="md:col-span-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            <option value="">اختر أمر شغل</option>
            {workOrders.map((wo) => (
              <option key={wo.id} value={wo.id}>#{wo.workOrderNumber}</option>
            ))}
          </select>
          <Button variant="primary" disabled={loading || !selectedWorkOrderId} onClick={runReport}>
            {loading ? 'جاري التحميل...' : 'تحميل التقرير'}
          </Button>
        </div>
      </Card>

      {selectedWorkOrder && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPIBox label="Inspected" value={summary.inspectedUnits} icon="fact_check" colorClass="bg-blue-100 text-blue-600" />
            <KPIBox label="Passed" value={summary.passedUnits} icon="check_circle" colorClass="bg-emerald-100 text-emerald-600" />
            <KPIBox label="Failed" value={summary.failedUnits} icon="error" colorClass="bg-rose-100 text-rose-600" />
            <KPIBox label="Rework" value={summary.reworkUnits} icon="build" colorClass="bg-amber-100 text-amber-600" />
            <KPIBox label="Defect Rate" value={summary.defectRate} unit="%" icon="priority_high" colorClass="bg-violet-100 text-violet-600" />
            <KPIBox label="FPY" value={summary.firstPassYield} unit="%" icon="insights" colorClass="bg-cyan-100 text-cyan-600" />
          </div>
          <Card title="أعلى أسباب العيوب">
            {topDefectReasons.length === 0 ? (
              <p className="text-sm text-slate-500">لا توجد عيوب مسجلة لأمر الشغل المحدد.</p>
            ) : (
              <div className="space-y-2">
                {topDefectReasons.map((item) => (
                  <div key={item.reasonLabel} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{item.reasonLabel}</span>
                    <span className="font-black text-primary">{item.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
      </div>
    </div>
  );
};
