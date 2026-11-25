import { forwardRef, type ReactNode } from 'react';
import { FactoryPrintShell } from '@/src/components/erp/FactoryPrintShell';
import { FactoryPrintTable } from '@/src/components/erp/FactoryPrintTable';
import type { PrintTemplateSettings } from '@/types';
import { resolvePrintAccentHex } from '@/utils/printTheme';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import type { FlowLineRank } from '../domain/flowchart';
import type { QualityPallet, QualitySecondSortReport } from '../model';
import {
  QUALITY_PRINT_EMPTY,
  SECOND_SORT_PAPER,
  formatQualityCount,
  formatQualityDate,
  formatQualityRange,
  formatQualityShare,
  hourlyPrintRows,
  linePullPrintRows,
  palletDefectSummary,
  periodStatusPrintRows,
  scrapPrintModel,
  type QualityReportTotals,
  type ScrapPrintRow,
} from '../print/qualityPrintModel';
import type { QualityHourlySample, QualityLinePull, QualityPeriodStatus } from '../model';

type FrameProps = {
  title: string;
  scope: string;
  printSettings?: PrintTemplateSettings;
  paperWidth?: string;
  minHeight?: string;
  dense?: boolean;
  fontSize?: string;
  meta?: Array<{ label: string; value: string }>;
  kpis?: Array<{ label: string; value: string }>;
  signatures?: Array<{ title: string; detail?: string }>;
  children: ReactNode;
};

const QualityPrintFrame = forwardRef<HTMLDivElement, FrameProps>(function QualityPrintFrame({
  title,
  scope,
  printSettings,
  paperWidth,
  minHeight,
  dense,
  fontSize,
  meta,
  kpis,
  signatures,
  children,
}, ref) {
  const doc = resolvePrintDocumentConfig(printSettings, 'qualityReport');
  return (
    <FactoryPrintShell
      ref={ref}
      companyName={doc.headerText}
      documentType={title}
      printDate={scope}
      footerTagline={doc.footerText}
      extraLines={doc.customLines}
      brandAccent={resolvePrintAccentHex(printSettings?.primaryColor)}
      paperWidth={paperWidth}
      minHeight={minHeight}
      dense={dense}
      fontSize={fontSize}
      headerVariant="letterhead"
      metaCards={doc.isFieldVisible('meta') ? meta : undefined}
      kpis={doc.isFieldVisible('kpis') ? kpis?.map((item) => ({ label: item.label, value: item.value })) : undefined}
      signatures={doc.isFieldVisible('signatures') ? signatures : undefined}
    >
      {children}
    </FactoryPrintShell>
  );
});

function EmptyPrint({ message = QUALITY_PRINT_EMPTY }: { message?: string }) {
  return <p>{message}</p>;
}

export const QualityHourlyPrint = forwardRef<HTMLDivElement, {
  date: string;
  rows: QualityHourlySample[];
  printSettings?: PrintTemplateSettings;
}>(function QualityHourlyPrint({ date, rows, printSettings }, ref) {
  const printable = hourlyPrintRows(rows);
  const defects = printable.flatMap((row) => row.defects.map((defect) => ({ ...defect, slotName: row.slotName, lineName: row.lineName })));
  return (
    <QualityPrintFrame
      ref={ref}
      title="تقرير العينات الساعية"
      scope={formatQualityDate(date)}
      printSettings={printSettings}
      meta={[{ label: 'التاريخ', value: formatQualityDate(date) }, { label: 'السجلات', value: formatQualityCount(printable.length) }]}
    >
      {printable.length === 0 ? <EmptyPrint /> : (
        <FactoryPrintTable
          printSettings={printSettings}
          tableLayout="auto"
          columns={[
            { key: 'slot', header: 'الفترة' },
            { key: 'line', header: 'الخط' },
            { key: 'product', header: 'المنتج' },
            { key: 'shift', header: 'الوردية' },
            { key: 'inspector', header: 'المراقب' },
            { key: 'samples', header: 'العينات' },
            { key: 'defects', header: 'العيوب' },
            { key: 'decision', header: 'القرار' },
            { key: 'notes', header: 'ملاحظات' },
          ]}
          rows={printable.map((row) => ({
            key: row.id,
            cells: {
              slot: row.slotName,
              line: row.lineName,
              product: row.productName,
              shift: row.shiftName,
              inspector: row.inspectorName,
              samples: formatQualityCount(row.sampleCount),
              defects: formatQualityCount(row.defectCount),
              decision: row.decision,
              notes: row.notes || '—',
            },
          }))}
        />
      )}
      {defects.length > 0 ? (
        <>
          <p>أسباب العيوب المسجلة</p>
          <FactoryPrintTable
            printSettings={printSettings}
            tableLayout="auto"
            columns={[
              { key: 'slot', header: 'الفترة' },
              { key: 'line', header: 'الخط' },
              { key: 'code', header: 'الكود' },
              { key: 'label', header: 'الوصف' },
              { key: 'count', header: 'العدد' },
              { key: 'notes', header: 'ملاحظة' },
            ]}
            rows={defects.map((defect, index) => ({
              key: `${defect.slotName}-${index}`,
              cells: {
                slot: defect.slotName,
                line: defect.lineName,
                code: defect.code || '—',
                label: defect.label || '—',
                count: formatQualityCount(defect.count),
                notes: defect.notes || '—',
              },
            }))}
          />
        </>
      ) : null}
    </QualityPrintFrame>
  );
});

export const QualityLinePullPrint = forwardRef<HTMLDivElement, {
  date: string;
  rows: QualityLinePull[];
  periods: QualityPeriodStatus[];
  lineNames?: Record<string, string>;
  printSettings?: PrintTemplateSettings;
}>(function QualityLinePullPrint({ date, rows, periods, lineNames, printSettings }, ref) {
  const printable = linePullPrintRows(rows);
  const periodRows = periodStatusPrintRows(periods, lineNames);
  const defects = printable.flatMap((row) => row.defects.map((defect) => ({ ...defect, period: row.period, lineName: row.lineName })));
  return (
    <QualityPrintFrame
      ref={ref}
      title="تقرير سحب عينات الخطوط"
      scope={formatQualityDate(date)}
      printSettings={printSettings}
      meta={[{ label: 'التاريخ', value: formatQualityDate(date) }, { label: 'السحبات', value: formatQualityCount(printable.length) }]}
    >
      {printable.length === 0 ? <EmptyPrint /> : (
        <FactoryPrintTable
          printSettings={printSettings}
          tableLayout="auto"
          columns={[
            { key: 'period', header: 'الفترة' },
            { key: 'line', header: 'الخط' },
            { key: 'product', header: 'المنتج' },
            { key: 'station', header: 'المحطة' },
            { key: 'inspector', header: 'المراقب' },
            { key: 'samples', header: 'العينات' },
            { key: 'extra', header: 'الإضافي' },
            { key: 'primary', header: 'الأساسي' },
            { key: 'defects', header: 'العيوب' },
            { key: 'result', header: 'النتيجة' },
          ]}
          rows={printable.map((row) => ({
            key: row.id,
            cells: {
              period: row.period,
              line: row.lineName,
              product: row.productName,
              station: row.stationName,
              inspector: row.additionalInspectorName ? `${row.inspectorName} + ${row.additionalInspectorName}` : row.inspectorName,
              samples: formatQualityCount(row.sampleCount),
              extra: formatQualityCount(row.additionalSampleCount),
              primary: formatQualityCount(row.primarySampleCount),
              defects: formatQualityCount(row.defectCount),
              result: row.result,
            },
          }))}
        />
      )}
      {printable.some((row) => row.notes || row.reopenReason) ? (
        <p>
          {printable.filter((row) => row.notes || row.reopenReason).map((row) => (
            `${row.period} / ${row.lineName}: ${row.notes || '—'}${row.reopenReason ? ` — إعادة فتح: ${row.reopenReason}` : ''}`
          )).join(' · ')}
        </p>
      ) : null}
      {defects.length > 0 ? (
        <FactoryPrintTable
          printSettings={printSettings}
          tableLayout="auto"
          columns={[
            { key: 'period', header: 'الفترة' },
            { key: 'line', header: 'الخط' },
            { key: 'code', header: 'الكود' },
            { key: 'label', header: 'الوصف' },
            { key: 'count', header: 'العدد' },
          ]}
          rows={defects.map((defect, index) => ({
            key: `${defect.period}-${index}`,
            cells: {
              period: defect.period,
              line: defect.lineName,
              code: defect.code || '—',
              label: defect.label || '—',
              count: formatQualityCount(defect.count),
            },
          }))}
        />
      ) : null}
      {periodRows.length > 0 ? (
        <>
          <p>فترات متوقفة أو بدون سحب</p>
          <FactoryPrintTable
            printSettings={printSettings}
            tableLayout="auto"
            columns={[
              { key: 'slot', header: 'الفترة' },
              { key: 'line', header: 'الخط' },
              { key: 'stopped', header: 'الحالة' },
              { key: 'reason', header: 'السبب' },
            ]}
            rows={periodRows.map((row) => ({
              key: row.id,
              cells: {
                slot: row.slotKey,
                line: row.lineName,
                stopped: row.stopped ? 'متوقف' : 'بدون سحب',
                reason: row.reason || '—',
              },
            }))}
          />
        </>
      ) : null}
    </QualityPrintFrame>
  );
});

export const QualityScrapPrint = forwardRef<HTMLDivElement, {
  date: string;
  rows: ScrapPrintRow[];
  printSettings?: PrintTemplateSettings;
}>(function QualityScrapPrint({ date, rows, printSettings }, ref) {
  const model = scrapPrintModel(rows);
  const showCode = model.rows.some((row) => row.reasonCode);
  return (
    <QualityPrintFrame
      ref={ref}
      title="تقرير الهالك"
      scope={formatQualityDate(date)}
      printSettings={printSettings}
      meta={[
        { label: 'التاريخ', value: formatQualityDate(date) },
        { label: 'إجمالي الهالك', value: formatQualityCount(model.total) },
      ]}
    >
      <p>الكمية هنا كمية هالك فقط، وليست كمية إنتاج أو كمية فحص.</p>
      {model.rows.length === 0 ? <EmptyPrint /> : (
        <FactoryPrintTable
          printSettings={printSettings}
          tableLayout="auto"
          columns={[
            { key: 'line', header: 'الخط' },
            { key: 'product', header: 'المنتج' },
            ...(showCode ? [{ key: 'code', header: 'الكود' }] : []),
            { key: 'reason', header: 'سبب الهالك' },
            { key: 'quantity', header: 'الكمية' },
            { key: 'slot', header: 'الفترة' },
          ]}
          rows={model.rows.map((row) => ({
            key: row.id,
            cells: {
              line: row.lineName,
              product: row.productName,
              code: row.reasonCode || '—',
              reason: row.reasonLabel,
              quantity: formatQualityCount(row.quantity),
              slot: row.slotName || '—',
            },
          }))}
        />
      )}
      {model.shares.length > 0 ? (
        <FactoryPrintTable
          printSettings={printSettings}
          tableLayout="auto"
          columns={[
            { key: 'reason', header: 'سبب الهالك' },
            { key: 'quantity', header: 'الكمية' },
            { key: 'share', header: 'النسبة' },
          ]}
          rows={model.shares.map((share) => ({
            key: share.reasonLabel,
            cells: {
              reason: share.reasonLabel,
              quantity: formatQualityCount(share.quantity),
              share: formatQualityShare(share.share),
            },
          }))}
        />
      ) : null}
    </QualityPrintFrame>
  );
});

const totalLabel = (value: number | null, missing: string) =>
  value == null ? missing : formatQualityCount(value);

export const QualityPalletReportPrint = forwardRef<HTMLDivElement, {
  from: string;
  to: string;
  filters: string[];
  pallets: QualityPallet[];
  totals: QualityReportTotals;
  scrapDenied: boolean;
  printSettings?: PrintTemplateSettings;
}>(function QualityPalletReportPrint({ from, to, filters, pallets, totals, scrapDenied, printSettings }, ref) {
  const defects = palletDefectSummary(pallets);
  const doc = resolvePrintDocumentConfig(printSettings, 'qualityReport');
  return (
    <QualityPrintFrame
      ref={ref}
      title="تقرير الجودة"
      scope={formatQualityRange(from, to)}
      printSettings={printSettings}
      meta={[
        { label: 'النطاق', value: formatQualityRange(from, to) },
        { label: 'التصفية', value: filters.length ? filters.join(' · ') : 'بدون تصفية إضافية' },
      ]}
      kpis={doc.isFieldVisible('kpis') ? [
        { label: 'إنتاج التقارير', value: totalLabel(totals.reportedProduction, 'لا توجد تقارير أو التصفية لا تشمله') },
        { label: 'حجم الدفعات', value: formatQualityCount(totals.lotUnits) },
        { label: 'العينة المفحوصة', value: formatQualityCount(totals.inspected) },
        { label: 'عيوب الفحص', value: formatQualityCount(totals.defects) },
        { label: 'هالك', value: scrapDenied ? 'غير متاح' : totalLabel(totals.scrap, 'لا توجد سجلات هالك') },
      ] : undefined}
    >
      <p>إنتاج التقارير وحجم دفعة البالتة والعينة المفحوصة وعيوب الفحص والهالك أرقام مستقلة ولا تُجمع معاً.</p>
      {pallets.length === 0 ? <EmptyPrint /> : (
        <FactoryPrintTable
          printSettings={printSettings}
          tableLayout="auto"
          columns={[
            { key: 'date', header: 'التاريخ' },
            { key: 'pallet', header: 'البالتة' },
            { key: 'line', header: 'الخط' },
            { key: 'product', header: 'المنتج' },
            { key: 'order', header: 'أمر الشغل' },
            { key: 'lot', header: 'الدفعة' },
            { key: 'sample', header: 'العينة' },
            { key: 'defects', header: 'العيوب' },
            { key: 'status', header: 'الحالة' },
            { key: 'decision', header: 'القرار' },
          ]}
          rows={pallets.map((row) => ({
            key: row.id,
            cells: {
              date: formatQualityDate(row.date),
              pallet: formatQualityCount(row.palletNumber),
              line: row.lineName,
              product: row.productCode ? `${row.productName} (${row.productCode})` : row.productName,
              order: row.workOrderNumber || '—',
              lot: formatQualityCount(row.quantityOnPallet),
              sample: formatQualityCount(row.inspectedQuantity),
              defects: formatQualityCount(row.rejectedQuantity),
              status: row.inspectionStatus,
              decision: row.palletDecision,
            },
          }))}
        />
      )}
      {doc.isFieldVisible('defects') && defects.length > 0 ? (
        <FactoryPrintTable
          printSettings={printSettings}
          tableLayout="auto"
          columns={[
            { key: 'code', header: 'الكود' },
            { key: 'label', header: 'الوصف' },
            { key: 'count', header: 'العدد' },
          ]}
          rows={defects.map((defect) => ({
            key: `${defect.code}-${defect.label}`,
            cells: {
              code: defect.code || '—',
              label: defect.label || '—',
              count: formatQualityCount(defect.count),
            },
          }))}
        />
      ) : null}
    </QualityPrintFrame>
  );
});

export const QualityFlowchartPrint = forwardRef<HTMLDivElement, {
  from: string;
  to: string;
  reportedProductionUnits: number;
  lotUnits: number;
  inspected: number;
  defects: number;
  defectRate: number;
  acceptedPallets: number;
  rejectedPallets: number;
  bestName: string;
  worstName: string;
  rankings: FlowLineRank[];
  pareto: Array<{ reasonLabel: string; count: number }>;
  printSettings?: PrintTemplateSettings;
}>(function QualityFlowchartPrint(props, ref) {
  return (
    <QualityPrintFrame
      ref={ref}
      title="مخطط الجودة"
      scope={formatQualityRange(props.from, props.to)}
      printSettings={props.printSettings}
      meta={[
        { label: 'النطاق', value: formatQualityRange(props.from, props.to) },
        { label: 'أفضل خط', value: props.bestName || '—' },
        { label: 'أسوأ خط', value: props.worstName || '—' },
      ]}
      kpis={[
        { label: 'إنتاج مسجل', value: formatQualityCount(props.reportedProductionUnits) },
        { label: 'وحدات الدفعات', value: formatQualityCount(props.lotUnits) },
        { label: 'عينات مفحوصة', value: formatQualityCount(props.inspected) },
        { label: 'عيوب', value: formatQualityCount(props.defects) },
        { label: 'معدل العيب', value: `${formatQualityCount(props.defectRate)}٪` },
        { label: 'مقبول / مرفوض', value: `${formatQualityCount(props.acceptedPallets)} / ${formatQualityCount(props.rejectedPallets)}` },
      ]}
    >
      <p>ترتيب الخطوط حسب معدل العيب من فحص البالتات وعينات الساعة. كمية البالتة لا تُجمع مع كمية الإنتاج المسجلة.</p>
      {props.rankings.length === 0 ? <EmptyPrint message="لا توجد خطوط في نتيجة المخطط." /> : (
        <FactoryPrintTable
          printSettings={props.printSettings}
          tableLayout="auto"
          columns={[
            { key: 'line', header: 'الخط' },
            { key: 'product', header: 'المنتج' },
            { key: 'samples', header: 'عينات' },
            { key: 'defects', header: 'عيوب' },
            { key: 'rate', header: 'المعدل' },
            { key: 'top', header: 'أبرز عيب' },
          ]}
          rows={props.rankings.map((line) => ({
            key: line.lineId,
            cells: {
              line: line.lineName,
              product: line.productName,
              samples: formatQualityCount(line.inspected),
              defects: formatQualityCount(line.defects),
              rate: `${formatQualityCount(line.defectRate)}٪`,
              top: line.topDefect,
            },
          }))}
        />
      )}
      {props.pareto.length === 0 ? <p>لا توجد عيوب مسجلة في النطاق.</p> : (
        <FactoryPrintTable
          printSettings={props.printSettings}
          tableLayout="auto"
          columns={[
            { key: 'reason', header: 'سبب العيب' },
            { key: 'count', header: 'العدد' },
          ]}
          rows={props.pareto.map((item) => ({
            key: item.reasonLabel,
            cells: { reason: item.reasonLabel, count: formatQualityCount(item.count) },
          }))}
        />
      )}
    </QualityPrintFrame>
  );
});

export const QualityPalletInspectionPrint = forwardRef<HTMLDivElement, {
  row: QualityPallet;
  printSettings?: PrintTemplateSettings;
}>(function QualityPalletInspectionPrint({ row, printSettings }, ref) {
  const defects = (row.defects || []).filter((defect) => defect.reasonLabel.trim() || defect.reasonCode.trim());
  return (
    <QualityPrintFrame
      ref={ref}
      title="تقرير فحص بالته AQL"
      scope={formatQualityDate(row.date)}
      printSettings={printSettings}
      meta={[
        { label: 'الخط', value: row.lineName },
        { label: 'المنتج', value: row.productCode ? `${row.productName} (${row.productCode})` : row.productName },
        { label: 'الوردية', value: row.shiftName || '—' },
        { label: 'أمر الشغل', value: row.workOrderNumber || '—' },
      ]}
    >
      <FactoryPrintTable
        printSettings={printSettings}
        tableLayout="auto"
        columns={[
          { key: 'pallet', header: 'البالتة' },
          { key: 'lot', header: 'الدفعة' },
          { key: 'sample', header: 'العينة' },
          { key: 'accept', header: 'القبول' },
          { key: 'reject', header: 'الرفض' },
          { key: 'inspected', header: 'المفحوص' },
          { key: 'defects', header: 'العيوب' },
          { key: 'status', header: 'الحالة' },
          { key: 'decision', header: 'القرار' },
        ]}
        rows={[{
          key: row.id,
          cells: {
            pallet: formatQualityCount(row.palletNumber),
            lot: formatQualityCount(row.quantityOnPallet),
            sample: formatQualityCount(row.sampleSizeRequired),
            accept: formatQualityCount(row.maxAllowedDefects),
            reject: formatQualityCount(row.rejectLimit),
            inspected: formatQualityCount(row.inspectedQuantity),
            defects: formatQualityCount(row.rejectedQuantity),
            status: row.inspectionStatus,
            decision: row.palletDecision,
          },
        }]}
      />
      <p>
        {`الاستلام ${row.receivedTime || '—'}`}
        {row.inspectionStartedAt ? ` — البدء ${row.inspectionStartedAt}` : ''}
        {row.inspectionCompletedAt ? ` — الإنهاء ${row.inspectionCompletedAt}` : ''}
        {row.inspectorName ? ` — المراقب ${row.inspectorName}` : ''}
      </p>
      {row.notes ? <p>{`ملاحظات: ${row.notes}`}</p> : null}
      {row.overrideReason ? <p>{`سبب التجاوز: ${row.overrideReason}`}</p> : null}
      {row.reopenReason ? <p>{`سبب إعادة الفتح: ${row.reopenReason}`}</p> : null}
      {defects.length > 0 ? (
        <FactoryPrintTable
          printSettings={printSettings}
          tableLayout="auto"
          columns={[
            { key: 'code', header: 'الكود' },
            { key: 'label', header: 'الوصف' },
            { key: 'count', header: 'العدد' },
            { key: 'notes', header: 'ملاحظة' },
          ]}
          rows={defects.map((defect, index) => ({
            key: defect.id || `${defect.reasonCode}-${index}`,
            cells: {
              code: defect.reasonCode || '—',
              label: defect.reasonLabel || '—',
              count: formatQualityCount(defect.count),
              notes: defect.notes || '—',
            },
          }))}
        />
      ) : null}
    </QualityPrintFrame>
  );
});

export const QualitySecondSortPrint = forwardRef<HTMLDivElement, {
  row: QualitySecondSortReport;
  includePhotos: boolean;
  printSettings?: PrintTemplateSettings;
}>(function QualitySecondSortPrint({ row, includePhotos, printSettings }, ref) {
  const fontPt = Math.round((row.fontScale || 100) / 10);
  return (
    <QualityPrintFrame
      ref={ref}
      title="تسليم الفرز الثاني"
      scope={formatQualityDate(row.reportDate)}
      printSettings={printSettings}
      paperWidth={SECOND_SORT_PAPER.width}
      minHeight={SECOND_SORT_PAPER.height}
      dense
      fontSize={`${fontPt}pt`}
      meta={[
        { label: 'الموديل', value: row.productCode ? `${row.productName} (${row.productCode})` : row.productName },
        { label: 'الكمية', value: formatQualityCount(row.quantity) },
        { label: 'نسبة الخصم', value: formatQualityShare(row.discountPercent / 100) },
        { label: 'الورق', value: SECOND_SORT_PAPER.labelAr },
      ]}
      signatures={(row.signatures || []).map((signature) => ({
        title: signature.title,
        detail: signature.name || 'الاسم / التوقيع',
      }))}
    >
      <p>{`المشكلة: ${row.problem}`}</p>
      <p>{`الاعتماد: ${row.approval || '—'}`}</p>
      {includePhotos && row.photos.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {row.photos.map((photo) => (
            <img key={photo.storagePath} src={photo.imageUrl} alt={row.problem} style={{ width: 120, maxWidth: '100%', height: 90, objectFit: 'contain' }} />
          ))}
        </div>
      ) : null}
      {!includePhotos && row.photos.length > 0 ? <p>الصور محفوظة في التخزين الخاص ولا تُعرض بهذه الصلاحية.</p> : null}
    </QualityPrintFrame>
  );
});
