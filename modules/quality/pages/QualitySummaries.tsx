import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { localDateIso } from '../domain/time';
import { reportedProductionQuantity } from '../domain/productionQuantity';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityPalletService } from '../services/qualityPalletService';
import { qualityProductionQuery } from '../services/qualityProductionQuery';
import { qualitySampleService } from '../services/qualitySampleService';
import { QmsPage } from '../qms/QmsChrome';
import type { QualityPallet, QualityLinePull } from '../model';

export const QualitySummaries: React.FC = () => {
  const [date, setDate] = useState(localDateIso());
  const [tab, setTab] = useState<'daily' | 'lines' | 'pulls'>('daily');
  const [pallets, setPallets] = useState<QualityPallet[]>([]);
  const [pulls, setPulls] = useState<QualityLinePull[]>([]);
  const [production, setProduction] = useState<Awaited<ReturnType<typeof qualityProductionQuery.quantitiesForDate>>>([]);

  useEffect(() => {
    Promise.all([
      qualityPalletService.listByDate(date),
      qualitySampleService.listPulls(date),
      qualityProductionQuery.quantitiesForDate(date),
    ]).then(([nextPallets, nextPulls, nextProduction]) => {
      setPallets(nextPallets);
      setPulls(nextPulls);
      setProduction(nextProduction);
    }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تحميل الملخص')));
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
                  <td>{row.startTime}–{row.endTime}</td><td>{row.lineName}</td><td>{row.productName}</td><td>{row.sampleCount}</td><td>{row.defectCount}</td><td>{row.status === 'completed' ? (row.palletRejected ? 'مرفوضة' : 'مقبولة') : 'قيد الفحص'}</td>
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
