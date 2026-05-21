import React, { useCallback, useState } from 'react';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '../../../store/useAppStore';
import { getCurrentMonth } from '../../../utils/costCalculations';
import { executivePeriodReportService, type ExecutivePeriodReport } from '../services/executivePeriodReportService';
import { exportGenericRows } from '../../../utils/exportExcel';

export const ExecutivePeriodReportPage: React.FC = () => {
  const employees = useAppStore((s) => s.employees);
  const lines = useAppStore((s) => s.productionLines);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const [month, setMonth] = useState(getCurrentMonth());
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ExecutivePeriodReport | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await executivePeriodReportService.build(month, { employees, lines, settings: systemSettings }));
    } finally {
      setLoading(false);
    }
  }, [month, employees, lines, systemSettings]);

  const exportExcel = () => {
    if (!report) return;
    const rows = report.sections.flatMap((s) =>
      s.lines.map((line) => ({ القسم: s.title, البند: line })),
    );
    exportGenericRows(rows, `executive-${report.month}`, 'تقرير تنفيذي');
  };

  const printPdf = () => {
    if (!report) return;
    const html = `
      <html dir="rtl"><head><meta charset="utf-8"><title>تقرير تنفيذي</title></head>
      <body style="font-family:Tahoma;padding:24px">
      <h1>التقرير التنفيذي — ${report.month}</h1>
      ${report.sections.map((s) => `<h2>${s.title}</h2><ul>${s.lines.map((l) => `<li>${l}</li>`).join('')}</ul>`).join('')}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.print();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="التقرير التنفيذي الموحّد" subtitle="ملخص شهري للإنتاج والمخزون والتكاليف" />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-bold">
          الشهر
          <input
            type="month"
            className="erp-field-input block mt-1"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <PrimaryButton onClick={() => void generate()} disabled={loading}>
          {loading ? 'جاري التوليد...' : 'توليد التقرير'}
        </PrimaryButton>
        {report && (
          <>
            <GhostButton onClick={exportExcel}>Excel</GhostButton>
            <GhostButton onClick={printPdf}>طباعة / PDF</GhostButton>
          </>
        )}
      </div>

      {report && (
        <div className="space-y-4">
          {report.sections.map((section) => (
            <Card key={section.key}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pr-5 space-y-1 text-sm">
                  {section.lines.map((line, idx) => (
                    <li key={`${section.key}-${idx}`}>{line}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
