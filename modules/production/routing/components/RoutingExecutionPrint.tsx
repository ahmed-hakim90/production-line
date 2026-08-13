import React from 'react';
import {
  FactoryPrintSectionTitle,
  FactoryPrintShell,
} from '@/src/components/erp/FactoryPrintShell';
import { FactoryPrintTable } from '@/src/components/erp/FactoryPrintTable';
import type { PrintTemplateSettings } from '@/types';
import { DEFAULT_PRINT_TEMPLATE } from '@/utils/dashboardConfig';
import { Factory_DEFAULT_FOOTER_TAGLINE } from '@/utils/imageExportTheme';
import { resolvePrintFont } from '@/utils/print/printFont';
import { resolvePrintDocumentConfig } from '@/utils/print/resolvePrintDocumentConfig';
import { formatDurationSeconds } from '../domain/calculations';
import { formatRoutingFirestoreInstant } from '../domain/formatFirestore';
import type { ProductionRoutingExecution, ProductionRoutingExecutionStep } from '../types';
import { resolvePrintAccentHex } from '@/utils/printTheme';

export interface RoutingExecutionPrintProps {
  execution: ProductionRoutingExecution | null;
  steps: ProductionRoutingExecutionStep[];
  productName: string;
  supervisorName: string;
  printSettings?: PrintTemplateSettings;
  exportRootId?: string;
}

const PAPER_DIMENSIONS: Record<string, { width: string; minHeight: string }> = {
  a4: { width: '210mm', minHeight: '297mm' },
  a5: { width: '148mm', minHeight: '210mm' },
  thermal: { width: '80mm', minHeight: 'auto' },
};

export const RoutingExecutionPrint = React.forwardRef<HTMLDivElement, RoutingExecutionPrintProps>(
  ({ execution, steps, productName, supervisorName, printSettings, exportRootId = 'routing-exec-print-root' }, ref) => {
    if (!execution) {
      return <div ref={ref} />;
    }

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
    const doc = resolvePrintDocumentConfig(ps, 'routingExecution');
    const font = resolvePrintFont(ps);
    const accent = resolvePrintAccentHex(ps.primaryColor);
    const paper = PAPER_DIMENSIONS[ps.paperSize] ?? PAPER_DIMENSIONS.a4;
    const isThermal = ps.paperSize === 'thermal';
    const dp = ps.decimalPlaces ?? 0;
    const now = new Date().toLocaleString('ar-EG');
    const refShort =
      execution.id.length > 12 ? `…${execution.id.slice(-8)}` : execution.id;
    const finishedLabel = formatRoutingFirestoreInstant(execution.finishedAt);

    const stdTotal = Number(execution.standardTotalTimeSeconds ?? 0);
    const actTotal = Number(execution.actualTotalTimeSeconds ?? 0);
    const effPct =
      execution.timeEfficiency != null ? `${(execution.timeEfficiency * 100).toFixed(1)}%` : '—';
    const laborEffPct =
      execution.laborEfficiency != null &&
      execution.timeEfficiency != null &&
      Math.abs(execution.timeEfficiency - execution.laborEfficiency) > 0.001
        ? `${(execution.laborEfficiency * 100).toFixed(1)}%`
        : null;

    const sortedSteps = [...steps].sort((a, b) => a.orderIndex - b.orderIndex);

    return (
      <FactoryPrintShell
        ref={ref}
        exportRootId={exportRootId}
        companyName={doc.headerText || 'مؤسسة المغربي للإستيراد'}
        documentType="تقرير تنفيذ مسار"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={accent}
        footerTagline={doc.footerText?.trim() || Factory_DEFAULT_FOOTER_TAGLINE}
        extraLines={doc.customLines}
        paperWidth={paper.width}
        minHeight={paper.minHeight}
        padding={isThermal ? '4mm 3mm' : ps.paperSize === 'a5' ? '8mm 9mm' : '10mm 12mm'}
        dense={isThermal}
        fontFamily={font.fontFamily}
        fontSize={isThermal ? font.denseFontSize : font.fontSize}
        metaCards={[
          { label: 'المرجع', value: refShort },
          { label: 'تاريخ الإنهاء', value: finishedLabel },
          { label: 'المسار', value: 'مسار إنتاج' },
          { label: 'المشرف', value: supervisorName || '—' },
        ]}
        kpis={
          doc.isFieldVisible('kpis')
            ? [
                { label: 'الكمية', value: execution.quantity, unit: 'وحدة', tone: 'indigo' as const },
                { label: 'الزمن القياسي', value: formatDurationSeconds(stdTotal) },
                { label: 'الزمن الفعلي', value: formatDurationSeconds(actTotal) },
                { label: 'كفاءة الزمن', value: effPct, tone: 'green' as const },
              ]
            : undefined
        }
        signatures={
          doc.isFieldVisible('signatures')
            ? [{ title: 'المشرف' }, { title: 'الاعتماد' }]
            : undefined
        }
      >
        {doc.isFieldVisible('productBlock') ? (
          <>
            <FactoryPrintSectionTitle title="المنتج والخطة" accent={accent} />
            <FactoryPrintTable
              dense={isThermal}
              brandAccent={accent}
              printSettings={ps}
              columns={[
                { key: 'label', header: 'البند', width: '40%' },
                { key: 'value', header: 'القيمة', width: '60%' },
              ]}
              rows={[
                {
                  key: 'product',
                  cells: {
                    label: 'المنتج',
                    value: <strong>{productName || '—'}</strong>,
                  },
                },
                {
                  key: 'plan',
                  cells: { label: 'إصدار الخطة', value: `v${execution.planVersion}` },
                },
                {
                  key: 'exec',
                  cells: { label: 'معرّف التنفيذ', value: execution.id },
                },
              ]}
            />
          </>
        ) : null}

        {doc.isFieldVisible('costs') ? (
          <>
            <FactoryPrintSectionTitle title="التكلفة والأداء" accent={accent} />
            <FactoryPrintTable
              dense={isThermal}
              brandAccent={accent}
              printSettings={ps}
              columns={[
                { key: 'label', header: 'البند', width: '45%' },
                { key: 'value', header: 'القيمة', width: '55%', align: 'center' },
              ]}
              rows={[
                {
                  key: 'cpu',
                  cells: {
                    label: 'تكلفة الوحدة',
                    value:
                      execution.costPerUnit != null && execution.costPerUnit > 0
                        ? `${execution.costPerUnit.toFixed(dp)} ج.م`
                        : '—',
                  },
                },
                {
                  key: 'total',
                  cells: {
                    label: 'إجمالي التكلفة',
                    value:
                      execution.totalCost != null && execution.totalCost > 0
                        ? `${execution.totalCost.toFixed(dp)} ج.م`
                        : '—',
                  },
                },
                {
                  key: 'rate',
                  cells: {
                    label: 'أجر الساعة المستخدم',
                    value:
                      execution.workerHourRateUsed != null && execution.workerHourRateUsed > 0
                        ? `${execution.workerHourRateUsed.toFixed(dp)} ج.م/ساعة`
                        : '—',
                  },
                },
                ...(laborEffPct
                  ? [
                      {
                        key: 'labor',
                        cells: {
                          label: 'كفاءة العمالة (إصدار قديم)',
                          value: laborEffPct,
                        },
                      },
                    ]
                  : []),
              ]}
            />
          </>
        ) : null}

        {doc.isFieldVisible('steps') ? (
          <>
            <FactoryPrintSectionTitle title="خطوات التنفيذ" accent={accent} />
            <FactoryPrintTable
              dense={isThermal}
              brandAccent={accent}
              printSettings={ps}
              columns={[
                { key: 'step', header: 'الخطوة', width: '40%' },
                { key: 'detail', header: 'القياسي / الفعلي', width: '60%' },
              ]}
              rows={
                sortedSteps.length > 0
                  ? sortedSteps.map((st, idx) => {
                      const act = st.actualDurationSeconds ?? 0;
                      const actW = st.actualWorkersCount ?? st.standardWorkersCount;
                      return {
                        key: `step-${st.orderIndex}-${idx}`,
                        cells: {
                          step: `الخطوة ${idx + 1} — ${st.name || '—'}`,
                          detail: `قياسي ${formatDurationSeconds(st.standardDurationSeconds)} (${st.standardWorkersCount} عامل) | فعلي ${formatDurationSeconds(act)} (${actW} عامل)`,
                        },
                      };
                    })
                  : [
                      {
                        key: 'empty',
                        cells: {
                          step: 'الخطوات',
                          detail: 'لا تتوفر تفاصيل خطوات في التقرير.',
                        },
                      },
                    ]
              }
            />
          </>
        ) : null}
      </FactoryPrintShell>
    );
  },
);

RoutingExecutionPrint.displayName = 'RoutingExecutionPrint';
