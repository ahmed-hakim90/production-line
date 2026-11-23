import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { localDateIso } from '../domain/time';
import { totalLinePullSampleCount } from '../domain/samples';
import { buildDailyInspectionSummary, type DailyInspectionGroup } from '../domain/dailyInspectionSummary';
import { reportedProductionQuantity } from '../domain/productionQuantity';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityPalletService } from '../services/qualityPalletService';
import { qualityProductionQuery } from '../services/qualityProductionQuery';
import { qualitySampleService } from '../services/qualitySampleService';
import { QmsPage } from '../qms/QmsChrome';
import type { QualityPallet, QualityLinePull } from '../model';

export const QualitySummaries: React.FC = () => {
  const [date, setDate] = useState(localDateIso());
  const [tab, setTab] = useState<'inspection' | 'daily' | 'lines' | 'pulls'>('inspection');
  const [pallets, setPallets] = useState<QualityPallet[]>([]);
  const [pulls, setPulls] = useState<QualityLinePull[]>([]);
  const [production, setProduction] = useState<Awaited<ReturnType<typeof qualityProductionQuery.quantitiesForDate>>>([]);
  const [expandedDefectGroups, setExpandedDefectGroups] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    Promise.all([
      qualityPalletService.listByDate(date),
      qualitySampleService.listPulls(date),
      qualityProductionQuery.quantitiesForDate(date),
    ]).then(async ([nextPallets, nextPulls, nextProduction]) => {
      const pullsWithDefects = nextPulls.filter((row) => row.defectCount > 0);
      const detailedPulls = pullsWithDefects.length > 0
        ? await qualitySampleService.withPullDefects(pullsWithDefects)
        : [];
      const detailsById = new Map(detailedPulls.map((row) => [row.id, row.defects || []]));
      setPallets(nextPallets);
      setPulls(nextPulls.map((row) => ({ ...row, defects: detailsById.get(row.id) || [] })));
      setProduction(nextProduction);
    }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تحميل الملخص')));
  }, [date]);

  useEffect(() => {
    setExpandedDefectGroups(new Set());
  }, [date]);

  const daily = useMemo(() => {
    const keys = new Map<string, { productName: string; lineId: string; productId: string; lineName: string }>();
    pallets.forEach((row) => keys.set(`${row.lineId}:${row.productId}`, { productName: row.productName, lineId: row.lineId, productId: row.productId, lineName: row.lineName }));
    return [...keys.values()].map((key) => {
      const related = pallets.filter((row) => row.lineId === key.lineId && row.productId === key.productId);
      const produced = reportedProductionQuantity(production, date, key.lineId, key.productId);
      return {
        ...key,
        produced,
        lotQty: related.reduce((sum, row) => sum + row.quantityOnPallet, 0),
        inspectedLots: related.filter((row) => row.inspectionStatus === 'تم الفحص').length,
        waitingLots: related.filter((row) => row.inspectionStatus !== 'تم الفحص').length,
        defects: related.reduce((sum, row) => sum + row.rejectedQuantity, 0),
      };
    });
  }, [pallets, production, date]);

  const byLine = useMemo(() => {
    const names = new Map<string, string>();
    pallets.forEach((row) => names.set(row.lineId, row.lineName));
    pulls.forEach((row) => names.set(row.lineId, row.lineName));
    return [...names.entries()].map(([lineId, lineName]) => ({
      lineName,
      accepted: pallets.filter((row) => row.lineId === lineId && row.palletDecision === 'مقبول').length,
      rejected: pallets.filter((row) => row.lineId === lineId && row.palletDecision === 'مرفوض').length
        + pulls.filter((row) => row.lineId === lineId && row.palletRejected).length,
    }));
  }, [pallets, pulls]);

  const inspectionSummary = useMemo(() => buildDailyInspectionSummary(pulls), [pulls]);

  const renderInspectionTable = (title: string, groupKey: string, rows: DailyInspectionGroup[]) => (
    <section className="qms-card qms-daily-inspection-panel">
      <h2 className="qms-subtitle">{title}</h2>
      <div className="qms-table-wrap">
        <table className="qms-table qms-daily-inspection-table">
          <thead>
            <tr><th>{title.replace('إجمالي العينات حسب ', '')}</th><th>السحبات</th><th>العينات</th><th>حالة الفحص</th><th>العيوب</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.rejected > 0 ? 'qms-rejected' : undefined}>
                <td>{row.name}</td>
                <td>{row.pulls}</td>
                <td>{row.samples}</td>
                <td>
                  {row.accepted > 0 ? <span className="qms-daily-status is-accepted">مقبولة ({row.accepted})</span> : null}
                  {row.rejected > 0 ? <span className="qms-daily-status is-rejected">مرفوضة ({row.rejected})</span> : null}
                  {row.pending > 0 ? <span className="qms-daily-status is-pending">قيد الفحص ({row.pending})</span> : null}
                </td>
                <td>
                  <strong className={row.defects > 0 ? 'qms-daily-defect-count has-defects' : 'qms-daily-defect-count'}>{row.defects}</strong>
                  {row.defectDetails.length > 0 ? (
                    <>
                      <button
                        type="button"
                        className="qms-daily-defect-toggle"
                        aria-expanded={expandedDefectGroups.has(`${groupKey}:${row.key}`)}
                        aria-label={`${expandedDefectGroups.has(`${groupKey}:${row.key}`) ? 'إخفاء' : 'عرض'} عيوب ${row.name}`}
                        onClick={() => setExpandedDefectGroups((current) => {
                          const next = new Set(current);
                          const key = `${groupKey}:${row.key}`;
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })}
                      >
                        {expandedDefectGroups.has(`${groupKey}:${row.key}`) ? 'إخفاء العيوب' : 'عرض العيوب'}
                      </button>
                      {expandedDefectGroups.has(`${groupKey}:${row.key}`) ? (
                        <div className="qms-daily-defect-details">
                          {row.defectDetails.map((defect) => (
                            <span key={defect.key}>{defect.label} ({defect.count})</span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : row.defects > 0 ? (
                    <small className="qms-muted">تفاصيل العيوب غير متاحة</small>
                  ) : <small className="qms-muted">لا توجد عيوب مسجلة</small>}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr>
                <th>الإجمالي</th>
                <th>{rows.reduce((sum, row) => sum + row.pulls, 0)}</th>
                <th>{rows.reduce((sum, row) => sum + row.samples, 0)}</th>
                <th>
                  <span className="qms-daily-status is-accepted">مقبولة ({rows.reduce((sum, row) => sum + row.accepted, 0)})</span>
                  <span className="qms-daily-status is-rejected">مرفوضة ({rows.reduce((sum, row) => sum + row.rejected, 0)})</span>
                  {rows.some((row) => row.pending > 0) ? (
                    <span className="qms-daily-status is-pending">قيد الفحص ({rows.reduce((sum, row) => sum + row.pending, 0)})</span>
                  ) : null}
                </th>
                <th>{rows.reduce((sum, row) => sum + row.defects, 0)}</th>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {rows.length === 0 ? <p className="qms-muted">لا توجد سحبات في هذا اليوم.</p> : null}
    </section>
  );

  return (
    <QmsPage title={tab === 'inspection' ? 'إجمال فحص اليوم' : 'ملخصات الجودة'} subtitle="ملخص فحوص سحب عينات الخطوط حسب المراقب ومحطة الفحص والخط." actions={
      <input className="qms-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    }>
      <div className="qms-row" style={{ marginBottom: 12 }}>
        <button type="button" className={`qms-btn ${tab === 'inspection' ? 'qms-btn-primary' : 'qms-btn-ghost'}`} aria-pressed={tab === 'inspection'} onClick={() => setTab('inspection')}>إجمال فحص اليوم</button>
        <button type="button" className={`qms-btn ${tab === 'daily' ? 'qms-btn-primary' : 'qms-btn-ghost'}`} aria-pressed={tab === 'daily'} onClick={() => setTab('daily')}>الإنتاج والمفحوص والانتظار</button>
        <button type="button" className={`qms-btn ${tab === 'lines' ? 'qms-btn-primary' : 'qms-btn-ghost'}`} aria-pressed={tab === 'lines'} onClick={() => setTab('lines')}>حسب الخط</button>
        <button type="button" className={`qms-btn ${tab === 'pulls' ? 'qms-btn-primary' : 'qms-btn-ghost'}`} aria-pressed={tab === 'pulls'} onClick={() => setTab('pulls')}>سحب العينات</button>
      </div>
      {tab === 'inspection' ? (
        <div className="qms-daily-inspection">
          <section className="qms-kpis qms-daily-inspection-kpis" aria-label="إجمالي فحوص اليوم">
            <div className="qms-card qms-kpi"><span>إجمالي السحبات</span><strong>{inspectionSummary.totals.pulls}</strong></div>
            <div className="qms-card qms-kpi"><span>إجمالي العينات</span><strong>{inspectionSummary.totals.samples}</strong></div>
            <div className="qms-card qms-kpi"><span>مقبولة</span><strong>{inspectionSummary.totals.accepted}</strong></div>
            <div className="qms-card qms-kpi"><span>مرفوضة</span><strong>{inspectionSummary.totals.rejected}</strong></div>
            <div className="qms-card qms-kpi"><span>إجمالي العيوب</span><strong>{inspectionSummary.totals.defects}</strong></div>
          </section>
          <div className="qms-daily-inspection-grid">
            {renderInspectionTable('إجمالي العينات حسب المراقب', 'inspector', inspectionSummary.byInspector)}
            {renderInspectionTable('إجمالي العينات حسب المحطة', 'station', inspectionSummary.byStation)}
            {renderInspectionTable('إجمالي العينات حسب الخط', 'line', inspectionSummary.byLine)}
          </div>
        </div>
      ) : null}
      {tab === 'daily' ? (
        <section className="qms-card">
          <table className="qms-table">
            <thead><tr><th>الخط</th><th>المنتج</th><th>إنتاج التقارير</th><th>كمية البالتات</th><th>بالتات مفحوصة</th><th>بانتظار الفحص</th><th>عيوب</th></tr></thead>
            <tbody>
              {daily.map((row) => (
                <tr key={`${row.lineId}-${row.productId}`}>
                  <td>{row.lineName}</td><td>{row.productName}</td><td>{row.produced == null ? 'لا يوجد تقرير' : row.produced}</td><td>{row.lotQty}</td><td>{row.inspectedLots}</td><td>{row.waitingLots}</td><td>{row.defects}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {daily.length === 0 ? <p>لا توجد بالات في هذا اليوم.</p> : null}
        </section>
      ) : null}
      {tab === 'lines' ? (
        <section className="qms-card" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byLine}>
              <XAxis dataKey="lineName" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="accepted" fill="#15803d" name="مقبول" />
              <Bar dataKey="rejected" fill="#c8102e" name="مرفوض" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      ) : null}
      {tab === 'pulls' ? (
        <section className="qms-card">
          <table className="qms-table">
            <thead><tr><th>الفترة</th><th>الخط</th><th>المنتج</th><th>العينات</th><th>العيوب</th><th>القرار</th></tr></thead>
            <tbody>
              {pulls.map((row) => (
                <tr key={row.id} className={row.palletRejected ? 'qms-rejected' : undefined}>
                  <td>{row.startTime}–{row.endTime}</td><td>{row.lineName}</td><td>{row.productName}</td><td>{totalLinePullSampleCount(row)}</td><td>{row.defectCount}</td><td>{row.status === 'completed' ? (row.palletRejected ? 'مرفوضة' : 'مقبولة') : 'قيد الفحص'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </QmsPage>
  );
};

export const QualityDashboard: React.FC = () => {
  const [date, setDate] = useState(localDateIso());
  const [pallets, setPallets] = useState<QualityPallet[]>([]);
  useEffect(() => {
    qualityPalletService.listByDate(date).then(setPallets).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر التحميل')));
  }, [date]);
  const waiting = pallets.filter((row) => row.inspectionStatus === 'في انتظار الفحص').length;
  const accepted = pallets.filter((row) => row.palletDecision === 'مقبول').length;
  const rejected = pallets.filter((row) => row.palletDecision === 'مرفوض').length;
  return (
    <QmsPage title="لوحة الجودة" subtitle="مؤشرات بالات اليوم. لا تُعرض بيانات تجريبية." actions={<input className="qms-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />}>
      <div className="qms-kpis">
        <div className="qms-card qms-kpi"><span>بالات</span><strong>{pallets.length}</strong></div>
        <div className="qms-card qms-kpi"><span>بانتظار الفحص</span><strong>{waiting}</strong></div>
        <div className="qms-card qms-kpi"><span>مقبول</span><strong>{accepted}</strong></div>
        <div className="qms-card qms-kpi"><span>مرفوض</span><strong>{rejected}</strong></div>
      </div>
    </QmsPage>
  );
};
