import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { usePrintEngine } from '@/utils/printManager';
import { QualityScrapPrint } from '../components/QualityPrintDocuments';
import { scrapCauseShares } from '../domain/scrap';
import { qualityRecordPrintAllowed, rowsMatchingTenant, scrapReasonCode } from '../print/qualityPrintModel';
import { activeTenantId } from '../services/qualityGateway';
import { localDateIso } from '../domain/time';
import type { QualityScrapReport } from '../model';
import type { QualitySector } from '../domain/sector';
import { qualityUserMessage } from '../services/qualityGateway';
import { HourlyScrapForm } from '../components/HourlyScrapForm';
import { QualityNameCatalog } from '../components/QualityNameCatalog';
import { QualityScrapAnalysis } from './QualityScrapAnalysis';
import type { QualityNamedReason } from '../model';
import { qualityScrapReasonService } from '../services/qualityCatalogService';
import { qualityScrapService } from '../services/qualitySecondSortService';
import { MasterSelect, QmsPage, SectorSwitch, useQualityMasters } from '../qms/QmsChrome';

export const QualityScrap: React.FC = () => {
  const { can } = usePermission();
  const permissions = useAppStore((state) => state.userPermissions);
  const printTemplate = useAppStore((state) => state.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();
  const canPrintScrap = qualityRecordPrintAllowed(permissions, 'quality.scrap.view');
  const masters = useQualityMasters();
  const [rows, setRows] = useState<QualityScrapReport[]>([]);
  const [reasons, setReasons] = useState<QualityNamedReason[]>([]);
  const [date, setDate] = useState(localDateIso());
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [reasonId, setReasonId] = useState('');
  const [slotName, setSlotName] = useState('');
  const [sector, setSector] = useState<QualitySector | ''>('');
  const [productionSupervisorName, setProductionSupervisorName] = useState('');
  const [qualitySupervisorName, setQualitySupervisorName] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'manual' | 'hourly' | 'analysis'>('manual');
  const shares = scrapCauseShares(rows.flatMap((row) => row.periods && row.periods.length > 0
    ? row.periods.map((period) => ({ reasonLabel: period.reasonLabel, quantity: period.quantity }))
    : [{ reasonLabel: row.reasonLabel, quantity: row.quantity }]));

  const load = async () => {
    const [reports, catalog] = await Promise.all([
      qualityScrapService.list(date),
      qualityScrapReasonService.list(),
    ]);
    setRows(reports);
    setReasons(catalog);
  };
  useEffect(() => { void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر التحميل'))); }, [date]);

  return (
    <QmsPage title="الهالك" subtitle="أسباب الهالك قائمة مستقلة عن عيوب الفحص. الكمية هنا كمية هالك وليست كمية إنتاج." actions={<SectorSwitch value={sector || 'all'} onChange={(value) => setSector(value === 'all' ? '' : value)} />}>
      <div className="qms-row" style={{ marginBottom: 12 }}>
        <label><span className="qms-label">التاريخ</span><input className="qms-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {canPrintScrap ? (
          <button
            type="button"
            className="qms-btn qms-btn-ghost"
            disabled={rows.length === 0}
            onClick={() => {
              const scoped = rowsMatchingTenant(rows, activeTenantId());
              if (scoped.length === 0) return;
              printDocument({
                documentTitle: `هالك-${date}`,
                printSettings: printTemplate,
                render: (ref) => (
                  <QualityScrapPrint
                    ref={ref}
                    date={date}
                    printSettings={printTemplate}
                    rows={scoped.map((row) => ({
                      id: row.id,
                      reportDate: row.reportDate,
                      lineName: row.lineName,
                      productName: row.productName,
                      reasonLabel: row.periods && row.periods.length > 0
                        ? row.periods.map((period) => `${period.slotName} ${period.reasonLabel} ${period.quantity}`).join(' | ')
                        : row.reasonLabel,
                      reasonCode: scrapReasonCode(row.reasonId, masters.reasons),
                      quantity: row.quantity,
                      slotName: row.slotName || '',
                    }))}
                  />
                ),
              });
            }}
          >طباعة</button>
        ) : null}
      </div>
      <div className="qms-row" style={{ marginBottom: 12 }}>
        <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setMode('manual')}>تسجيل يدوي</button>
        <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setMode('hourly')}>جدول ساعي</button>
        <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setMode('analysis')}>تحليل الشهر</button>
      </div>
      {mode !== 'analysis' ? (
        <div className="qms-row" style={{ marginBottom: 12 }}>
          <MasterSelect label="الخط" value={lineId} onChange={setLineId} placeholder="الخط" options={masters.lines.map((line) => ({ value: line.id || '', label: line.code ? `${line.name} (${line.code})` : line.name }))} />
          <MasterSelect label="المنتج" value={productId} onChange={setProductId} placeholder="المنتج" options={masters.products.map((product) => ({ value: product.id || '', label: product.code ? `${product.name} (${product.code})` : product.name }))} />
          <label><span className="qms-label">مشرف الخط</span><input className="qms-input" maxLength={150} value={productionSupervisorName} onChange={(event) => setProductionSupervisorName(event.target.value)} /></label>
          <label><span className="qms-label">مشرف الجودة</span><input className="qms-input" maxLength={150} value={qualitySupervisorName} onChange={(event) => setQualitySupervisorName(event.target.value)} /></label>
          <label><span className="qms-label">التوصية</span><input className="qms-input" maxLength={1000} value={recommendation} onChange={(event) => setRecommendation(event.target.value)} /></label>
        </div>
      ) : null}
      {mode === 'analysis' ? <QualityScrapAnalysis /> : null}
      {mode === 'hourly' ? (
        <HourlyScrapForm
          date={date}
          sector={sector}
          lineId={lineId}
          lineName={masters.lines.find((line) => line.id === lineId)?.name || ''}
          productId={productId}
          productName={masters.products.find((product) => product.id === productId)?.name || ''}
          reasons={reasons}
          canSave={can('quality.scrap.manage')}
          productionSupervisorName={productionSupervisorName}
          qualitySupervisorName={qualitySupervisorName}
          recommendation={recommendation}
          onSaved={load}
        />
      ) : null}
      {mode === 'manual' ? (
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">الكمية</span><input className="qms-input" type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          <MasterSelect label="سبب الهالك" value={reasonId} onChange={setReasonId} placeholder="من قائمة الهالك" options={reasons.map((reason) => ({ value: reason.id, label: reason.name }))} />
          <label><span className="qms-label">الفترة</span><input className="qms-input" value={slotName} onChange={(event) => setSlotName(event.target.value)} placeholder="اختياري" /></label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !can('quality.scrap.manage')} onClick={() => {
            const line = masters.lines.find((item) => item.id === lineId);
            const product = masters.products.find((item) => item.id === productId);
            const reason = reasons.find((item) => item.id === reasonId);
            if (!line || !product || !reason || !sector) { toast.error('اختر الخط والمنتج وسبب الهالك وقطاع الجودة'); return; }
            setSaving(true);
            void qualityScrapService.save({
              reportDate: date,
              reportType: 'manual',
              lineId: line.id || '',
              lineName: line.name,
              productId: product.id || '',
              productName: product.name,
              sector,
              quantity,
              reasonId: reason.id,
              reasonLabel: reason.name,
              slotName,
              productionSupervisorName,
              qualitySupervisorName,
              recommendation,
            }).then(async () => {
              toast.success('تم حفظ الهالك');
              await load();
            }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الحفظ')))
              .finally(() => setSaving(false));
          }}>حفظ</button>
        </div>
      </section>
      ) : null}
      <section className="qms-card">
        <table className="qms-table">
          <thead><tr><th>الخط</th><th>المنتج</th><th>السبب</th><th>الكمية</th><th>الفترة</th><th>مشرف الخط</th><th>مشرف الجودة</th><th>التوصية</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.lineName}</td><td>{row.productName}</td><td>{row.reportType === 'hourly' ? 'جدول ساعي' : row.reasonLabel}</td><td>{row.quantity}</td><td>{row.reportType === 'hourly' ? 'ساعي' : (row.slotName || '—')}</td>
                <td>{row.productionSupervisorName || '—'}</td><td>{row.qualitySupervisorName || '—'}</td><td>{row.recommendation || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p>لا توجد تقارير هالك لهذا اليوم.</p> : null}
        {shares.length > 0 ? (
          <table className="qms-table">
            <thead><tr><th>سبب الهالك</th><th>الكمية</th><th>النسبة</th></tr></thead>
            <tbody>
              {shares.map((share) => (
                <tr key={share.reasonLabel}><td>{share.reasonLabel}</td><td>{share.quantity}</td><td>{(share.share * 100).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}٪</td></tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
      <QualityNameCatalog
        title="أسباب الهالك"
        placeholder="اكتب سبب الهالك الجديد"
        names={reasons}
        canManage={can('quality.scrap.manage')}
        onCreate={(name) => qualityScrapReasonService.create(name).then(load)}
        onRename={(id, name) => qualityScrapReasonService.rename(id, name).then(load)}
        onRemove={(id) => qualityScrapReasonService.remove(id).then(load)}
      />
    </QmsPage>
  );
};
