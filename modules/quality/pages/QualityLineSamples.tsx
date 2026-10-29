import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { usePrintEngine } from '@/utils/printManager';
import { QualityLinePullPrint } from '../components/QualityPrintDocuments';
import { qualityRecordPrintAllowed, rowsMatchingTenant } from '../print/qualityPrintModel';
import { activeTenantId } from '../services/qualityGateway';
import { primaryInspectorSampleCount } from '../domain/samples';
import { localDateIso } from '../domain/time';
import type { QualityLinePull, QualitySampleSlot, QualityStation } from '../model';
import { resolveRecordSector, type QualitySector } from '../domain/sector';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualitySampleService } from '../services/qualitySampleService';
import { qualitySettingsService } from '../services/qualitySettingsService';
import { inspectorOptions, useQualityAssignments } from '../hooks/useQualityAssignments';
import { MasterSelect, QmsPage, SectorSwitch, matchesSector, useQualityMasters } from '../qms/QmsChrome';

export const QualityLineSamples: React.FC = () => {
  const { can } = usePermission();
  const permissions = useAppStore((state) => state.userPermissions);
  const printTemplate = useAppStore((state) => state.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();
  const canPrintSamples = qualityRecordPrintAllowed(permissions, 'quality.samples.view');
  const masters = useQualityMasters();
  const staff = useQualityAssignments();
  const [date, setDate] = useState(localDateIso());
  const [sector, setSector] = useState<QualitySector | 'all'>('all');
  const [slots, setSlots] = useState<QualitySampleSlot[]>([]);
  const [stations, setStations] = useState<QualityStation[]>([]);
  const [rows, setRows] = useState<QualityLinePull[]>([]);
  const [slotKey, setSlotKey] = useState('');
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [stationId, setStationId] = useState('');
  const [inspectorId, setInspectorId] = useState('');
  const [extraInspectorId, setExtraInspectorId] = useState('');
  const [sampleCount, setSampleCount] = useState(1);
  const [extraCount, setExtraCount] = useState(0);
  const [reasonId, setReasonId] = useState('');
  const [defectCount, setDefectCount] = useState(0);
  const [activeId, setActiveId] = useState('');
  const [stopped, setStopped] = useState(false);
  const [noSampleReason, setNoSampleReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [nextSlots, nextStations, nextRows] = await Promise.all([
      qualitySettingsService.listSlots('line'),
      qualitySettingsService.listStations(),
      qualitySampleService.listPulls(date),
    ]);
    setSlots(nextSlots);
    setStations(nextStations);
    setRows(nextRows.filter((row) => sector === 'all' || row.sector === sector));
  };
  useEffect(() => { void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر التحميل'))); }, [date, sector]);

  const create = async () => {
    const slot = slots.find((item) => item.slotKey === slotKey);
    const line = masters.lines.find((item) => item.id === lineId);
    const product = masters.products.find((item) => item.id === productId);
    const station = stations.find((item) => item.id === stationId);
    const inspector = masters.employees.find((item) => item.id === inspectorId);
    const extra = masters.employees.find((item) => item.id === extraInspectorId);
    if (!slot || !line || !product || !station || !inspector) {
      toast.error(stations.length === 0 ? 'أضف محطة فحص من الإعدادات أولاً.' : 'أكمل بيانات السحبة.');
      return;
    }
    setSaving(true);
    try {
      await qualitySampleService.createPull({
        date,
        slotKey: slot.slotKey,
        startTime: slot.startTime,
        endTime: slot.endTime,
        lineId: line.id || '',
        lineName: line.name,
        productId: product.id || '',
        productName: product.name,
        stationId: station.id,
        stationName: station.name,
        inspectorEmployeeId: inspector.id || '',
        inspectorName: inspector.name,
        additionalInspectorEmployeeId: extra?.id,
        additionalInspectorName: extra?.name,
        additionalSampleCount: extraCount,
        sampleCount,
        sector: resolveRecordSector(sector, masters.sectorOf('line', line.id || ''), masters.sectorOf('product', product.id || '')),
        lineSector: masters.sectorOf('line', line.id || ''),
        productSector: masters.sectorOf('product', product.id || ''),
      });
      if (stopped || noSampleReason.trim()) {
        await qualitySampleService.savePeriodStatus({
          date,
          slotKey: slot.slotKey,
          lineId: line.id || '',
          isStopped: stopped,
          noSampleReason,
        });
      }
      toast.success('تم تسجيل السحبة');
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر الحفظ'));
    } finally {
      setSaving(false);
    }
  };

  const active = rows.find((row) => row.id === activeId);
  const visibleLines = masters.lines.filter((line) => matchesSector(sector, masters.sectorOf('line', line.id || '')));
  const visibleProducts = masters.products.filter((product) => matchesSector(sector, masters.sectorOf('product', product.id || '')));

  return (
    <QmsPage title="سحب عينات للخطوط" subtitle="إجمالي العينات ثابت. نصيب المراقب الأساسي = الإجمالي − عينات المراقب الإضافي." actions={<SectorSwitch value={sector} onChange={setSector} />}>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">التاريخ</span><input className="qms-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <MasterSelect label="الفترة" value={slotKey} onChange={setSlotKey} placeholder="الفترة" options={slots.map((slot) => ({ value: slot.slotKey, label: `${slot.startTime}–${slot.endTime}` }))} />
          <MasterSelect label="الخط" value={lineId} onChange={setLineId} placeholder="الخط" options={visibleLines.map((line) => ({ value: line.id || '', label: line.code ? `${line.name} (${line.code})` : line.name }))} />
          <MasterSelect label="المنتج" value={productId} onChange={setProductId} placeholder="المنتج" options={visibleProducts.map((product) => ({ value: product.id || '', label: product.code ? `${product.name} (${product.code})` : product.name }))} />
          <MasterSelect label="المحطة" value={stationId} onChange={(value) => {
            setStationId(value);
            const station = stations.find((item) => item.id === value);
            const allowed = inspectorOptions(masters.employees, staff.assignments, { lineId, stationId: value });
            if (station?.defaultInspectorEmployeeId && allowed.some((item) => item.value === station.defaultInspectorEmployeeId)) {
              setInspectorId(station.defaultInspectorEmployeeId);
            }
          }} placeholder="المحطة" options={stations.map((station) => ({ value: station.id, label: station.name }))} />
          <MasterSelect label="المراقب" value={inspectorId} onChange={setInspectorId} placeholder="مراقب معين" options={inspectorOptions(masters.employees, staff.assignments, { lineId, stationId })} />
          <MasterSelect label="مراقب إضافي" value={extraInspectorId} onChange={setExtraInspectorId} placeholder="اختياري" options={inspectorOptions(masters.employees, staff.assignments, { lineId, stationId })} />
          <label><span className="qms-label">إجمالي العينات</span><input className="qms-input" type="number" min={1} value={sampleCount} onChange={(event) => setSampleCount(Number(event.target.value))} /></label>
          <label><span className="qms-label">عينات الإضافي</span><input className="qms-input" type="number" min={0} value={extraCount} onChange={(event) => setExtraCount(Number(event.target.value))} /></label>
          <p className="qms-muted">نصيب الأساسي: {primaryInspectorSampleCount(sampleCount, extraCount)}</p>
          <label className="qms-row"><input type="checkbox" checked={stopped} onChange={(event) => setStopped(event.target.checked)} /> الخط متوقف</label>
          <label><span className="qms-label">سبب عدم السحب</span><input className="qms-input" value={noSampleReason} onChange={(event) => setNoSampleReason(event.target.value)} /></label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !can('quality.samples.inspect')} onClick={() => void create()}>تسجيل السحبة</button>
        </div>
      </section>
      <section className="qms-card">
        {canPrintSamples ? (
          <button
            type="button"
            className="qms-btn qms-btn-ghost"
            disabled={rows.length === 0}
            onClick={() => {
              const scoped = rowsMatchingTenant(rows, activeTenantId());
              if (scoped.length === 0) return;
              void Promise.all([
                qualitySampleService.withPullDefects(scoped),
                qualitySampleService.listPeriodStatuses(date),
              ]).then(([detailed, periods]) => {
                const lineNames = Object.fromEntries(masters.lines.map((line) => [line.id || '', line.name]));
                printDocument({
                  documentTitle: `سحب-خطوط-${date}`,
                  printSettings: printTemplate,
                  render: (ref) => (
                    <QualityLinePullPrint
                      ref={ref}
                      date={date}
                      rows={detailed}
                      periods={rowsMatchingTenant(periods, activeTenantId())}
                      lineNames={lineNames}
                      printSettings={printTemplate}
                    />
                  ),
                });
              }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تجهيز الطباعة')));
            }}
          >طباعة</button>
        ) : null}
        <table className="qms-table">
          <thead><tr><th>الفترة</th><th>الخط</th><th>المحطة</th><th>المراقب</th><th>العينات</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.palletRejected ? 'qms-rejected' : undefined}>
                <td>{row.startTime}–{row.endTime}</td>
                <td>{row.lineName}</td>
                <td>{row.stationName}</td>
                <td>{row.inspectorName}{row.additionalInspectorName ? ` + ${row.additionalInspectorName} (${row.additionalSampleCount})` : ''}</td>
                <td>{row.sampleCount}</td>
                <td>{row.status === 'completed' ? (row.palletRejected ? 'مرفوضة' : 'مقبولة') : 'قيد الفحص'}</td>
                <td><button type="button" className="qms-btn qms-btn-ghost" onClick={() => setActiveId(row.id)}>فتح</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {active && active.status !== 'completed' && can('quality.samples.inspect') ? (
          <div className="qms-row" style={{ marginTop: 12 }}>
            <MasterSelect label="سبب العيب" value={reasonId} onChange={setReasonId} placeholder="سبب" options={masters.reasons.map((reason) => ({ value: reason.id, label: `${reason.labelAr} (${reason.code})` }))} />
            <label><span className="qms-label">العدد</span><input className="qms-input" type="number" min={0} value={defectCount} onChange={(event) => setDefectCount(Number(event.target.value))} /></label>
            <button type="button" className="qms-btn qms-btn-dark" disabled={saving} onClick={() => void qualitySampleService.completePull(active.id, {
              palletRejected: false,
              defects: defectCount > 0 && reasonId ? [{ tenantId: '', reasonId, reasonCode: masters.reasons.find((item) => item.id === reasonId)?.code || '', reasonLabel: masters.reasons.find((item) => item.id === reasonId)?.labelAr || '', count: defectCount }] : [],
            }).then(() => { toast.success('تم قبول السحبة'); return load(); }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الحفظ')))}>قبول البالتة</button>
            <button type="button" className="qms-btn qms-btn-primary" disabled={saving} onClick={() => void qualitySampleService.completePull(active.id, {
              palletRejected: true,
              defects: defectCount > 0 && reasonId ? [{ tenantId: '', reasonId, reasonCode: masters.reasons.find((item) => item.id === reasonId)?.code || '', reasonLabel: masters.reasons.find((item) => item.id === reasonId)?.labelAr || '', count: defectCount }] : [],
            }).then(() => { toast.success('تم رفض السحبة'); return load(); }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر الحفظ')))}>رفض البالتة</button>
          </div>
        ) : null}
        {active && active.status === 'completed' && can('quality.records.reopen') ? (
          <div className="qms-row" style={{ marginTop: 12 }}>
            <input className="qms-input" placeholder="سبب إعادة الفتح" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} />
            <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void qualitySampleService.reopenPull(active.id, reopenReason).then(() => load()).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر إعادة الفتح')))}>إعادة فتح</button>
          </div>
        ) : null}
      </section>
    </QmsPage>
  );
};
