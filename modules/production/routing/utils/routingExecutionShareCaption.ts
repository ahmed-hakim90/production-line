import type { PrintTemplateSettings } from '@/types';
import { DEFAULT_PRINT_TEMPLATE } from '@/utils/dashboardConfig';
import { formatDurationSeconds } from '../domain/calculations';
import { formatRoutingFirestoreInstant } from '../domain/formatFirestore';
import type { ProductionRoutingExecution } from '../types';

/**
 * Plain-text caption aligned with RoutingExecutionPrint / PrintReportLayout order (no step-by-step routing detail).
 */
export function formatRoutingExecutionShareCaption(
  execution: ProductionRoutingExecution,
  productName: string,
  supervisorName: string,
  printSettings?: PrintTemplateSettings,
): string {
  const ps = { ...DEFAULT_PRINT_TEMPLATE, ...printSettings };
  const dp = ps.decimalPlaces ?? 0;
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

  const company = ps.headerText || 'مؤسسة المغربي للإستيراد';

  const blocks = [
    company,
    'تقرير تنفيذ مسار',
    '—',
    'بيانات التقرير',
    `رقم المرجع: ${refShort}`,
    `تاريخ الإنهاء: ${finishedLabel}`,
    `الإشراف: ${supervisorName || '—'}`,
    '—',
    'المؤشرات',
    `الكمية: ${execution.quantity} وحدة`,
    `الزمن القياسي: ${formatDurationSeconds(stdTotal)}`,
    `الزمن الفعلي: ${formatDurationSeconds(actTotal)}`,
    `كفاءة الزمن: ${effPct}`,
    '—',
    'المنتج والخطة',
    `المنتج: ${productName || '—'}`,
    `إصدار الخطة: v${execution.planVersion}`,
    `معرّف التنفيذ: ${execution.id}`,
    '—',
    'التكلفة والأداء',
    `تكلفة الوحدة: ${
      execution.costPerUnit != null && execution.costPerUnit > 0
        ? `${execution.costPerUnit.toFixed(dp)} ج.م`
        : '—'
    }`,
    `إجمالي التكلفة: ${
      execution.totalCost != null && execution.totalCost > 0
        ? `${execution.totalCost.toFixed(dp)} ج.م`
        : '—'
    }`,
    `أجر الساعة المستخدم: ${
      execution.workerHourRateUsed != null && execution.workerHourRateUsed > 0
        ? `${execution.workerHourRateUsed.toFixed(dp)} ج.م/ساعة`
        : '—'
    }`,
    ...(laborEffPct ? [`كفاءة العمالة (إصدار قديم): ${laborEffPct}`] : []),
  ];

  return blocks.join('\n');
}
