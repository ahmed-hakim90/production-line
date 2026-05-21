import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { PrimaryButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { reportService } from '../services/reportService';
import { getReportWaste } from '../../../utils/calculations';
import { computeLineEfficiencyFromReports } from '../engines/lineEfficiencyEngine';
import { useAppStore } from '../../../store/useAppStore';
import { getOperationalDateString } from '../../../utils/calculations';

export const LineEfficiencyReport: React.FC = () => {
  const lines = useAppStore((s) => s.productionLines);
  const lineName = useMemo(() => new Map(lines.map((l) => [l.id || '', l.name])), [lines]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReturnType<typeof computeLineEfficiencyFromReports>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const end = getOperationalDateString();
      const start = getOperationalDateString(30);
      const reports = await reportService.getByDateRange(start, end);
      const wasteMap = new Map(reports.map((r) => [r.id || '', getReportWaste(r)]));
      setRows(computeLineEfficiencyFromReports(reports, wasteMap));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="كفاءة الخطوط"
        subtitle="مؤشرات مبسّطة من تقارير آخر 30 يوماً (إنتاج، هدر، ساعات)"
        actions={<PrimaryButton onClick={() => void load()} disabled={loading}>تحديث</PrimaryButton>}
      />

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>الخطوط</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="erp-table w-full text-right text-sm">
              <thead>
                <tr>
                  <th className="erp-th">الخط</th>
                  <th className="erp-th">تقارير</th>
                  <th className="erp-th">إنتاج</th>
                  <th className="erp-th">هدر %</th>
                  <th className="erp-th">إنتاج/ساعة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lineId}>
                    <td className="px-3 py-2 font-bold">{lineName.get(r.lineId) || r.lineId}</td>
                    <td className="px-3 py-2">{r.reportCount}</td>
                    <td className="px-3 py-2 tabular-nums">{r.totalProduced}</td>
                    <td className="px-3 py-2 tabular-nums">{r.wastePct}%</td>
                    <td className="px-3 py-2 tabular-nums">{r.outputPerHour}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
