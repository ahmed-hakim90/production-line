import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { usePrintEngine } from '@/utils/printManager';
import { QualityHourlyPrint } from '../components/QualityPrintDocuments';
import { qualityRecordPrintAllowed, rowsMatchingTenant } from '../print/qualityPrintModel';
import { activeTenantId } from '../services/qualityGateway';
import { hourlyDefectRate, hourlyDefectText, hourlyInspectorSummary, hourlyProductionMatch, hourlySampleTotals } from '../domain/samples';
import { localDateIso } from '../domain/time';
import type { ProductionQuantityRow } from '../domain/productionQuantity';
import type { QualityDefectLine, QualityHourlySample, QualitySampleSlot } from '../model';
import { resolveRecordSector, type QualitySector } from '../domain/sector';
import { qualityUserMessage } from '../services/qualityGateway';
import { qualityProductionQuery } from '../services/qualityProductionQuery';
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
  const [detailedRows, setDetailedRows] = useState<QualityHourlySample[] | null>(null);
  const [production, setProduction] = useState<ProductionQuantityRow[] | null | undefined>(undefined);
  const [filterLineId, setFilterLineId] = useState('');
  const [filterProductId, setFilterProductId] = useState('');
  const [filterShiftId, setFilterShiftId] = useState('');
  const [slotKey, setSlotKey] = useState('');
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [inspectorId, setInspectorId] = useState('');
  const [sampleCount, setSampleCount] = useState(1);
  const [reasonId, setReasonId] = useState('');
  const [defectCount, setDefectCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const canReadProduction = can('quality.reports.view');
  const load = async () => {
    setProduction(canReadProduction ? undefined : null);
    const [nextSlots, nextRows, nextProduction] = await Promise.all([
      qualitySettingsService.listSlots('hourly'),
      qualitySampleService.listHourly(date),
      canReadProduction
        ? qualityProductionQuery.quantitiesForDate(date).catch((error: unknown) => {
          toast.error(qualityUserMessage(error, 'تعذر تحميل إنتاج اليوم'));
          return null;
        })
        : Promise.resolve(null),
    ]);
    setSlots(nextSlots);
    setRows(nextRows.filter((row) => sector === 'all' || row.sector === sector));
    setProduction(nextProduction);
  };
  useEffect(() => { void load().catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر التحميل'))); }, [date, sector, canReadProduction]);

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
  const visibleRows = rows.filter((row) => (
    (!filterLineId || row.lineId === filterLineId)
    && (!filterProductId || row.productId === filterProductId)
    && (!filterShiftId || row.shiftId === filterShiftId)
  ));
  useEffect(() => {
    const scoped = rows.filter((row) => (
      (!filterLineId || row.lineId === filterLineId)
      && (!filterProductId || row.productId === filterProductId)
      && (!filterShiftId || row.shiftId === filterShiftId)
    ));
    if (scoped.length === 0) {
      setDetailedRows([]);
      return;
    }
    let cancelled = false;
    void qualitySampleService.withHourlyDefects(scoped).then((detailed) => {
      if (!cancelled) setDetailedRows(detailed);
    }).catch((error: unknown) => {
      if (cancelled) return;
      toast.error(qualityUserMessage(error, 'تعذر تحميل عيوب الساعة'));
      setDetailedRows(scoped);
    });
    return () => { cancelled = true; };
  }, [rows, filterLineId, filterProductId, filterShiftId]);
  const totals = hourlySampleTotals(visibleRows);
  const inspectorBoards = hourlyInspectorSummary(detailedRows ?? visibleRows);
  const namedProduction = (production || []).filter((row) => {
    if (filterLineId && row.lineId !== filterLineId) return false;
    if (filterProductId && row.productId !== filterProductId) return false;
    return matchesSector(sector, masters.sectorOf('line', row.lineId));
  }).map((row) => ({
    ...row,
    lineName: masters.lines.find((line) => line.id === row.lineId)?.name || 'خط غير معروف',
    productName: row.productName || masters.products.find((product) => product.id === row.productId)?.name || 'منتج غير معروف',
  }));
  const productionMatch = hourlyProductionMatch({
    production: namedProduction,
    samples: rows.filter((row) => (!filterLineId || row.lineId === filterLineId) && (!filterProductId || row.productId === filterProductId)),
  });

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
      <div className="qms-kpis" style={{ marginBottom: 12 }}>
        <div className="qms-card qms-kpi"><span>سحبات اليوم</span><strong>{totals.pulls}</strong></div>
        <div className="qms-card qms-kpi"><span>العينات المفحوصة</span><strong>{totals.samples}</strong></div>
        <div className="qms-card qms-kpi"><span>عيوب الساعة</span><strong>{totals.defects}</strong></div>
        <div className="qms-card qms-kpi"><span>نسبة العيوب</span><strong>{totals.defectRate}٪</strong></div>
      </div>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-label">مطابقة إنتاج اليوم مع عينات الساعة</h2>
        <p className="qms-muted">الكمية من تقارير الإنتاج لليوم كامل، وغير مقسومة على الوردية. معدل الجودة التقديري = (الإنتاج − عيوب عينات الساعة) ÷ الإنتاج.</p>
        {!canReadProduction ? <p>إنتاج اليوم غير متاح لهذه الصلاحية.</p> : production === undefined ? <p>جارٍ تحميل إنتاج اليوم.</p> : production == null ? <p>تعذر تحميل إنتاج اليوم.</p> : productionMatch.length === 0 ? <p>لا يوجد إنتاج مسجل في تقارير الإنتاج لهذا اليوم.</p> : (
          <table className="qms-table">
            <thead><tr><th>الخط</th><th>المنتج</th><th>الإنتاج المسجل</th><th>عينات الساعة</th><th>عيوب الساعة</th><th>معدل الجودة التقديري</th></tr></thead>
            <tbody>
              {productionMatch.map((row) => (
                <tr key={`${row.lineId}:${row.productId}`}>
                  <td>{row.lineName}</td><td>{row.productName}</td><td>{row.produced}</td><td>{row.samples}</td><td>{row.defects}</td><td>{row.estimatedQualityRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="qms-card">
        <div className="qms-row">
          <MasterSelect label="تصفية الخط" value={filterLineId} onChange={setFilterLineId} placeholder="كل الخطوط" options={visibleLines.map((line) => ({ value: line.id || '', label: line.name }))} />
          <MasterSelect label="تصفية المنتج" value={filterProductId} onChange={setFilterProductId} placeholder="كل المنتجات" options={visibleProducts.map((product) => ({ value: product.id || '', label: product.name }))} />
          <MasterSelect label="تصفية الوردية" value={filterShiftId} onChange={setFilterShiftId} placeholder="كل الورديات" options={masters.shifts.map((shift) => ({ value: shift.id, label: shift.name }))} />
        </div>
        {canPrintSamples ? (
          <button
            type="button"
            className="qms-btn qms-btn-ghost"
            disabled={visibleRows.length === 0}
            onClick={() => {
              const scoped = rowsMatchingTenant(visibleRows, activeTenantId());
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
          <thead><tr><th>الفترة</th><th>الخط</th><th>المنتج</th><th>الوردية</th><th>المراقب</th><th>العينات</th><th>العيوب</th><th>النسبة</th><th>الأسباب</th><th>القرار</th></tr></thead>
          <tbody>
            {visibleRows.map((row) => {
              const detailed = (detailedRows || []).find((item) => item.id === row.id) || row;
              const rate = hourlyDefectRate(row.sampleCount, row.defectCount);
              return (
                <tr key={row.id} className={row.decision === 'مرفوض' ? 'qms-rejected' : undefined}>
                  <td>{row.slotName}</td>
                  <td>{row.lineName}</td>
                  <td>{row.productName}</td>
                  <td>{row.shiftName || '—'}</td>
                  <td>{row.inspectorName}</td>
                  <td>{row.sampleCount}</td>
                  <td>{row.defectCount}</td>
                  <td className={rate > 5 ? 'qms-rejected' : undefined}>{rate}٪</td>
                  <td>{hourlyDefectText(detailed.defects)}</td>
                  <td>{row.decision}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleRows.length === 0 ? <p>{rows.length === 0 ? 'لا توجد عينات في هذا اليوم.' : 'لا توجد عينات لهذه التصفية.'}</p> : null}
      </section>
      <section className="qms-card" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: '0.95rem' }}>ملخص فحص المراقبين</h2>
        <p className="qms-muted">يتبع تصفية السجل. إجمالي المراقب هو مجموع عيناته في نفس الفترة.</p>
        {inspectorBoards.length === 0 ? <p>لا توجد عينات لهذا الملخص.</p> : inspectorBoards.map((hour) => (
          <div key={hour.key} style={{ marginTop: 12 }}>
            <strong>ملخص فحص المراقبين - {hour.label}</strong>
            <table className="qms-table">
              <thead><tr><th>المراقب</th><th>اسم المنتج</th><th>عينات المنتج</th><th>إجمالي عينات المراقب في الساعة</th><th>العيوب</th><th>المشاكل حسب المنتج</th></tr></thead>
              <tbody>
                {hour.inspectors.flatMap((inspector) => inspector.products.map((product) => (
                  <tr key={`${hour.key}:${inspector.name}:${product.productName}`}>
                    <td>{inspector.name}</td>
                    <td>{product.productName}</td>
                    <td>{product.samples}</td>
                    <td>{product.inspectorTotal}</td>
                    <td>{product.defects}</td>
                    <td>{product.problems.length ? product.problems.join('، ') : 'لا توجد مشاكل مسجلة'}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </QmsPage>
  );
};
