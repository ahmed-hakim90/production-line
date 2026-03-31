import type { DeviationAnalysis, DeviationReason } from './costDeviationTypes';

export type HistoryRow = {
  month: string;
  deviation: number;
  deviationPercent: number;
  hasQualitySignal: boolean;
  hasMaintenanceSignal: boolean;
  hasReworkSignal: boolean;
};

export type TrendFlags = {
  consistentIncrease: boolean;
  qualityIssue: boolean;
  maintenanceIssue: boolean;
  spikeThisMonth: boolean;
};

const INCREASE_MONTHS_MIN = 3;
const SIGNAL_MONTHS_MIN = 3;

export function computeTrendFlags(history: HistoryRow[]): TrendFlags {
  const sorted = [...history].sort((a, b) => b.month.localeCompare(a.month));
  const increases = sorted.filter((h) => h.deviation > 0).length;
  const quality = sorted.filter((h) => h.hasQualitySignal).length;
  const maintenance = sorted.filter((h) => h.hasMaintenanceSignal).length;
  const latest = sorted[0];
  const spikeThisMonth =
    latest != null && Number(latest.deviationPercent) > 0.2;

  return {
    consistentIncrease: increases >= INCREASE_MONTHS_MIN,
    qualityIssue: quality >= SIGNAL_MONTHS_MIN,
    maintenanceIssue: maintenance >= SIGNAL_MONTHS_MIN,
    spikeThisMonth,
  };
}

/** رسالة تنبيه واحدة (الأولوية: جودة مزمنة، ثم صيانة، ثم ارتفاع حاد) */
export function buildTrendAlert(flags: TrendFlags, history: HistoryRow[]): string | null {
  if (flags.qualityIssue && flags.consistentIncrease) {
    return 'تحذير: إشارات جودة متكررة مع ارتفاع متكرر في تكلفة الوحدة — راجع الجودة والتكلفة على المدى القصير.';
  }
  if (flags.maintenanceIssue) {
    return 'تحذير: صيانة متكررة مسجّلة في تحليلات الأشهر الأخيرة — قد تؤثر على كفاءة الإنتاج والتكلفة.';
  }
  const sorted = [...history].sort((a, b) => b.month.localeCompare(a.month));
  const latest = sorted[0];
  if (latest && latest.deviationPercent > 0.2) {
    return 'تحذير: ارتفاع كبير في تكلفة الوحدة عن الشهر السابق لهذا الشهر.';
  }
  return null;
}

const CHRONIC_QUALITY: DeviationReason = {
  id: 'chronic_quality',
  title: 'نمط جودة متكرر عبر عدة أشهر (من سجل التحليلات)',
  impact: 'high',
  direction: 'increase',
  score: 5,
  evidence: ['تكرار إشارات الجودة في لقطات التحليل المخزّنة'],
  supportedByNotes: true,
};

const CHRONIC_MAINTENANCE: DeviationReason = {
  id: 'chronic_maintenance',
  title: 'صيانة متكررة عبر عدة أشهر (من سجل التحليلات)',
  impact: 'high',
  direction: 'increase',
  score: 4,
  evidence: ['تكرار إشارات الصيانة في لقطات التحليل المخزّنة'],
  supportedByNotes: true,
};

export function enrichAnalysisWithChronic(
  analysis: DeviationAnalysis,
  flags: TrendFlags,
): DeviationAnalysis {
  if (!analysis.valid || !analysis.reasons) return analysis;
  const reasons = [...analysis.reasons];
  let boosted = false;
  if (flags.qualityIssue && flags.consistentIncrease && (analysis.deviation ?? 0) > 0) {
    reasons.unshift({ ...CHRONIC_QUALITY });
    boosted = true;
  } else if (flags.maintenanceIssue) {
    reasons.unshift({ ...CHRONIC_MAINTENANCE });
    boosted = true;
  }
  if (!boosted) return analysis;
  reasons.sort((a, b) => b.score - a.score);
  const sum = reasons.reduce((s, r) => s + r.score, 0);
  const confidence = Math.min(100, Math.round((sum / 16) * 100));
  const top = reasons[0];
  return {
    ...analysis,
    reasons,
    topReason: top,
    confidence,
    summary: top ? `السبب الأبرز: ${top.title}` : analysis.summary,
  };
}
