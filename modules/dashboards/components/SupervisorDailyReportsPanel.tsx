import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GhostButton, PrimaryButton } from '@/src/components/erp/ActionButton';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';
import { exportNodeToPng } from '@/src/shared/utils/exportNodeToImage';
import { shareImageBlobToWhatsApp } from '@/utils/reportExport';
import { retryProductionReportProcessingCallable } from '@/modules/auth/services/firebase';
import { firstTwoSupervisorNames } from '@/modules/dashboards/lib/supervisorReportingAccess';
import type { FirestoreEmployee, FirestoreProduct, ProductionReport, PrintTemplateSettings } from '@/types';
import { formatNumber } from '@/utils/calculations';

type Props = {
  reports: ProductionReport[];
  employees: FirestoreEmployee[];
  products: FirestoreProduct[];
  companyName?: string;
  printSettings?: PrintTemplateSettings;
  loading?: boolean;
};

type SummaryRow = {
  key: string;
  reportId?: string;
  productName: string;
  supervisorName: string;
  quantity: number;
  workers: number;
  hours: number;
  processingState?: ProductionReport['processingState'];
};

const reportQuantity = (report: ProductionReport): number => {
  if (report.reportType === 'packaging') {
    const total = (report.packagingLines || []).reduce(
      (sum, line) => sum + Number(line.quantityPieces || 0),
      0,
    );
    return total > 0 ? total : Number(report.quantityProduced || 0);
  }
  if (report.reportType === 'component_waste') {
    return (report.componentScrapItems || []).reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
  }
  return Number(report.quantityProduced || 0);
};

const reportWorkers = (report: ProductionReport): number => {
  const detailed = Number(report.workersProductionCount || 0)
    + Number(report.workersPackagingCount || 0)
    + Number(report.workersQualityCount || 0)
    + Number(report.workersMaintenanceCount || 0)
    + Number(report.workersExternalCount || 0);
  return detailed > 0 ? detailed : Number(report.workersCount || 0);
};

const processingLabel = (state?: ProductionReport['processingState']) => {
  if (state === 'pending' || state === 'processing') return 'جاري الترحيل';
  if (state === 'failed') return 'تعذر الترحيل';
  return '';
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

function SummaryImage({
  rows,
  companyName,
  accent,
  targetRef,
}: {
  rows: SummaryRow[];
  companyName: string;
  accent: string;
  targetRef: React.Ref<HTMLDivElement>;
}) {
  const totals = rows.reduce(
    (acc, row) => ({
      quantity: acc.quantity + row.quantity,
      workers: acc.workers + row.workers,
      hours: acc.hours + row.hours,
    }),
    { quantity: 0, workers: 0, hours: 0 },
  );
  const generatedAt = new Date().toLocaleString('ar-EG');

  return (
    <div ref={targetRef} dir="rtl" lang="ar" style={{ width: 1080, background: '#fff', color: '#0f172a', padding: 48, fontFamily: "'Cairo', Tahoma, sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, borderBottom: `4px solid ${accent}`, paddingBottom: 24, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 38, fontWeight: 900 }}>{companyName || 'تقرير الإنتاج'}</div>
          <div style={{ fontSize: 27, fontWeight: 800, color: accent, marginTop: 6 }}>تقرير إنتاج اليوم المجمع</div>
        </div>
        <div style={{ fontSize: 20, color: '#64748b', direction: 'ltr', textAlign: 'left' }}>{generatedAt}</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 22 }}>
        <thead>
          <tr style={{ background: accent, color: '#fff' }}>
            {['اسم المنتج', 'المشرف', 'الكمية', 'إجمالي العمالة', 'الساعات'].map((label, index) => (
              <th key={label} style={{ padding: '16px 12px', border: '1px solid #dbe3ee', width: index < 2 ? '25%' : index === 3 ? '19%' : '15.5%' }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key} style={{ background: index % 2 ? '#f8fafc' : '#fff' }}>
              <td style={{ padding: '15px 12px', border: '1px solid #dbe3ee', fontWeight: 800, overflowWrap: 'anywhere' }}>{row.productName}</td>
              <td style={{ padding: '15px 12px', border: '1px solid #dbe3ee', fontWeight: 700 }}>{row.supervisorName}</td>
              <td style={{ padding: '15px 12px', border: '1px solid #dbe3ee', textAlign: 'center', fontWeight: 800 }}>{formatNumber(row.quantity)}</td>
              <td style={{ padding: '15px 12px', border: '1px solid #dbe3ee', textAlign: 'center', fontWeight: 800 }}>{formatNumber(row.workers)}</td>
              <td style={{ padding: '15px 12px', border: '1px solid #dbe3ee', textAlign: 'center', fontWeight: 800 }}>{formatNumber(row.hours)}</td>
            </tr>
          ))}
          <tr style={{ background: '#eef2ff', color: '#172554' }}>
            <td style={{ padding: '17px 12px', border: '1px solid #cbd5e1', fontWeight: 900 }}>الإجمالي</td>
            <td style={{ padding: '17px 12px', border: '1px solid #cbd5e1', fontWeight: 800 }}>{rows.length} تقرير</td>
            <td style={{ padding: '17px 12px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 900 }}>{formatNumber(totals.quantity)}</td>
            <td style={{ padding: '17px 12px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 900 }}>{formatNumber(totals.workers)}</td>
            <td style={{ padding: '17px 12px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 900 }}>{formatNumber(totals.hours)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function SupervisorDailyReportsPanel({ reports, employees, products, companyName = '', printSettings, loading = false }: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [creatingImage, setCreatingImage] = useState(false);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [retryingReportId, setRetryingReportId] = useState('');

  const rows = useMemo<SummaryRow[]>(() => {
    const employeeNames = new Map(employees.filter((row) => row.id).map((row) => [String(row.id), row.name]));
    const productNames = new Map(products.filter((row) => row.id).map((row) => [String(row.id), row.name]));
    return reports
      .filter((report) => report.lifecycleStatus !== 'open')
      .map((report, index) => ({
        key: report.id || report.reportCode || `${report.date}-${report.workOrderId || index}`,
        reportId: report.id,
        productName: report.productNameSnapshot || productNames.get(String(report.productId)) || '—',
        supervisorName: firstTwoSupervisorNames(employeeNames.get(String(report.employeeId)) || ''),
        quantity: reportQuantity(report),
        workers: reportWorkers(report),
        hours: Number(report.workHours || 0),
        processingState: report.processingState,
      }));
  }, [employees, products, reports]);

  const totals = useMemo(() => rows.reduce(
    (acc, row) => ({
      quantity: acc.quantity + row.quantity,
      workers: acc.workers + row.workers,
      hours: acc.hours + row.hours,
    }),
    { quantity: 0, workers: 0, hours: 0 },
  ), [rows]);

  useEffect(() => {
    if (!imageBlob) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(imageBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);

  const createImage = async () => {
    if (!captureRef.current || rows.length === 0 || creatingImage) return;
    setCreatingImage(true);
    try {
      const blob = await exportNodeToPng(captureRef.current);
      setImageBlob(blob);
    } catch (error) {
      showAppToast('error', error instanceof Error ? error.message : 'تعذر إنشاء صورة التقرير.');
    } finally {
      setCreatingImage(false);
    }
  };

  const fileName = `production-summary-${new Date().toISOString().slice(0, 10)}.png`;
  const accent = printSettings?.primaryColor || '#4f46e5';

  const retryProcessing = async (reportId: string) => {
    if (!reportId || retryingReportId) return;
    setRetryingReportId(reportId);
    try {
      await retryProductionReportProcessingCallable(reportId);
      showAppToast('success', 'تم إرسال التقرير لإعادة الترحيل في الخلفية.');
    } catch (error) {
      showAppToast('error', error instanceof Error ? error.message : 'تعذرت إعادة محاولة الترحيل.');
    } finally {
      setRetryingReportId('');
    }
  };

  return (
    <>
      <OpsDashPanel
        title="تقارير اليوم التي أدخلتها"
        accent="production"
        action={(
          <PrimaryButton type="button" size="sm" tone="share" iconName="image" disabled={rows.length === 0 || creatingImage} onClick={() => { void createImage(); }}>
            {creatingImage ? 'جاري إنشاء الصورة…' : 'إنشاء صورة'}
          </PrimaryButton>
        )}
      >
        {loading && rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">جاري تحميل تقارير اليوم…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">لم تُدخل تقارير إنتاج اليوم بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table w-full min-w-[680px] text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">اسم المنتج</th>
                  <th className="erp-th">المشرف</th>
                  <th className="erp-th text-center">الكمية</th>
                  <th className="erp-th text-center">إجمالي العمالة</th>
                  <th className="erp-th text-center">الساعات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-[var(--color-border)]">
                    <td className="px-3 py-2.5 font-bold text-[var(--color-text)]">{row.productName}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{row.supervisorName}</span>
                      {processingLabel(row.processingState) ? (
                        <span className={`me-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${row.processingState === 'failed' ? 'bg-[rgb(var(--color-danger)/0.12)] text-[rgb(var(--color-danger))]' : 'bg-[rgb(var(--color-warning)/0.12)] text-[rgb(var(--color-warning))]'}`}>
                          {processingLabel(row.processingState)}
                        </span>
                      ) : null}
                      {row.processingState === 'failed' && row.reportId ? (
                        <button
                          type="button"
                          className="me-2 text-[10px] font-black text-[rgb(var(--color-primary))] underline"
                          disabled={Boolean(retryingReportId)}
                          onClick={() => { void retryProcessing(row.reportId!); }}
                        >
                          {retryingReportId === row.reportId ? 'جاري الإرسال…' : 'إعادة المحاولة'}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold tabular-nums">{formatNumber(row.quantity)}</td>
                    <td className="px-3 py-2.5 text-center font-bold tabular-nums">{formatNumber(row.workers)}</td>
                    <td className="px-3 py-2.5 text-center font-bold tabular-nums">{formatNumber(row.hours)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                  <td className="px-3 py-3 font-black">الإجمالي</td>
                  <td className="px-3 py-3 font-bold">{rows.length} تقرير</td>
                  <td className="px-3 py-3 text-center font-black tabular-nums">{formatNumber(totals.quantity)}</td>
                  <td className="px-3 py-3 text-center font-black tabular-nums">{formatNumber(totals.workers)}</td>
                  <td className="px-3 py-3 text-center font-black tabular-nums">{formatNumber(totals.hours)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </OpsDashPanel>

      <div style={{ position: 'fixed', left: '-99999px', top: 0, width: 1080, background: '#fff', pointerEvents: 'none' }}>
        <SummaryImage rows={rows} companyName={companyName} accent={accent} targetRef={captureRef} />
      </div>

      <Dialog open={Boolean(imageBlob)} onOpenChange={(open) => { if (!open) setImageBlob(null); }}>
        <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>صورة تقرير إنتاج اليوم</DialogTitle>
            <DialogDescription>صورة واحدة تضم كل التقارير التي أدخلتها اليوم.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
            {previewUrl ? <img src={previewUrl} alt="معاينة تقرير إنتاج اليوم" className="mx-auto h-auto w-full" /> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <GhostButton type="button" onClick={() => setImageBlob(null)}>إغلاق</GhostButton>
            <GhostButton type="button" tone="export" iconName="download" disabled={!imageBlob} onClick={() => { if (imageBlob) downloadBlob(imageBlob, fileName); }}>
              تحميل PNG
            </GhostButton>
            <PrimaryButton type="button" tone="share" iconName="share" disabled={!imageBlob} onClick={() => { if (imageBlob) void shareImageBlobToWhatsApp(imageBlob, fileName.replace(/\.png$/, '')); }}>
              مشاركة
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
