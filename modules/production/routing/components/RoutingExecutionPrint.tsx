import React from 'react';
import { PrintReportLayout } from '@/src/components/erp/PrintReportLayout';
import type { PrintTemplateSettings } from '@/types';
import { DEFAULT_PRINT_TEMPLATE } from '@/utils/dashboardConfig';
import { formatDurationSeconds } from '../domain/calculations';
import { formatRoutingFirestoreInstant } from '../domain/formatFirestore';
import type { ProductionRoutingExecution, ProductionRoutingExecutionStep } from '../types';

export interface RoutingExecutionPrintProps {
  execution: ProductionRoutingExecution | null;
  steps: ProductionRoutingExecutionStep[];
  productName: string;
  supervisorName: string;
  printSettings?: PrintTemplateSettings;
  exportRootId?: string;
}

export const RoutingExecutionPrint = React.forwardRef<HTMLDivElement, RoutingExecutionPrintProps>(
  ({ execution, steps, productName, supervisorName, printSettings, exportRootId = 'routing-exec-print-root' }, ref) => {
    if (!execution) {
      return <div ref={ref} />;
    }

    const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
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

    const stepRows =
      sortedSteps.length > 0
        ? sortedSteps.map((st, idx) => {
            const act = st.actualDurationSeconds ?? 0;
            const actW = st.actualWorkersCount ?? st.standardWorkersCount;
            return {
              label: `الخطوة ${idx + 1} — ${st.name || '—'}`,
              value: `قياسي ${formatDurationSeconds(st.standardDurationSeconds)} (${st.standardWorkersCount} عامل) | فعلي ${formatDurationSeconds(act)} (${actW} عامل)`,
            };
          })
        : [{ label: 'الخطوات', value: 'لا تتوفر تفاصيل خطوات في التقرير.' }];

    return (
      <PrintReportLayout
        ref={ref}
        exportRootId={exportRootId}
        companyName={ps.headerText || 'مؤسسة المغربي للإستيراد'}
        reportType="تقرير تنفيذ مسار"
        printDate={now}
        logoUrl={ps.logoUrl}
        brandAccent={ps.primaryColor}
        footerTagline={ps.footerText?.trim() || undefined}
        paperSize={ps.paperSize}
        orientation={ps.orientation}
        meta={{
          reportNumber: refShort,
          reportDate: finishedLabel,
          lineName: 'مسار إنتاج',
          supervisorName: supervisorName || '—',
        }}
        kpis={[
          {
            label: 'الكمية',
            value: execution.quantity,
            unit: 'وحدة',
            color: 'indigo',
          },
          {
            label: 'الزمن القياسي',
            value: formatDurationSeconds(stdTotal),
            color: 'default',
          },
          {
            label: 'الزمن الفعلي',
            value: formatDurationSeconds(actTotal),
            color: 'default',
          },
          {
            label: 'كفاءة الزمن',
            value: effPct,
            color: 'green',
          },
        ]}
        sections={[
          {
            title: 'المنتج والخطة',
            rows: [
              { label: 'المنتج', value: productName || '—', highlight: true },
              { label: 'إصدار الخطة', value: `v${execution.planVersion}` },
              { label: 'معرّف التنفيذ', value: execution.id },
            ],
          },
          {
            title: 'التكلفة والأداء',
            rows: [
              {
                label: 'تكلفة الوحدة',
                value:
                  execution.costPerUnit != null && execution.costPerUnit > 0
                    ? `${execution.costPerUnit.toFixed(dp)} ج.م`
                    : '—',
              },
              {
                label: 'إجمالي التكلفة',
                value:
                  execution.totalCost != null && execution.totalCost > 0
                    ? `${execution.totalCost.toFixed(dp)} ج.م`
                    : '—',
              },
              {
                label: 'أجر الساعة المستخدم',
                value:
                  execution.workerHourRateUsed != null && execution.workerHourRateUsed > 0
                    ? `${execution.workerHourRateUsed.toFixed(dp)} ج.م/ساعة`
                    : '—',
              },
              ...(laborEffPct
                ? [
                    {
                      label: 'كفاءة العمالة (إصدار قديم)',
                      value: laborEffPct,
                    },
                  ]
                : []),
            ],
          },
          {
            title: 'خطوات التنفيذ',
            rows: stepRows,
          },
        ]}
        signatures={[{ title: 'المشرف' }, { title: 'مدير الإنتاج' }]}
      />
    );
  },
);

RoutingExecutionPrint.displayName = 'RoutingExecutionPrint';
