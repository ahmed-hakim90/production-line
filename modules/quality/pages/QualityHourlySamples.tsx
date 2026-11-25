import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { usePrintEngine } from '@/utils/printManager';
import { QualityHourlyPrint } from '../components/QualityPrintDocuments';
import { qualityRecordPrintAllowed, rowsMatchingTenant } from '../print/qualityPrintModel';
import { activeTenantId } from '../services/qualityGateway';
import { localDateIso } from '../domain/time';
import type { QualityDefectLine, QualityHourlySample, QualitySampleSlot } from '../model';
import { resolveRecordSector, type QualitySector } from '../domain/sector';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualitySampleService } from '../services/qualitySampleService';
import { qualitySettingsService } from '../services/qualitySettingsService';
import { inspectorOptions, useQualityAssignments } from '../hooks/useQualityAssignments';
import { MasterSelect, QmsPage, SectorSwitch, matchesSector, useQualityMasters } from '../qms/QmsChrome';

export const QualityHourlySamples: React.FC = () => {
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
  const [rows, setRows] = useState<QualityHourlySample[]>([]);
  const [slotKey, setSlotKey] = useState('');
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [inspectorId, setInspectorId] = useState('');
  const [sampleCount, setSampleCount] = useState(1);
  const [reasonId, setReasonId] = useState('');
  const [defectCount, setDefectCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [nextSlots, nextRows] = await Promise.all([
      qualitySettingsService.listSlots('hourly'),
      qualitySampleService.listHourly(date),
    ]);
    setSlots(nextSlots);
    setRows(nextRows.filter((row) => sector === 'all' || row.sector === sector));
  };
  useEffect(() => { void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر التحميل'))); }, [date, sector]);

  const save = async () => {
    const slot = slots.find((item) => item.slotKey === slotKey);
    const line = masters.lines.find((item) => item.id === lineId);
    const product = masters.products.find((item) => item.id === productId);
    const shift = masters.shifts.find((item) => item.id === shiftId);
    const inspector = masters.employees.find((item) => item.id === inspectorId);
    const reason = masters.reasons.find((item) => item.id === reasonId);
    if (!slot || !line || !product || !shift || !inspector) {
      toast.error('أكمل الفترة والخط والمنتج والوردية والمراقب.');
      return;
    }
    const defects: QualityDefectLine[] = defectCount > 0 && reason ? [{
      tenantId: '',
      reasonId: reason.id,
      reasonCode: reason.code,
      reasonLabel: reason.labelAr,
      count: defectCount,
    }] : [];
    setSaving(true);
    try {
      await qualitySampleService.saveHourly({
        date,
        slotKey: slot.slotKey,
        slotName: slot.slotName,
        lineId: line.id || '',
        lineName: line.name,
        productId: product.id || '',
        productName: product.name,
        shiftId: shift.id,
        shiftName: shift.name,
        inspectorEmployeeId: inspector.id || '',
        inspectorName: inspector.name,
        sampleCount,
        sector: resolveRecordSector(sector, masters.sectorOf('line', line.id || ''), masters.sectorOf('product', product.id || '')),
        defects,
      });
      toast.success('تم حفظ العينة');
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر الحفظ'));
    } finally {
      setSaving(false);
    }
  };

  const visibleLines = masters.lines.filter((line) => matchesSector(sector, masters.sectorOf('line', line.id || '')));
  const visibleProducts = masters.products.filter((product) => matchesSector(sector, masters.sectorOf('product', product.id || '')));

  return (
    <QmsPage title="استلام عينات بالساعة" subtitle="الفترات القياسية من 08:00 إلى 16:00 تُستخدم إلى أن تُحفظ فترات خاصة." actions={<SectorSwitch value={sector} onChange={setSector} />}>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">التاريخ</span><input className="qms-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <MasterSelect label="الفترة" value={slotKey} onChange={setSlotKey} placeholder="فترة السحب" options={slots.map((slot) => ({ value: slot.slotKey, label: slot.slotName }))} />
          <MasterSelect label="الخط" value={lineId} onChange={setLineId} placeholder="الخط" options={visibleLines.map((line) => ({ value: line.id || '', label: line.code ? `${line.name} (${line.code})` : line.name }))} />
          <MasterSelect label="المنتج" value={productId} onChange={setProductId} placeholder="المنتج" options={visibleProducts.map((product) => ({ value: product.id || '', label: product.code ? `${product.name} (${product.code})` : product.name }))} />
          <MasterSelect label="الوردية" value={shiftId} onChange={setShiftId} placeholder="الوردية" options={masters.shifts.map((shift) => ({ value: shift.id, label: shift.name }))} />
          <MasterSelect label="المراقب" value={inspectorId} onChange={setInspectorId} placeholder="مراقب معين" options={inspectorOptions(masters.employees, staff.assignments, { lineId })} />
          <label><span className="qms-label">العينات</span><input className="qms-input" type="number" min={1} value={sampleCount} onChange={(event) => setSampleCount(Number(event.target.value))} /></label>
          <MasterSelect label="سبب العيب" value={reasonId} onChange={setReasonId} placeholder="عند وجود عيب" options={masters.reasons.map((reason) => ({ value: reason.id, label: `${reason.labelAr} (${reason.code})` }))} />
          <label><span className="qms-label">عدد العيوب</span><input className="qms-input" type="number" min={0} value={defectCount} onChange={(event) => setDefectCount(Number(event.target.value))} /></label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !can('quality.samples.inspect')} onClick={() => void save()}>حفظ العينة</button>
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
              void qualitySampleService.withHourlyDefects(scoped).then((detailed) => {
                printDocument({
                  documentTitle: `عينات-ساعة-${date}`,
                  printSettings: printTemplate,
                  render: (ref) => <QualityHourlyPrint ref={ref} date={date} rows={detailed} printSettings={printTemplate} />,
                });
              }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تجهيز الطباعة')));
            }}
          >طباعة</button>
        ) : null}
        <table className="qms-table">
          <thead><tr><th>الفترة</th><th>الخط</th><th>المنتج</th><th>المراقب</th><th>العينات</th><th>العيوب</th><th>القرار</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.decision === 'مرفوض' ? 'qms-rejected' : undefined}>
                <td>{row.slotName}</td><td>{row.lineName}</td><td>{row.productName}</td><td>{row.inspectorName}</td><td>{row.sampleCount}</td><td>{row.defectCount}</td><td>{row.decision}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p>لا توجد عينات في هذا اليوم.</p> : null}
      </section>
    </QmsPage>
  );
};
