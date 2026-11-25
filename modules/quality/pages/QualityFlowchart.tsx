import React, { useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { usePrintEngine } from '@/utils/printManager';
import { QualityFlowchartPrint } from '../components/QualityPrintDocuments';
import { qualityRecordPrintAllowed } from '../print/qualityPrintModel';
import { buildFlowchartMetrics } from '../domain/flowchart';
import { monthBounds } from '../domain/qualityAnalytics';
import { localDateIso } from '../domain/time';
import type { QualitySector } from '../domain/sector';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityPalletService } from '../services/qualityPalletService';
import { qualityProductionQuery } from '../services/qualityProductionQuery';
import { qualitySampleService } from '../services/qualitySampleService';
import { MasterSelect, QmsPage, matchesSector, useQualityMasters } from '../qms/QmsChrome';

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export const QualityFlowchart: React.FC = () => {
  const masters = useQualityMasters();
  const permissions = useAppStore((state) => state.userPermissions);
  const printTemplate = useAppStore((state) => state.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();
  const canPrintChart = qualityRecordPrintAllowed(permissions, 'quality.reports.view');
  const [from, setFrom] = useState(localDateIso());
  const [to, setTo] = useState(localDateIso());
  const [preset, setPreset] = useState('today');
  const [sector, setSector] = useState<QualitySector | 'all'>('all');
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<ReturnType<typeof buildFlowchartMetrics> | null>(null);

  const load = async (rangeFrom = from, rangeTo = to) => {
    setLoading(true);
    try {
      const [pallets, hourly, production] = await Promise.all([
        qualityPalletService.listByDateRange(rangeFrom, rangeTo),
        qualitySampleService.listHourlyRange(rangeFrom, rangeTo),
        qualityProductionQuery.quantitiesForRange(rangeFrom, rangeTo),
      ]);
      const allowed = (row: { lineId: string; productId: string; sector?: QualitySector }) => {
        if (lineId && row.lineId !== lineId) return false;
        if (productId && row.productId !== productId) return false;
        if (sector !== 'all' && row.sector && row.sector !== sector) return false;
        if (sector !== 'all' && !matchesSector(sector, masters.sectorOf('line', row.lineId))) return false;
        return true;
      };
      const scopedPallets = pallets.filter(allowed);
      const scopedHourly = hourly.filter(allowed);
      const scopedProduction = production.filter((row) => allowed({ ...row, sector: masters.sectorOf('line', row.lineId) || undefined }));
      const withDefects = await qualityPalletService.withDefects(scopedPallets);
      const lines = masters.lines.filter((line) => (!lineId || line.id === lineId) && matchesSector(sector, masters.sectorOf('line', line.id || '')));
      setMetrics(buildFlowchartMetrics({
        pallets: withDefects.map((row) => ({
          lineId: row.lineId,
          lineName: row.lineName,
          productName: row.productName,
          shiftId: row.shiftId,
          shiftName: row.shiftName,
          quantityOnPallet: row.quantityOnPallet,
          inspectedQuantity: row.inspectedQuantity,
          rejectedQuantity: row.rejectedQuantity,
          palletDecision: row.palletDecision,
          defects: row.defects,
        })),
        hourly: scopedHourly.map((row) => ({
          lineId: row.lineId,
          lineName: row.lineName,
          productName: row.productName,
          shiftId: row.shiftId,
          shiftName: row.shiftName,
          sampleCount: row.sampleCount,
          defectCount: row.defectCount,
        })),
        reportedProductionUnits: scopedProduction.reduce((sum, row) => sum + row.quantityProduced, 0),
        lines: lines.map((line) => ({ id: line.id || '', name: line.name })),
      }));
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر تحميل مخطط الجودة'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <QmsPage title="مخطط الجودة" subtitle="ترتيب الخطوط حسب معدل العيب من فحص البالتات وعينات الساعة. كمية البالتة لا تُجمع مع كمية الإنتاج المسجلة.">
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">الفترة</span>
            <select className="qms-input" value={preset} onChange={(event) => {
              const next = event.target.value;
              const today = localDateIso();
              setPreset(next);
              if (next === 'custom') return;
              const bounds = next === 'month' ? monthBounds(today.slice(0, 7)) : null;
              const nextFrom = next === 'yesterday' ? shiftIso(today, -1) : next === 'last7' ? shiftIso(today, -6) : bounds?.from || today;
              const nextTo = next === 'yesterday' ? shiftIso(today, -1) : bounds?.to || today;
              setFrom(nextFrom);
              setTo(nextTo);
            }}>
              <option value="today">اليوم</option>
              <option value="yesterday">أمس</option>
              <option value="last7">آخر 7 أيام</option>
              <option value="month">هذا الشهر</option>
              <option value="custom">نطاق مخصص</option>
            </select>
          </label>
          <label><span className="qms-label">من</span><input className="qms-input" type="date" value={from} onChange={(event) => { setPreset('custom'); setFrom(event.target.value); }} /></label>
          <label><span className="qms-label">إلى</span><input className="qms-input" type="date" value={to} onChange={(event) => { setPreset('custom'); setTo(event.target.value); }} /></label>
          <label><span className="qms-label">القطاع</span>
            <select className="qms-input" value={sector} onChange={(event) => setSector(event.target.value as QualitySector | 'all')}>
              <option value="all">كل القطاعات</option>
              <option value="home">الأجهزة المنزلية</option>
              <option value="seria">السريا</option>
            </select>
          </label>
          <MasterSelect label="الخط" value={lineId} onChange={setLineId} placeholder="كل الخطوط" options={[{ value: '', label: 'كل الخطوط' }, ...masters.lines.filter((line) => matchesSector(sector, masters.sectorOf('line', line.id || ''))).map((line) => ({ value: line.id || '', label: line.name }))]} />
          <MasterSelect label="المنتج" value={productId} onChange={setProductId} placeholder="كل المنتجات" options={[{ value: '', label: 'كل المنتجات' }, ...masters.products.filter((product) => matchesSector(sector, masters.sectorOf('product', product.id || ''))).map((product) => ({ value: product.id || '', label: product.name }))]} />
          <button type="button" className="qms-btn qms-btn-primary" disabled={loading} onClick={() => void load()}>عرض المخطط</button>
          {canPrintChart ? (
            <button
              type="button"
              className="qms-btn qms-btn-ghost"
              disabled={!metrics}
              onClick={() => {
                if (!metrics) return;
                printDocument({
                  documentTitle: `مخطط-الجودة-${from}`,
                  printSettings: printTemplate,
                  render: (ref) => (
                    <QualityFlowchartPrint
                      ref={ref}
                      from={from}
                      to={to}
                      reportedProductionUnits={metrics.reportedProductionUnits}
                      lotUnits={metrics.lotUnits}
                      inspected={metrics.inspected}
                      defects={metrics.defects}
                      defectRate={metrics.defectRate}
                      acceptedPallets={metrics.acceptedPallets}
                      rejectedPallets={metrics.rejectedPallets}
                      bestName={metrics.best?.lineName || ''}
                      worstName={metrics.worst?.lineName || ''}
                      rankings={metrics.rankings}
                      pareto={metrics.pareto}
                      printSettings={printTemplate}
                    />
                  ),
                });
              }}
            >طباعة</button>
          ) : null}
        </div>
        <p className="qms-muted">النطاق 31 يوماً. الإنتاج الظاهر من تقارير الإنتاج. العينات والعيوب من البالتات والعينات الساعية فقط.</p>
      </section>
      {metrics ? (
        <>
          <div className="qms-kpis" style={{ marginBottom: 12 }}>
            <div className="qms-card qms-kpi"><span>إنتاج مسجل</span><strong>{metrics.reportedProductionUnits}</strong></div>
            <div className="qms-card qms-kpi"><span>وحدات الدفعات</span><strong>{metrics.lotUnits}</strong></div>
            <div className="qms-card qms-kpi"><span>عينات مفحوصة</span><strong>{metrics.inspected}</strong></div>
            <div className="qms-card qms-kpi"><span>عيوب</span><strong>{metrics.defects}</strong></div>
            <div className="qms-card qms-kpi"><span>معدل العيب</span><strong>{metrics.defectRate}%</strong></div>
            <div className="qms-card qms-kpi"><span>مقبول / مرفوض</span><strong>{metrics.acceptedPallets} / {metrics.rejectedPallets}</strong></div>
          </div>
          <section className="qms-card" style={{ marginBottom: 12 }}>
            <p>أفضل خط: {metrics.best ? `${metrics.best.lineName} — ${metrics.best.productName} — عيوب ${metrics.best.defectRate}% — قبول ${metrics.best.acceptRate}%` : '—'}</p>
            <p>أسوأ خط: {metrics.worst ? `${metrics.worst.lineName} — ${metrics.worst.productName} — عيوب ${metrics.worst.defectRate}% — قبول ${metrics.worst.acceptRate}%` : '—'}</p>
            <table className="qms-table">
              <thead><tr><th>الخط</th><th>المنتج</th><th>عينات</th><th>عيوب</th><th>معدل العيب</th><th>نسبة القبول</th><th>أبرز عيب</th></tr></thead>
              <tbody>
                {metrics.rankings.map((line) => (
                  <tr key={line.lineId}>
                    <td>{line.lineName}</td>
                    <td>{line.productName}</td>
                    <td>{line.inspected}</td>
                    <td>{line.defects}</td>
                    <td>{line.defectRate}%</td>
                    <td>{line.acceptRate}%</td>
                    <td>{line.topDefect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="qms-card">
            <h2 className="qms-title">أكثر العيوب</h2>
            {metrics.pareto.length === 0 ? <p>لا توجد عيوب مسجلة في النطاق.</p> : (
              <ul>{metrics.pareto.map((item) => <li key={item.reasonLabel}>{item.reasonLabel}: {item.count}</li>)}</ul>
            )}
          </section>
        </>
      ) : null}
    </QmsPage>
  );
};
