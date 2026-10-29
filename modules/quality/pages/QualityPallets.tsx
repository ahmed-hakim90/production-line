import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { usePrintEngine } from '@/utils/printManager';
import { QualityPalletInspectionPrint } from '../components/QualityPrintDocuments';
import { localDateIso } from '../domain/time';
import type { QualityDefectLine, QualityPallet } from '../model';
import { palletWorkOrderOptionLabel } from '../domain/palletWorkOrderLabel';
import { resolveRecordSector, type QualitySector } from '../domain/sector';
import { qualityRecordPrintAllowed, rowsMatchingTenant } from '../print/qualityPrintModel';
import { activeTenantId, qualityUserMessage } from '../services/qualityGateway';
import { qualityFilterService, type PalletSavedFilter } from '../services/qualityFilterService';
import { qualityPalletService } from '../services/qualityPalletService';
import { inspectorOptions, useQualityAssignments } from '../hooks/useQualityAssignments';
import { MasterSelect, QmsPage, SectorSwitch, matchesSector, useQualityMasters } from '../qms/QmsChrome';

const emptyDefect = (): QualityDefectLine => ({
  tenantId: '',
  reasonId: '',
  reasonCode: '',
  reasonLabel: '',
  count: 1,
  notes: '',
});

export const QualityPallets: React.FC = () => {
  const { can } = usePermission();
  const permissions = useAppStore((state) => state.userPermissions);
  const printTemplate = useAppStore((state) => state.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();
  const canPrintPallet = qualityRecordPrintAllowed(permissions, 'quality.pallets.view');
  const masters = useQualityMasters();
  const staff = useQualityAssignments();
  const [date, setDate] = useState(localDateIso());
  const [sector, setSector] = useState<QualitySector | 'all'>('all');
  const [rows, setRows] = useState<QualityPallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [palletNumber, setPalletNumber] = useState(1);
  const [quantity, setQuantity] = useState(0);
  const [notes, setNotes] = useState('');
  const [activeId, setActiveId] = useState('');
  const [inspected, setInspected] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [defects, setDefects] = useState<QualityDefectLine[]>([emptyDefect()]);
  const [overrideReason, setOverrideReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [inspectorId, setInspectorId] = useState('');
  const [filterFrom, setFilterFrom] = useState(localDateIso());
  const [filterTo, setFilterTo] = useState(localDateIso());
  const [filterLineId, setFilterLineId] = useState('');
  const [filterProductId, setFilterProductId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [savedFilters, setSavedFilters] = useState<PalletSavedFilter[]>([]);
  const [filterName, setFilterName] = useState('');

  const lines = masters.lines.filter((line) => matchesSector(sector, masters.sectorOf('line', line.id || '')));
  const products = masters.products.filter((product) => matchesSector(sector, masters.sectorOf('product', product.id || '')));
  const orders = masters.workOrders.filter((order) => (!lineId || order.lineId === lineId) && (!productId || order.productId === productId));
  const active = rows.find((row) => row.id === activeId);

  const load = async () => {
    setLoading(true);
    try {
      const list = filterFrom === filterTo
        ? await qualityPalletService.listByDate(filterFrom)
        : await qualityPalletService.listByDateRange(filterFrom, filterTo);
      const narrowed = list.filter((row) =>
        (sector === 'all' || row.sector === sector)
        && (!filterLineId || row.lineId === filterLineId)
        && (!filterProductId || row.productId === filterProductId)
        && (!filterStatus || row.inspectionStatus === filterStatus),
      );
      setRows(await qualityPalletService.withDefects(narrowed));
      if (can('quality.pallets.view')) {
        setSavedFilters(await qualityFilterService.list().catch(() => []));
      }
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر تحميل البالتات'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [filterFrom, filterTo, filterLineId, filterProductId, filterStatus, sector]);

  const receive = async () => {
    const line = lines.find((item) => item.id === lineId);
    const product = products.find((item) => item.id === productId);
    const shift = masters.shifts.find((item) => item.id === shiftId);
    const order = orders.find((item) => item.id === workOrderId);
    if (!line || !product || !shift) {
      toast.error(masters.shifts.length === 0 ? 'أضف وردية من شاشة الورديات قبل استلام بالته.' : 'اختر الخط والمنتج والوردية.');
      return;
    }
    setSaving(true);
    try {
      await qualityPalletService.receive({
        date,
        shiftId: shift.id,
        shiftName: shift.name,
        lineId: line.id || '',
        lineName: line.name,
        palletNumber,
        productId: product.id || '',
        productName: product.name,
        productCode: product.code || '',
        workOrderId: order?.id,
        workOrderNumber: order?.workOrderNumber,
        sector: resolveRecordSector(sector, masters.sectorOf('line', line.id || ''), masters.sectorOf('product', product.id || '')),
        lineSector: masters.sectorOf('line', line.id || ''),
        productSector: masters.sectorOf('product', product.id || ''),
        quantityOnPallet: quantity,
        notes,
      });
      toast.success('تم استلام البالتة');
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر الاستلام'));
    } finally {
      setSaving(false);
    }
  };

  const run = async (work: () => Promise<void>, success: string) => {
    setSaving(true);
    try {
      await work();
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(qualityUserMessage(error, 'تعذر الحفظ'));
    } finally {
      setSaving(false);
    }
  };

  const printRow = (row: QualityPallet) => {
    const [scoped] = rowsMatchingTenant([row], activeTenantId());
    if (!scoped || !canPrintPallet) return;
    void qualityPalletService.withDefects([scoped]).then((detailed) => {
      printDocument({
        documentTitle: `بالته-${scoped.palletNumber}`,
        printSettings: printTemplate,
        render: (ref) => <QualityPalletInspectionPrint ref={ref} row={detailed[0]} printSettings={printTemplate} />,
      });
    }).catch((error: unknown) => toast.error(qualityUserMessage(error, 'تعذر تجهيز الطباعة')));
  };

  const kpis = useMemo(() => ({
    waiting: rows.filter((row) => row.inspectionStatus === 'في انتظار الفحص').length,
    running: rows.filter((row) => row.inspectionStatus === 'جاري الفحص').length,
    accepted: rows.filter((row) => row.palletDecision === 'مقبول').length,
    rejected: rows.filter((row) => row.palletDecision === 'مرفوض').length,
  }), [rows]);

  return (
    <QmsPage title="استلام وفحص البالتات" subtitle="دورة من مرحلتين: استلام ثم فحص حسب AQL. كمية البالتة هي حجم دفعة الفحص." actions={<SectorSwitch value={sector} onChange={setSector} />}>
      {masters.auxError ? <p className="qms-muted">{masters.auxError}</p> : null}
      <div className="qms-kpis" style={{ marginBottom: 12 }}>
        <div className="qms-card qms-kpi"><span>بانتظار الفحص</span><strong>{kpis.waiting}</strong></div>
        <div className="qms-card qms-kpi"><span>جاري الفحص</span><strong>{kpis.running}</strong></div>
        <div className="qms-card qms-kpi"><span>مقبول</span><strong>{kpis.accepted}</strong></div>
        <div className="qms-card qms-kpi"><span>مرفوض</span><strong>{kpis.rejected}</strong></div>
      </div>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <h2 className="qms-title">بحث البالتات</h2>
        <div className="qms-row">
          <label><span className="qms-label">من</span><input className="qms-input" type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} /></label>
          <label><span className="qms-label">إلى</span><input className="qms-input" type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} /></label>
          <MasterSelect label="خط البحث" value={filterLineId} onChange={setFilterLineId} placeholder="كل الخطوط" options={lines.map((line) => ({ value: line.id || '', label: line.name }))} />
          <MasterSelect label="منتج البحث" value={filterProductId} onChange={setFilterProductId} placeholder="كل المنتجات" options={products.map((product) => ({ value: product.id || '', label: product.name }))} />
          <label><span className="qms-label">الحالة</span>
            <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
              <option value="">الكل</option>
              <option value="في انتظار الفحص">في انتظار الفحص</option>
              <option value="جاري الفحص">جاري الفحص</option>
              <option value="تم الفحص">تم الفحص</option>
            </select>
          </label>
          <label><span className="qms-label">اسم الفلتر</span><input className="qms-input" value={filterName} onChange={(event) => setFilterName(event.target.value)} /></label>
          <button type="button" className="qms-btn" disabled={!can('quality.pallets.view')} onClick={() => void run(async () => {
            await qualityFilterService.save(filterName, {
              dateFrom: filterFrom,
              dateTo: filterTo,
              lineId: filterLineId,
              productId: filterProductId,
              inspectionStatus: filterStatus,
              palletDecision: '',
            });
            setFilterName('');
          }, 'تم حفظ الفلتر')}>حفظ الفلتر</button>
        </div>
        {savedFilters.length > 0 ? (
          <div className="qms-row">
            {savedFilters.map((filter) => (
              <span key={filter.id}>
                <button type="button" className="qms-btn qms-btn-ghost" onClick={() => {
                  setFilterFrom(filter.criteria.dateFrom || filterFrom);
                  setFilterTo(filter.criteria.dateTo || filter.criteria.dateFrom || filterTo);
                  setFilterLineId(filter.criteria.lineId || '');
                  setFilterProductId(filter.criteria.productId || '');
                  setFilterStatus(filter.criteria.inspectionStatus || '');
                }}>{filter.name}</button>
                <button type="button" className="qms-btn qms-btn-ghost" onClick={() => void run(() => qualityFilterService.remove(filter.id), 'تم حذف الفلتر')}>حذف</button>
              </span>
            ))}
          </div>
        ) : null}
        <p className="qms-muted">الفلتر يحفظ التاريخ والخط والمنتج وحالة الفحص داخل الشركة. رقم البالتة والوردية وقرار القبول لا تُحفظ، كما في البحث الأصلي.</p>
      </section>
      <section className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">تاريخ الاستلام</span><input className="qms-input" type="date" value={date} onChange={(event) => { setDate(event.target.value); setFilterFrom(event.target.value); setFilterTo(event.target.value); }} /></label>
          <MasterSelect label="الخط" value={lineId} onChange={setLineId} placeholder="اختر الخط" options={lines.map((line) => ({ value: line.id || '', label: line.code ? `${line.name} (${line.code})` : line.name }))} />
          <MasterSelect label="المنتج" value={productId} onChange={setProductId} placeholder="اختر المنتج" options={products.map((product) => ({ value: product.id || '', label: product.code ? `${product.name} (${product.code})` : product.name }))} />
          <MasterSelect label="الوردية" value={shiftId} onChange={setShiftId} placeholder="اختر الوردية" options={masters.shifts.map((shift) => ({ value: shift.id, label: `${shift.name} (${shift.startTime || ''})` }))} />
          <MasterSelect label="أمر الشغل" value={workOrderId} onChange={setWorkOrderId} placeholder="اختياري" options={orders.map((order) => ({ value: order.id || '', label: palletWorkOrderOptionLabel(order, masters.products), keywords: order.workOrderNumber }))} />
          <label><span className="qms-label">رقم البالتة</span><input className="qms-input" type="number" min={1} value={palletNumber} onChange={(event) => setPalletNumber(Number(event.target.value))} /></label>
          <label><span className="qms-label">كمية البالتة</span><input className="qms-input" type="number" min={0} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          <label style={{ flex: 1 }}><span className="qms-label">ملاحظات</span><input className="qms-input" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button type="button" className="qms-btn qms-btn-primary" disabled={saving || !can('quality.pallets.inspect')} onClick={() => void receive()}>استلام بالته</button>
        </div>
      </section>
      <section className="qms-card">
        {loading || masters.referenceLoading ? <p>جارٍ التحميل…</p> : null}
        {!loading && rows.length === 0 ? <p>لا توجد بالات في نطاق البحث.</p> : null}
        <div style={{ overflowX: 'auto' }}>
          <table className="qms-table">
            <thead>
              <tr>
                <th>البالتة</th><th>الخط</th><th>المنتج</th><th>الكمية</th><th>العينة</th><th>الحالة</th><th>القرار</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.palletDecision === 'مرفوض' ? 'qms-rejected' : undefined}>
                  <td>{row.palletNumber}</td>
                  <td>{row.lineName}</td>
                  <td>{row.productCode ? `${row.productName} (${row.productCode})` : row.productName}</td>
                  <td>{row.quantityOnPallet}</td>
                  <td>{row.sampleSizeRequired} / قبول {row.maxAllowedDefects} / رفض {row.rejectLimit}</td>
                  <td>{row.inspectionStatus}<div className="qms-muted">{row.receivedTime} {row.inspectionStartedAt ? `· بدء ${row.inspectionStartedAt}` : ''} {row.inspectionCompletedAt ? `· إنهاء ${row.inspectionCompletedAt}` : ''}</div></td>
                  <td>{row.palletDecision}</td>
                  <td>
                    <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setActiveId(row.id)}>فتح</button>
                    {canPrintPallet ? <button type="button" className="qms-btn qms-btn-ghost" onClick={() => printRow(row)}>طباعة</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {active ? (
        <section className="qms-card" style={{ marginTop: 12 }}>
          <h2 className="qms-title">بالته {active.palletNumber}</h2>
          <p className="qms-muted">أمر الشغل: {active.workOrderNumber || 'بدون ربط'}</p>
          <div className="qms-row">
            {can('quality.pallets.inspect') && active.inspectionStatus === 'في انتظار الفحص' ? (
              <button type="button" className="qms-btn qms-btn-dark" disabled={saving} onClick={() => void run(() => qualityPalletService.start(active.id), 'بدأ الفحص')}>بدء الفحص</button>
            ) : null}
          </div>
          {active.inspectionStatus !== 'تم الفحص' && can('quality.pallets.inspect') ? (
            <div className="qms-grid" style={{ marginTop: 12 }}>
              <div className="qms-row">
                <label><span className="qms-label">المفحوص</span><input className="qms-input" type="number" min={0} value={inspected} onChange={(event) => setInspected(Number(event.target.value))} /></label>
                <label><span className="qms-label">عدد العيوب</span><input className="qms-input" type="number" min={0} value={rejected} onChange={(event) => setRejected(Number(event.target.value))} /></label>
                <MasterSelect label="المراقب" value={inspectorId} onChange={setInspectorId} placeholder="اختر المراقب" options={inspectorOptions(masters.employees, staff.assignments, { lineId: active.lineId })} />
              </div>
              {defects.map((defect, index) => (
                <div className="qms-row" key={`${defect.reasonId}-${index}`}>
                  <MasterSelect
                    label="سبب العيب"
                    value={defect.reasonId}
                    onChange={(value) => {
                      const reason = masters.reasons.find((item) => item.id === value);
                      setDefects((current) => current.map((item, itemIndex) => itemIndex === index ? {
                        ...item,
                        reasonId: value,
                        reasonCode: reason?.code || '',
                        reasonLabel: reason?.labelAr || '',
                      } : item));
                    }}
                    placeholder="سبب العيب"
                    options={masters.reasons.map((reason) => ({ value: reason.id, label: `${reason.labelAr} (${reason.code})` }))}
                  />
                  <label><span className="qms-label">العدد</span><input className="qms-input" type="number" min={1} value={defect.count} onChange={(event) => setDefects((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, count: Number(event.target.value) } : item))} /></label>
                </div>
              ))}
              <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setDefects((current) => [...current, emptyDefect()])}>إضافة سبب</button>
              <button
                type="button"
                className="qms-btn qms-btn-primary"
                disabled={saving}
                onClick={() => {
                  const inspector = masters.employees.find((employee) => employee.id === inspectorId);
                  if (!inspector?.id) {
                    toast.error('لا يوجد موظف لتسجيله كمراقب.');
                    return;
                  }
                  void run(() => qualityPalletService.complete(active.id, {
                    inspectedQuantity: inspected,
                    rejectedQuantity: rejected,
                    defects: defects.filter((defect) => defect.reasonId && defect.count > 0),
                    inspectorEmployeeId: inspector.id || '',
                    inspectorName: inspector.name,
                  }), 'تم اعتماد الفحص');
                }}
              >
                اعتماد الفحص
              </button>
            </div>
          ) : null}
          {active.inspectionStatus === 'تم الفحص' ? (
            <div className="qms-row" style={{ marginTop: 12 }}>
              <label style={{ flex: 1 }}><span className="qms-label">سبب التجاوز أو إعادة الفتح</span><input className="qms-input" value={overrideReason || reopenReason} onChange={(event) => { setOverrideReason(event.target.value); setReopenReason(event.target.value); }} /></label>
              {can('quality.pallets.override') ? (
                <>
                  <button type="button" className="qms-btn qms-btn-dark" disabled={saving} onClick={() => void run(() => qualityPalletService.override(active.id, 'manual_accept', overrideReason), 'تم القبول اليدوي')}>قبول يدوي</button>
                  <button type="button" className="qms-btn qms-btn-primary" disabled={saving} onClick={() => void run(() => qualityPalletService.override(active.id, 'manual_reject', overrideReason), 'تم الرفض اليدوي')}>رفض يدوي</button>
                </>
              ) : null}
              {can('quality.records.reopen') ? (
                <button type="button" className="qms-btn qms-btn-ghost" disabled={saving} onClick={() => void run(() => qualityPalletService.reopen(active.id, reopenReason), 'تمت إعادة الفتح')}>إعادة فتح</button>
              ) : null}
              {can('quality.records.delete') ? (
                <button type="button" className="qms-btn qms-btn-ghost" disabled={saving} onClick={() => void run(async () => { await qualityPalletService.remove(active.id); setActiveId(''); }, 'تم الحذف')}>حذف</button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </QmsPage>
  );
};
