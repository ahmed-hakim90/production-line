import React, { useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { usePrintEngine } from '@/utils/printManager';
import { QualityFlowchartPrint } from '../components/QualityPrintDocuments';
import { qualityRecordPrintAllowed } from '../print/qualityPrintModel';
import { buildFlowchartMetrics } from '../domain/flowchart';
import { localDateIso } from '../domain/time';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityPalletService } from '../services/qualityPalletService';
import { qualityProductionQuery } from '../services/qualityProductionQuery';
import { qualitySampleService } from '../services/qualitySampleService';
import { QmsPage, useQualityMasters } from '../qms/QmsChrome';

export const QualityFlowchart: React.FC = () => {
  const masters = useQualityMasters();
  const permissions = useAppStore((state) => state.userPermissions);
  const printTemplate = useAppStore((state) => state.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();
  const canPrintChart = qualityRecordPrintAllowed(permissions, 'quality.reports.view');
  const [from, setFrom] = useState(localDateIso());
  const [to, setTo] = useState(localDateIso());
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<ReturnType<typeof buildFlowchartMetrics> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pallets, hourly, production] = await Promise.all([
        qualityPalletService.listByDateRange(from, to),
        qualitySampleService.listHourlyRange(from, to),
        qualityProductionQuery.quantitiesForRange(from, to),
      ]);
      const withDefects = await qualityPalletService.withDefects(pallets);
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
        hourly: hourly.map((row) => ({
          lineId: row.lineId,
          lineName: row.lineName,
          productName: row.productName,
          shiftId: row.shiftId,
          shiftName: row.shiftName,
          sampleCount: row.sampleCount,
          defectCount: row.defectCount,
        })),
        reportedProductionUnits: production.reduce((sum, row) => sum + row.quantityProduced, 0),
        lines: masters.lines.map((line) => ({ id: line.id || '', name: line.name })),
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
          <label><span className="qms-label">من</span><input className="qms-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label><span className="qms-label">إلى</span><input className="qms-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
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
            <p>أفضل خط: {metrics.best?.lineName || '—'} — أسوأ خط: {metrics.worst?.lineName || '—'}</p>
            <table className="qms-table">
              <thead><tr><th>الخط</th><th>المنتج</th><th>عينات</th><th>عيوب</th><th>المعدل</th><th>أبرز عيب</th></tr></thead>
              <tbody>
                {metrics.rankings.map((line) => (
                  <tr key={line.lineId}>
                    <td>{line.lineName}</td>
                    <td>{line.productName}</td>
                    <td>{line.inspected}</td>
                    <td>{line.defects}</td>
                    <td>{line.defectRate}%</td>
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
