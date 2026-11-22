import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { usePermission } from '@/utils/permissions';
import { csvCell } from '../domain/qualityAnalytics';
import { localDateIso } from '../domain/time';
import { reportedProductionQuantity } from '../domain/productionQuantity';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityPalletService } from '../services/qualityPalletService';
import { qualityProductionQuery } from '../services/qualityProductionQuery';
import { qualitySampleService } from '../services/qualitySampleService';
import { QmsPage, useQualityMasters } from '../qms/QmsChrome';
import { linePullDayTotals, linePullExportRows, linePullLineSummary, linePullPeriodBoards } from '../domain/samples';
import type { QualityLinePull, QualityPallet, QualityPeriodStatus } from '../model';

function percent(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${Number(((part / whole) * 100).toFixed(2))}٪`;
}

function reasonText(rows: QualityPallet[]): string {
  const counts = new Map<string, number>();
  rows.forEach((row) => (row.defects || []).forEach((defect) => {
    const count = Number(defect.count || 0);
    if (count <= 0) return;
    const label = defect.reasonLabel.trim() || 'غير مصنف';
    counts.set(label, (counts.get(label) || 0) + count);
  }));
  const text = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ar'))
    .map(([label, count]) => `${label} (${count})`)
    .join('، ');
  return text || '—';
}

export const QualitySummaries: React.FC = () => {
  const { can } = usePermission();
  const masters = useQualityMasters();
  const [date, setDate] = useState(localDateIso());
  const [tab, setTab] = useState<'daily' | 'lines' | 'pulls'>('daily');
  const [pallets, setPallets] = useState<QualityPallet[]>([]);
  const [pulls, setPulls] = useState<QualityLinePull[]>([]);
  const [periodStatuses, setPeriodStatuses] = useState<QualityPeriodStatus[] | null>(null);
  const [production, setProduction] = useState<Awaited<ReturnType<typeof qualityProductionQuery.quantitiesForDate>>>([]);

  useEffect(() => {
    Promise.all([
      qualityPalletService.listByDate(date).then(async (list) => {
        try {
          return await qualityPalletService.withDefects(list);
        } catch (error: unknown) {
          toast.error(qualityUserMessage(error, 'تعذر تحميل أسباب الرفض'));
          return list;
        }
      }),
      qualitySampleService.listPulls(date).then(async (list) => {
        try {
          return await qualitySampleService.withPullDefects(list);
        } catch (error: unknown) {
          toast.error(qualityUserMessage(error, 'تعذر تحميل أسباب سحب العينات'));
          return list;
        }
      }),
      qualitySampleService.listPeriodStatuses(date).catch((error: unknown) => {
        toast.error(qualityUserMessage(error, 'تعذر تحميل حالات التوقف'));
        return null;
      }),
      qualityProductionQuery.quantitiesForDate(date),
    ]).then(([nextPallets, nextPulls, nextPeriods, nextProduction]) => {
      setPallets(nextPallets);
      setPulls(nextPulls);
      setPeriodStatuses(nextPeriods);
      setProduction(nextProduction);
    }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تحميل الملخص')));
  }, [date]);

  const names = (lineId: string, productId: string) => ({
    lineName: masters.lines.find((line) => line.id === lineId)?.name || pallets.find((row) => row.lineId === lineId)?.lineName || 'خط غير معروف',
    productName: masters.products.find((product) => product.id === productId)?.name || pallets.find((row) => row.productId === productId)?.productName || production.find((row) => row.productId === productId)?.productName || 'منتج غير معروف',
    productCode: masters.products.find((product) => product.id === productId)?.code || pallets.find((row) => row.productId === productId)?.productCode || production.find((row) => row.productId === productId)?.productCode || '',
  });

  const groups = useMemo(() => {
    const keys = new Map<string, { lineId: string; productId: string }>();
    pallets.forEach((row) => keys.set(`${row.lineId}:${row.productId}`, { lineId: row.lineId, productId: row.productId }));
    production.forEach((row) => keys.set(`${row.lineId}:${row.productId}`, { lineId: row.lineId, productId: row.productId }));
    return [...keys.values()].map((key) => {
      const related = pallets.filter((row) => row.lineId === key.lineId && row.productId === key.productId);
      const inspectedSamples = related.reduce((sum, row) => sum + row.inspectedQuantity, 0);
      const defects = related.reduce((sum, row) => sum + row.rejectedQuantity, 0);
      const inspectors = [...new Set(related.map((row) => row.inspectorName?.trim()).filter(Boolean))];
      return {
        ...key,
        ...names(key.lineId, key.productId),
        produced: reportedProductionQuantity(production, date, key.lineId, key.productId),
        pallets: related.length,
        inspectedLots: related.filter((row) => row.inspectionStatus === 'تم الفحص').length,
        inspectedQuantity: related.filter((row) => row.inspectionStatus === 'تم الفحص').reduce((sum, row) => sum + row.quantityOnPallet, 0),
        waitingQuantity: related.filter((row) => row.inspectionStatus === 'في انتظار الفحص').reduce((sum, row) => sum + row.quantityOnPallet, 0),
        samples: inspectedSamples,
        defects,
        acceptedQuantity: Math.max(0, inspectedSamples - defects),
        acceptedPallets: related.filter((row) => row.palletDecision === 'مقبول').length,
        rejectedPallets: related.filter((row) => row.palletDecision === 'مرفوض').length,
        inspectors: inspectors.join('، '),
        reasons: reasonText(related),
      };
    });
  }, [pallets, production, date, masters.lines, masters.products]);

  const pullSummary = useMemo(() => linePullLineSummary(pulls), [pulls]);
  const pullTotals = useMemo(() => linePullDayTotals(pulls), [pulls]);
  const visiblePeriods = (periodStatuses || []).filter((row) => row.isStopped || row.noSampleReason.trim());
  const periodBoards = useMemo(() => linePullPeriodBoards(pulls, visiblePeriods.map((row) => ({
    slotKey: row.slotKey,
    lineId: row.lineId,
    lineName: masters.lines.find((line) => line.id === row.lineId)?.name || pulls.find((pull) => pull.lineId === row.lineId)?.lineName || 'خط غير معروف',
    isStopped: row.isStopped,
    noSampleReason: row.noSampleReason,
  }))), [pulls, visiblePeriods, masters.lines]);
  const pullExportRows = linePullExportRows(date, periodBoards);

  return (
    <QmsPage title="ملخصات الجودة" subtitle="كمية الإنتاج تُقرأ من تقارير الإنتاج. كمية البالتة هي حجم دفعة الفحص فقط." actions={
      <input className="qms-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    }>
      <div className="qms-row" style={{ marginBottom: 12 }}>
        <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setTab('daily')}>الإنتاج والمفحوص والانتظار</button>
        <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setTab('lines')}>حسب الخط</button>
        <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setTab('pulls')}>سحب العينات</button>
      </div>
      {tab === 'daily' ? (
        <section className="qms-card" style={{ overflowX: 'auto' }}>
          <table className="qms-table">
            <thead><tr><th>الكود</th><th>المنتج</th><th>الخط</th><th>البالتات</th><th>إنتاج التقارير</th><th>كمية مفحوصة</th><th>كمية بانتظار الفحص</th><th>عينات الفحص</th><th>العيوب</th><th>مقبول</th><th>مرفوض</th><th>نسبة الرفض</th></tr></thead>
            <tbody>
              {groups.map((row) => (
                <tr key={`${row.lineId}-${row.productId}`}>
                  <td>{row.productCode || '—'}</td>
                  <td>{row.productName}</td>
                  <td>{row.lineName}</td>
                  <td>{row.pallets}</td>
                  <td>{row.produced == null ? 'لا يوجد تقرير' : row.produced}</td>
                  <td>{row.inspectedQuantity}</td>
                  <td>{row.waitingQuantity}</td>
                  <td>{row.samples}</td>
                  <td>{row.defects}</td>
                  <td>{row.acceptedPallets}</td>
                  <td>{row.rejectedPallets}</td>
                  <td>{percent(row.defects, row.samples)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>الإجمالي</td><td></td><td></td>
                <td>{groups.reduce((sum, row) => sum + row.pallets, 0)}</td>
                <td>{groups.some((row) => row.produced != null) ? groups.reduce((sum, row) => sum + (row.produced || 0), 0) : '—'}</td>
                <td>{groups.reduce((sum, row) => sum + row.inspectedQuantity, 0)}</td>
                <td>{groups.reduce((sum, row) => sum + row.waitingQuantity, 0)}</td>
                <td>{groups.reduce((sum, row) => sum + row.samples, 0)}</td>
                <td>{groups.reduce((sum, row) => sum + row.defects, 0)}</td>
                <td>{groups.reduce((sum, row) => sum + row.acceptedPallets, 0)}</td>
                <td>{groups.reduce((sum, row) => sum + row.rejectedPallets, 0)}</td>
                <td>{percent(groups.reduce((sum, row) => sum + row.defects, 0), groups.reduce((sum, row) => sum + row.samples, 0))}</td>
              </tr>
            </tfoot>
          </table>
          {groups.length === 0 ? <p>لا توجد بالات أو تقارير إنتاج في هذا اليوم.</p> : null}
        </section>
      ) : null}
      {tab === 'lines' ? (
        <section className="qms-card" style={{ overflowX: 'auto' }}>
          <table className="qms-table">
            <thead><tr><th>الخط</th><th>المنتج</th><th>المراقب</th><th>إنتاج التقارير</th><th>عينات الفحص</th><th>المرفوض</th><th>المقبول</th><th>النسبة</th><th>أسباب الرفض</th><th>بالتات مقبولة</th><th>بالتات مرفوضة</th></tr></thead>
            <tbody>
              {groups.map((row) => (
                <tr key={`${row.lineId}-${row.productId}`}>
                  <td>{row.lineName}</td>
                  <td>{row.productName}</td>
                  <td>{row.inspectors || '—'}</td>
                  <td>{row.produced == null ? 'لا يوجد تقرير' : row.produced}</td>
                  <td>{row.samples}</td>
                  <td>{row.defects}</td>
                  <td>{row.acceptedQuantity}</td>
                  <td>{percent(row.defects, row.samples)}</td>
                  <td>{row.reasons}</td>
                  <td>{row.acceptedPallets}</td>
                  <td>{row.rejectedPallets}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {groups.length === 0 ? <p>لا توجد بالات أو تقارير إنتاج في هذا اليوم.</p> : null}
        </section>
      ) : null}
      {tab === 'pulls' ? (
        <section className="qms-card">
          <div className="qms-kpis" style={{ marginBottom: 12 }}>
            <div className="qms-card qms-kpi"><span>إجمالي السحبات</span><strong>{pullTotals.pulls}</strong></div>
            <div className="qms-card qms-kpi"><span>إجمالي العينات</span><strong>{pullTotals.samples}</strong></div>
            <div className="qms-card qms-kpi"><span>إجمالي المشاكل</span><strong>{pullTotals.defects}</strong></div>
            <div className="qms-card qms-kpi"><span>حالة البالتة</span><strong>{pullTotals.palletStatus}</strong></div>
            <div className="qms-card qms-kpi"><span>عدد الخطوط</span><strong>{pullTotals.lines}</strong></div>
          </div>
          <h2 className="qms-label">ملخص الخط</h2>
          <table className="qms-table">
            <thead><tr><th>الخط</th><th>المنتجات</th><th>المحطات</th><th>المراقبون</th><th>السحبات</th><th>العينات</th><th>حالة البالتة</th><th>العيوب</th><th>المشاكل</th></tr></thead>
            <tbody>
              {pullSummary.map((row) => (
                <tr key={row.lineId}><td>{row.lineName}</td><td>{row.products}</td><td>{row.stations}</td><td>{row.inspectors}</td><td>{row.pulls}</td><td>{row.samples}</td><td>{row.palletStatus}</td><td>{row.defects}</td><td>{row.problems}</td></tr>
              ))}
            </tbody>
          </table>
          {pullSummary.length === 0 ? <p>لا يوجد سحب عينات في هذا اليوم.</p> : null}
          <h2 className="qms-label" style={{ marginTop: 12 }}>حالات التوقف وعدم السحب</h2>
          <p className="qms-muted">الحفظ يتم من شاشة سحب العينات. هذا الجدول يعرض الحالات المحفوظة فقط.</p>
          {periodStatuses == null ? <p>حالات التوقف غير متاحة.</p> : visiblePeriods.length === 0 ? <p>لا توجد حالات توقف أو أسباب عدم سحب محفوظة.</p> : (
            <table className="qms-table">
              <thead><tr><th>الفترة</th><th>الخط</th><th>الحالة</th><th>سبب عدم السحب</th></tr></thead>
              <tbody>
                {visiblePeriods.map((row) => (
                  <tr key={row.id}>
                    <td>{row.slotKey}</td>
                    <td>{masters.lines.find((line) => line.id === row.lineId)?.name || pulls.find((pull) => pull.lineId === row.lineId)?.lineName || 'خط غير معروف'}</td>
                    <td>{row.isStopped ? 'متوقف' : 'يعمل'}</td>
                    <td>{row.noSampleReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 className="qms-label" style={{ marginTop: 12 }}>الفترات</h2>
          {can('quality.reports.export') ? (
            <div className="qms-row">
              <button type="button" className="qms-btn qms-btn-primary" disabled={pullExportRows.length === 0} onClick={() => {
                const sheet = XLSX.utils.json_to_sheet(pullExportRows);
                const book = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(book, sheet, 'السحب');
                saveAs(new Blob([XLSX.write(book, { bookType: 'xlsx', type: 'array' })]), `line-pulls-${date}.xlsx`);
              }}>تصدير Excel</button>
              <button type="button" className="qms-btn qms-btn-ghost" disabled={pullExportRows.length === 0} onClick={() => {
                const header = Object.keys(pullExportRows[0] || {}).map((key) => csvCell(key)).join(',');
                const body = pullExportRows.map((row) => Object.values(row).map((value) => csvCell(value)).join(','));
                saveAs(new Blob([`\uFEFF${[header, ...body].join('\n')}`], { type: 'text/csv;charset=utf-8' }), `line-pulls-${date}.csv`);
              }}>تصدير CSV</button>
            </div>
          ) : null}
          {periodBoards.length === 0 ? <p>لا توجد فترات سحب في هذا اليوم.</p> : periodBoards.map((period) => (
            <div key={period.key} style={{ marginTop: 12 }}>
              <p className="qms-label">{period.label} — عينات {period.samples} · عيوب {period.defects}</p>
              <table className="qms-table">
                <thead><tr><th>الخط</th><th>المنتج</th><th>المحطة</th><th>المراقب</th><th>العينات</th><th>السحبات</th><th>حالة البالتة</th><th>حالة السحب</th><th>حالة الخط</th><th>سبب عدم السحب</th><th>المشاكل</th></tr></thead>
                <tbody>
                  {period.lines.map((line) => (
                    <tr key={`${period.key}:${line.lineId}`} className={line.rejected > 0 ? 'qms-rejected' : undefined}>
                      <td>{line.lineName}</td><td>{line.products}</td><td>{line.stations}</td><td>{line.inspectors}</td><td>{line.samples}</td><td>{line.pulls}</td><td>{line.palletStatus}</td><td>{line.pullStatus}</td><td>{line.lineStatus}</td><td>{line.noSampleReason}</td><td>{line.problems}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>إجمالي الفترة</td><td></td><td></td><td></td>
                    <td>{period.samples}</td><td>{period.pulls}</td><td>{period.palletStatus}</td><td></td><td></td><td></td><td>العيوب: {period.defects}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </section>
      ) : null}
    </QmsPage>
  );
};
