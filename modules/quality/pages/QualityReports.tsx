import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useAppStore } from '@/store/useAppStore';
import { usePrintEngine } from '@/utils/printManager';
import { usePermission } from '@/utils/permissions';
import { QualityPalletInspectionPrint, QualityPalletReportPrint } from '../components/QualityPrintDocuments';
import { csvCell } from '../domain/qualityAnalytics';
import {
  QUALITY_REPORT_COLUMNS,
  qualityReportRecords,
  reportColumnsFor,
  type QualityReportKind,
} from '../domain/qualityReportColumns';
import { localDateIso } from '../domain/time';
import type { QualityPallet } from '../model';
import {
  filterQualityPallets,
  formatQualityRange,
  qualityRecordPrintAllowed,
  qualityReportTotals,
  rowsMatchingTenant,
} from '../print/qualityPrintModel';
import { activeTenantId, qualityUserMessage } from '../services/qualityGateway';
import { qualityPalletService } from '../services/qualityPalletService';
import { qualityProductionQuery } from '../services/qualityProductionQuery';
import { qualityScrapService } from '../services/qualitySecondSortService';
import { MasterSelect, QmsPage, useQualityMasters } from '../qms/QmsChrome';

const rangeDays = (from: string, to: string): number => {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
};

export const QualityReports: React.FC = () => {
  const { can } = usePermission();
  const permissions = useAppStore((state) => state.userPermissions);
  const printTemplate = useAppStore((state) => state.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();
  const masters = useQualityMasters();
  const [params] = useSearchParams();
  const linkedWorkOrderId = params.get('workOrderId') || '';
  const today = localDateIso();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [workOrderId, setWorkOrderId] = useState(linkedWorkOrderId);
  const [inspectionStatus, setInspectionStatus] = useState('');
  const [palletDecision, setPalletDecision] = useState('');
  const [reportKind, setReportKind] = useState<QualityReportKind>('all');
  const [selectedColumns, setSelectedColumns] = useState(QUALITY_REPORT_COLUMNS.all.map((column) => column.id));
  const [reasonId, setReasonId] = useState('');
  const [rows, setRows] = useState<QualityPallet[]>([]);
  const [productionRows, setProductionRows] = useState<Awaited<ReturnType<typeof qualityProductionQuery.quantitiesForRange>> | null>(null);
  const [scrapRows, setScrapRows] = useState<Awaited<ReturnType<typeof qualityScrapService.listRange>> | null>(null);
  const [scrapDenied, setScrapDenied] = useState(false);
  const [error, setError] = useState('');
  const scrapReadable = can('quality.scrap.view');
  const canPrintReport = qualityRecordPrintAllowed(permissions, 'quality.reports.view');
  const canPrintPallet = qualityRecordPrintAllowed(permissions, 'quality.pallets.view');

  useEffect(() => {
    let cancelled = false;
    setError('');
    if (to < from || rangeDays(from, to) > 31) {
      setError('نطاق التقرير 31 يوماً كحد أقصى.');
      setRows([]);
      return;
    }
    Promise.all([
      qualityPalletService.listByDateRange(from, to).then((list) => qualityPalletService.withDefects(list)),
      qualityProductionQuery.quantitiesForRange(from, to).catch(() => null),
      scrapReadable ? qualityScrapService.listRange(from, to).catch(() => null) : Promise.resolve(null),
    ]).then(([pallets, production, scrap]) => {
      if (cancelled) return;
      setRows(rowsMatchingTenant(pallets, activeTenantId()));
      setProductionRows(production);
      setScrapDenied(!scrapReadable || scrap == null);
      setScrapRows(scrap ? rowsMatchingTenant(scrap, activeTenantId()) : null);
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(qualityUserMessage(loadError, 'تعذر تحميل التقرير'));
    });
    return () => { cancelled = true; };
  }, [from, to, scrapReadable]);

  const filtered = useMemo(() => filterQualityPallets(rows, {
    lineId,
    productId,
    workOrderId,
    inspectionStatus,
    palletDecision,
    reasonId,
  }), [rows, lineId, productId, workOrderId, inspectionStatus, palletDecision, reasonId]);

  const inspectionFilters = Boolean(workOrderId || inspectionStatus || reasonId);
  const matchingProduction = (productionRows || []).filter((row) => (!lineId || row.lineId === lineId) && (!productId || row.productId === productId));
  const matchingScrap = (scrapRows || []).filter((row) => (!lineId || row.lineId === lineId) && (!productId || row.productId === productId));
  const reportedProduction = inspectionFilters || !productionRows || matchingProduction.length === 0
    ? null
    : matchingProduction.reduce((sum, row) => sum + Number(row.quantityProduced || 0), 0);
  const scrapQuantity = inspectionFilters || scrapDenied || !scrapRows || matchingScrap.length === 0
    ? null
    : matchingScrap.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const labeledProduction = inspectionFilters || !productionRows ? [] : matchingProduction.map((row) => ({
    lineId: row.lineId,
    productId: row.productId,
    lineName: masters.lines.find((line) => line.id === row.lineId)?.name || 'خط غير معروف',
    productName: row.productName || masters.products.find((product) => product.id === row.productId)?.name || 'منتج غير معروف',
    productCode: row.productCode || masters.products.find((product) => product.id === row.productId)?.code || '',
    quantityProduced: Number(row.quantityProduced || 0),
  }));
  const records = qualityReportRecords({
    kind: reportKind,
    pallets: filtered,
    production: reportKind === 'daily' || reportKind === 'product' ? labeledProduction : [],
  });
  const visibleColumns = reportColumnsFor(reportKind, selectedColumns);
  const totals = qualityReportTotals({
    pallets: filtered,
    reportedProduction,
    scrapQuantity,
  });

  const filterLabels = [
    lineId ? masters.lines.find((line) => line.id === lineId)?.name : '',
    productId ? masters.products.find((product) => product.id === productId)?.name : '',
    workOrderId ? `أمر ${filtered[0]?.workOrderNumber || workOrderId}` : '',
    inspectionStatus,
    palletDecision,
    reasonId ? masters.reasons.find((reason) => reason.id === reasonId)?.labelAr : '',
  ].filter((label): label is string => Boolean(label));

  const printReport = () => {
    if (!canPrintReport || filtered.length === 0) return;
    printDocument({
      documentTitle: `جودة-${from}`,
      printSettings: printTemplate,
      render: (ref) => (
        <QualityPalletReportPrint
          ref={ref}
          from={from}
          to={to}
          filters={filterLabels}
          pallets={filtered}
          totals={totals}
          scrapDenied={scrapDenied}
          printSettings={printTemplate}
        />
      ),
    });
  };

  const printPallet = (row: QualityPallet) => {
    if (!canPrintPallet) return;
    printDocument({
      documentTitle: `بالته-${row.palletNumber}`,
      printSettings: printTemplate,
      render: (ref) => <QualityPalletInspectionPrint ref={ref} row={row} printSettings={printTemplate} />,
    });
  };

  return (
    <QmsPage title="تقارير الجودة" subtitle={workOrderId ? `النطاق ${formatQualityRange(from, to)}` : 'بالتات النطاق المحدد'}>
      <div className="qms-card" style={{ marginBottom: 12 }}>
        <div className="qms-row">
          <label><span className="qms-label">نوع التقرير</span>
            <select className="qms-input" value={reportKind} onChange={(event) => {
              const next = event.target.value as QualityReportKind;
              setReportKind(next);
              setSelectedColumns(QUALITY_REPORT_COLUMNS[next].map((column) => column.id));
              if (next === 'waiting') { setInspectionStatus('في انتظار الفحص'); setPalletDecision(''); }
              else if (next === 'rejected') { setInspectionStatus(''); setPalletDecision('مرفوض'); }
              else { setInspectionStatus(''); setPalletDecision(''); }
            }}>
              <option value="all">كل البالتات</option>
              <option value="daily">جودة وإنتاج الخطوط</option>
              <option value="product">الأجهزة: إنتاج ومفحوص وانتظار</option>
              <option value="waiting">بانتظار الفحص</option>
              <option value="rejected">المرفوضة</option>
              <option value="reasons">أسباب الرفض</option>
              <option value="inspectors">أداء المراقبين</option>
            </select>
          </label>
          <label><span className="qms-label">من</span><input className="qms-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label><span className="qms-label">إلى</span><input className="qms-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <MasterSelect label="الخط" value={lineId} onChange={setLineId} placeholder="كل الخطوط" options={masters.lines.map((line) => ({ value: line.id || '', label: line.name }))} />
          <MasterSelect label="المنتج" value={productId} onChange={setProductId} placeholder="كل المنتجات" options={masters.products.map((product) => ({ value: product.id || '', label: product.name }))} />
          <label><span className="qms-label">أمر الشغل</span><input className="qms-input" value={workOrderId} onChange={(event) => setWorkOrderId(event.target.value)} placeholder="معرّف الأمر" /></label>
          <label><span className="qms-label">الحالة</span>
            <select className="qms-input" value={inspectionStatus} onChange={(event) => setInspectionStatus(event.target.value)}>
              <option value="">الكل</option>
              <option value="في انتظار الفحص">في انتظار الفحص</option>
              <option value="جاري الفحص">جاري الفحص</option>
              <option value="تم الفحص">تم الفحص</option>
            </select>
          </label>
          <label><span className="qms-label">القرار</span>
            <select className="qms-input" value={palletDecision} onChange={(event) => setPalletDecision(event.target.value)}>
              <option value="">الكل</option>
              <option value="مقبول">مقبول</option>
              <option value="مرفوض">مرفوض</option>
              <option value="قيد الفحص">قيد الفحص</option>
            </select>
          </label>
          <MasterSelect label="سبب العيب" value={reasonId} onChange={setReasonId} placeholder="كل الأسباب" options={masters.reasons.map((reason) => ({ value: reason.id, label: `${reason.labelAr} (${reason.code})` }))} />
        </div>
        <div className="qms-row" style={{ marginTop: 8 }}>
          <span className="qms-label">أعمدة التقرير</span>
          {QUALITY_REPORT_COLUMNS[reportKind].map((column) => (
            <label key={column.id}>
              <input
                type="checkbox"
                checked={visibleColumns.some((item) => item.id === column.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selectedColumns, column.id]
                    : selectedColumns.filter((id) => id !== column.id);
                  if (QUALITY_REPORT_COLUMNS[reportKind].every((item) => !next.includes(item.id))) return;
                  setSelectedColumns(next);
                }}
              />
              {' '}{column.label}
            </label>
          ))}
          <button type="button" className="qms-btn qms-btn-ghost" onClick={() => setSelectedColumns(QUALITY_REPORT_COLUMNS[reportKind].map((column) => column.id))}>تحديد الكل</button>
        </div>
        <div className="qms-row">
          {canPrintReport && (reportKind === 'all' || reportKind === 'waiting' || reportKind === 'rejected') ? (
            <button type="button" className="qms-btn qms-btn-ghost" disabled={filtered.length === 0 || Boolean(error)} onClick={printReport}>طباعة التقرير</button>
          ) : null}
          {can('quality.reports.export') ? (
            <button type="button" className="qms-btn qms-btn-primary" disabled={records.length === 0 || Boolean(error)} onClick={() => {
              const sheet = XLSX.utils.json_to_sheet(records.map((row) => Object.fromEntries(visibleColumns.map((column) => [column.label, row.cells[column.id] ?? '']))));
              const book = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(book, sheet, 'الجودة');
              saveAs(new Blob([XLSX.write(book, { bookType: 'xlsx', type: 'array' })]), `quality-${from}.xlsx`);
            }}>تصدير Excel</button>
          ) : null}
          {can('quality.reports.export') ? (
            <button type="button" className="qms-btn qms-btn-ghost" disabled={records.length === 0 || Boolean(error)} onClick={() => {
              const header = visibleColumns.map((column) => csvCell(column.label)).join(',');
              const body = records.map((row) => visibleColumns.map((column) => csvCell(row.cells[column.id] ?? '')).join(','));
              saveAs(new Blob([`\uFEFF${[header, ...body].join('\n')}`], { type: 'text/csv;charset=utf-8' }), `quality-${from}.csv`);
            }}>تصدير CSV</button>
          ) : null}
        </div>
        <p className="qms-muted">{records.length} سجل. الكمية المنتجة من تقارير الإنتاج، وكمية البالتة تبقى كمية الدفعة.</p>
        <p className="qms-muted">
          إنتاج التقارير: {inspectionFilters ? 'غير مرتبط بهذه التصفية' : totals.reportedProduction == null ? 'لا توجد تقارير' : totals.reportedProduction}
          . حجم الدفعات: {totals.lotUnits}
          . العينة: {totals.inspected}
          . عيوب الفحص: {totals.defects}
          . الهالك: {scrapDenied ? 'غير متاح' : inspectionFilters ? 'غير مرتبط بهذه التصفية' : totals.scrap == null ? 'لا توجد سجلات' : totals.scrap}
          .
        </p>
        {error ? <p>{error}</p> : null}
      </div>
      <div className="qms-card" style={{ overflowX: 'auto' }}>
        <table className="qms-table">
          <thead>
            <tr>
              {visibleColumns.map((column) => <th key={column.id}>{column.label}</th>)}
              {records.some((row) => row.palletId) ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {records.map((row, index) => {
              const pallet = row.palletId ? filtered.find((item) => item.id === row.palletId) : undefined;
              return (
                <tr key={row.palletId || `${reportKind}-${index}`} className={pallet?.palletDecision === 'مرفوض' ? 'qms-rejected' : undefined}>
                  {visibleColumns.map((column) => <td key={column.id}>{row.cells[column.id] ?? '—'}</td>)}
                  {records.some((item) => item.palletId) ? (
                    <td>
                      {canPrintPallet && pallet ? (
                        <button type="button" className="qms-btn qms-btn-ghost" onClick={() => printPallet(pallet)}>طباعة</button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {records.length === 0 ? <p>لا توجد بيانات مطابقة.</p> : null}
      </div>
    </QmsPage>
  );
};
