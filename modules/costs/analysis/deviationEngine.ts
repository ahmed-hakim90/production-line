import type {
  AnalyzeDeviationInput,
  DeviationAnalysis,
  DeviationReason,
} from './costDeviationTypes';

const QTY_REL_THRESHOLD = 0.1;
/** تغيّر نسبي في تكلفة / وحدة مباشر أو غير مباشر يُعتبر مهمًا */
const PU_REL_THRESHOLD = 0.08;

const NOTE_PATTERNS = {
  maintenance: /صيانة|صيانه|maintenance/i,
  quality: /صوت|مشكلة|مشكله|جودة|quality|defect/i,
  rework: /إعادة|اعاده|rework|إصلاح/i,
  downtime: /توقف|تعطل|downtime/i,
} as const;

export function noteSignalsFromText(text: string): { maintenance: boolean; quality: boolean; rework: boolean } {
  const t = text || '';
  return {
    maintenance: NOTE_PATTERNS.maintenance.test(t),
    quality: NOTE_PATTERNS.quality.test(t),
    rework: NOTE_PATTERNS.rework.test(t),
  };
}

function relDelta(prev: number, curr: number): number {
  const p = Math.abs(prev);
  if (p < 1e-9) return curr > 1e-9 ? 1 : 0;
  return (curr - prev) / p;
}

function confidenceFromScores(weights: number[]): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  return Math.min(100, Math.round((sum / 14) * 100));
}

/**
 * محرك قواعد خالص — لا يعتمد على Firestore أو React.
 */
export function analyzeDeviation(input: AnalyzeDeviationInput): DeviationAnalysis {
  const { current, previous, notes, isStale } = input;

  if (isStale) {
    return {
      valid: false,
      message: 'البيانات غير محدثة — يرجى إعادة «حساب الكل» قبل الاعتماد على التحليل.',
      reasons: [],
      confidence: 0,
      summary: 'بيانات قديمة',
    };
  }

  if (!previous.closed || !(previous.avg > 0)) {
    return {
      valid: false,
      message: 'الشهر السابق غير مغلق أو بلا متوسط معتمد — لا يمكن تحليل الانحراف مقارنة بالشهر السابق.',
      reasons: [],
      confidence: 0,
      summary: 'لا يوجد معيار للمقارنة',
    };
  }

  const deviation = current.avg - previous.avg;
  const deviationPercent = previous.avg > 0 ? deviation / previous.avg : 0;

  const reasons: DeviationReason[] = [];

  const prevQty = Math.max(0, previous.qty);
  const qtyChange = prevQty > 0 ? (current.qty - prevQty) / prevQty : current.qty > 0 ? 1 : 0;

  if (qtyChange < -QTY_REL_THRESHOLD && deviation > 0) {
    reasons.push({
      id: 'low_qty',
      title: 'انخفاض حجم الإنتاج يرفع تكلفة الوحدة (استيعاب غير مباشر)',
      impact: 'high',
      direction: 'increase',
      score: 4,
      evidence: [`تغيّر الكمية عن الشهر السابق: ${(qtyChange * 100).toFixed(1)}%`],
      supportedByNotes: false,
    });
  }

  if (qtyChange > QTY_REL_THRESHOLD && deviation < 0) {
    reasons.push({
      id: 'high_qty',
      title: 'زيادة حجم الإنتاج خفّضت متوسط تكلفة الوحدة',
      impact: 'high',
      direction: 'decrease',
      score: 4,
      evidence: [`تغيّر الكمية عن الشهر السابق: ${(qtyChange * 100).toFixed(1)}%`],
      supportedByNotes: false,
    });
  }

  const relDirect = relDelta(previous.directPU, current.directPU);
  const relIndirect = relDelta(previous.indirectPU, current.indirectPU);

  if (deviation > 0 && relIndirect > PU_REL_THRESHOLD && current.indirectPU > previous.indirectPU) {
    reasons.push({
      id: 'indirect_increase',
      title: 'ارتفاع التكلفة غير المباشرة لكل وحدة',
      impact: 'high',
      direction: 'increase',
      score: 4,
      evidence: [
        `غير مباشر/وحدة: ${previous.indirectPU.toFixed(2)} → ${current.indirectPU.toFixed(2)} ج.م (Δ${(relIndirect * 100).toFixed(1)}%)`,
      ],
      supportedByNotes: false,
    });
  }

  if (deviation < 0 && relIndirect < -PU_REL_THRESHOLD && current.indirectPU < previous.indirectPU) {
    reasons.push({
      id: 'indirect_decrease',
      title: 'انخفاض التكلفة غير المباشرة لكل وحدة',
      impact: 'high',
      direction: 'decrease',
      score: 4,
      evidence: [
        `غير مباشر/وحدة: ${previous.indirectPU.toFixed(2)} → ${current.indirectPU.toFixed(2)} ج.م`,
      ],
      supportedByNotes: false,
    });
  }

  if (deviation > 0 && relDirect > PU_REL_THRESHOLD && current.directPU > previous.directPU) {
    reasons.push({
      id: 'direct_increase',
      title: 'زيادة التكلفة المباشرة لكل وحدة (عمالة / ساعات)',
      impact: 'medium',
      direction: 'increase',
      score: 3,
      evidence: [
        `مباشر/وحدة: ${previous.directPU.toFixed(2)} → ${current.directPU.toFixed(2)} ج.م (Δ${(relDirect * 100).toFixed(1)}%)`,
      ],
      supportedByNotes: false,
    });
  }

  if (deviation < 0 && relDirect < -PU_REL_THRESHOLD && current.directPU < previous.directPU) {
    reasons.push({
      id: 'direct_decrease',
      title: 'انخفاض التكلفة المباشرة لكل وحدة',
      impact: 'medium',
      direction: 'decrease',
      score: 3,
      evidence: [
        `مباشر/وحدة: ${previous.directPU.toFixed(2)} → ${current.directPU.toFixed(2)} ج.م`,
      ],
      supportedByNotes: false,
    });
  }

  const notesText = notes.filter(Boolean).join(' ');
  const sig = noteSignalsFromText(notesText);

  if (NOTE_PATTERNS.downtime.test(notesText) && deviation > 0) {
    reasons.push({
      id: 'note_downtime',
      title: 'إشارات توقف / تعطل في ملاحظات التقارير',
      impact: 'medium',
      direction: 'increase',
      score: 2,
      evidence: ['ذُكر في ملاحظات تقارير الإنتاج'],
      supportedByNotes: true,
    });
  }

  if (sig.maintenance && deviation > 0) {
    const target = reasons.find((r) => r.id === 'indirect_increase' || r.id === 'low_qty');
    if (target) {
      target.score += 1;
      target.supportedByNotes = true;
      target.evidence.push('مدعوم بملاحظات صيانة');
    } else {
      reasons.push({
        id: 'note_maintenance',
        title: 'صيانة مذكورة في التقارير',
        impact: 'medium',
        direction: 'increase',
        score: 2,
        evidence: ['مذكورة في ملاحظات الإنتاج'],
        supportedByNotes: true,
      });
    }
  }

  if (sig.quality && deviation > 0) {
    const target = reasons.find((r) => r.id === 'direct_increase' || r.id === 'indirect_increase');
    if (target) {
      target.score += 1;
      target.supportedByNotes = true;
      target.evidence.push('مدعوم بملاحظات جودة');
    } else {
      reasons.push({
        id: 'note_quality',
        title: 'إشارات جودة في ملاحظات التقارير',
        impact: 'medium',
        direction: 'increase',
        score: 2,
        evidence: ['مذكورة في ملاحظات الإنتاج'],
        supportedByNotes: true,
      });
    }
  }

  if (sig.rework && deviation > 0) {
    reasons.push({
      id: 'note_rework',
      title: 'إعادة عمل / إصلاح مذكور في التقارير',
      impact: 'medium',
      direction: 'increase',
      score: 2,
      evidence: ['مذكورة في ملاحظات الإنتاج'],
      supportedByNotes: true,
    });
  }

  reasons.sort((a, b) => b.score - a.score);

  const weights = reasons.map((r) => r.score);
  const confidence = confidenceFromScores(weights);

  const top = reasons[0];
  const summary = top
    ? `السبب الأبرز: ${top.title}`
    : deviation === 0
      ? 'لا انحراف في متوسط تكلفة الوحدة عن الشهر السابق المعتمد'
      : 'راجع تفصيل المباشر/غير المباشر والكمية';

  return {
    valid: true,
    deviation,
    deviationPercent,
    reasons,
    topReason: top,
    confidence,
    summary,
  };
}
