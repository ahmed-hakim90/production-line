import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useAppStore } from '@/store/useAppStore';
import { usePrintEngine } from '@/utils/printManager';
import { usePermission } from '@/utils/permissions';
import { QualityPalletInspectionPrint, QualityPalletReportPrint } from '../components/QualityPrintDocuments';
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
    reasonId,
  }), [rows, lineId, productId, workOrderId, inspectionStatus, reasonId]);

  const inspectionFilters = Boolean(workOrderId || inspectionStatus || reasonId);
  const matchingProduction = (productionRows || []).filter((row) => (!lineId || row.lineId === lineId) && (!productId || row.productId === productId));
  const matchingScrap = (scrapRows || []).filter((row) => (!lineId || row.lineId === lineId) && (!productId || row.productId === productId));
  const reportedProduction = inspectionFilters || !productionRows || matchingProduction.length === 0
    ? null
    : matchingProduction.reduce((sum, row) => sum + Number(row.quantityProduced || 0), 0);
  const scrapQuantity = inspectionFilters || scrapDenied || !scrapRows || matchingScrap.length === 0
    ? null
    : matchingScrap.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
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
          <MasterSelect label="سبب العيب" value={reasonId} onChange={setReasonId} placeholder="كل الأسباب" options={masters.reasons.map((reason) => ({ value: reason.id, label: `${reason.labelAr} (${reason.code})` }))} />
        </div>
        <div className="qms-row">
          {canPrintReport ? (
            <button type="button" className="qms-btn qms-btn-ghost" disabled={filtered.length === 0 || Boolean(error)} onClick={printReport}>طباعة التقرير</button>
          ) : null}
          {can('quality.reports.export') ? (
            <button type="button" className="qms-btn qms-btn-primary" disabled={filtered.length === 0} onClick={() => {
              const sheet = XLSX.utils.json_to_sheet(filtered.map((row) => ({
                البالتة: row.palletNumber,
                الخط: row.lineName,
                المنتج: row.productName,
                الدفعة: row.quantityOnPallet,
                العينة: row.inspectedQuantity,
                العيوب: row.rejectedQuantity,
                الحالة: row.inspectionStatus,
                القرار: row.palletDecision,
                'أمر الشغل': row.workOrderNumber || '',
              })));
              const book = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(book, sheet, 'الجودة');
              saveAs(new Blob([XLSX.write(book, { bookType: 'xlsx', type: 'array' })]), `quality-${from}.xlsx`);
            }}>تصدير Excel</button>
          ) : null}
        </div>
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
          <thead><tr><th>البالتة</th><th>الخط</th><th>المنتج</th><th>الحالة</th><th>القرار</th><th>أمر الشغل</th><th></th></tr></thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className={row.palletDecision === 'مرفوض' ? 'qms-rejected' : undefined}>
                <td>{row.palletNumber}</td>
                <td>{row.lineName}</td>
                <td>{row.productCode ? `${row.productName} (${row.productCode})` : row.productName}</td>
                <td>{row.inspectionStatus}</td>
                <td>{row.palletDecision}</td>
                <td>{row.workOrderNumber || '—'}</td>
                <td>
                  {canPrintPallet ? (
                    <button type="button" className="qms-btn qms-btn-ghost" onClick={() => printPallet(row)}>طباعة</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p>لا توجد بالتات في هذا النطاق.</p> : null}
      </div>
    </QmsPage>
  );
};
