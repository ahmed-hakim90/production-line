import { useEffect, useMemo, useRef, useState } from 'react';
import type { MonthlyProductionCost } from '../../../types';
import { analyzeDeviation, noteSignalsFromText } from '../analysis/deviationEngine';
import type { DeviationAnalysis, PreviousCostSlice } from '../analysis/costDeviationTypes';
import {
  buildTrendAlert,
  computeTrendFlags,
  enrichAnalysisWithChronic,
  type HistoryRow,
} from '../analysis/trendAnalyzer';
import {
  getDeviationHistory,
  upsertDeviationSnapshot,
  type DeviationHistoryRow,
} from '../services/costDeviationAnalysisService';
import { monthlyProductionCostService } from '../services/monthlyProductionCostService';

type PrevInfo = { avg: number; closed: boolean };

function getPreviousMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return month;
  const date = new Date(year, mon - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildPreviousSlice(
  row: MonthlyProductionCost | null,
  prevInfo: PrevInfo | undefined,
): PreviousCostSlice {
  const closed = !!prevInfo?.closed;
  const avg =
    closed && (prevInfo?.avg ?? 0) > 0
      ? Number(prevInfo!.avg)
      : Number(row?.averageUnitCost ?? 0);
  const qty = Math.max(0, Number(row?.totalProducedQty ?? 0));
  const d = Number(row?.directCost ?? 0);
  const ind = Number(row?.indirectCost ?? 0);
  return {
    closed,
    avg,
    qty,
    directPU: qty > 0 ? d / qty : 0,
    indirectPU: qty > 0 ? ind / qty : 0,
  };
}

export type DeviationAnalysisState = {
  analysis: DeviationAnalysis | null;
  history: DeviationHistoryRow[];
  historyForTrend: HistoryRow[];
  alert: string | null;
  loading: boolean;
};

const cache = new Map<string, { state: DeviationAnalysisState; ts: number }>();
const CACHE_MS = 45_000;

function cacheKey(productId: string, month: string, stale: boolean, notesDigest: string): string {
  return `${productId}|${month}|${stale ? '1' : '0'}|${notesDigest}`;
}

export function useDeviationAnalysis(params: {
  enabled: boolean;
  productId: string | null;
  month: string;
  currentRecord: MonthlyProductionCost | null;
  getNormalizedBreakdown: (r: MonthlyProductionCost) => { directCost: number; indirectCost: number };
  prevMonthInfo: PrevInfo | undefined;
  isStale: boolean;
  noteTexts: string[];
}): DeviationAnalysisState {
  const {
    enabled,
    productId,
    month,
    currentRecord,
    getNormalizedBreakdown,
    prevMonthInfo,
    isStale,
    noteTexts,
  } = params;

  const [state, setState] = useState<DeviationAnalysisState>({
    analysis: null,
    history: [],
    historyForTrend: [],
    alert: null,
    loading: false,
  });

  const notesDigest = useMemo(() => noteTexts.join('\u0001'), [noteTexts]);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let ac: AbortController | null = null;

    if (!enabled || !productId || !currentRecord) {
      setState({
        analysis: null,
        history: [],
        historyForTrend: [],
        alert: null,
        loading: false,
      });
      return () => {
        ac?.abort();
      };
    }

    const key = cacheKey(productId, month, isStale, notesDigest);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_MS) {
      setState(hit.state);
      return () => {
        ac?.abort();
      };
    }

    abortRef.current?.abort();
    ac = new AbortController();
    abortRef.current = ac;

    setState((s) => ({ ...s, loading: true }));

    void (async () => {
      try {
        const prevMonth = getPreviousMonth(month);
        const prevRow = await monthlyProductionCostService.getByProductAndMonth(productId, prevMonth);
        if (ac.signal.aborted) return;

        const prevSlice = buildPreviousSlice(prevRow, prevMonthInfo);
        const qty = Math.max(0, currentRecord.totalProducedQty || 0);
        const norm = getNormalizedBreakdown(currentRecord);
        const currentSlice = {
          avg: Number(currentRecord.averageUnitCost || 0),
          qty,
          directPU: qty > 0 ? norm.directCost / qty : 0,
          indirectPU: qty > 0 ? norm.indirectCost / qty : 0,
        };

        let analysis = analyzeDeviation({
          current: currentSlice,
          previous: prevSlice,
          notes: noteTexts,
          isStale,
        });

        const flagsText = noteTexts.join(' ');
        const sig = noteSignalsFromText(flagsText);

        if (analysis.valid && analysis.deviation !== undefined && analysis.deviationPercent !== undefined) {
          try {
            await upsertDeviationSnapshot({
              productId,
              month,
              deviation: analysis.deviation,
              deviationPercent: analysis.deviationPercent,
              reasons: analysis.reasons,
              confidence: analysis.confidence,
              summary: analysis.summary,
              hasQualitySignal: sig.quality,
              hasMaintenanceSignal: sig.maintenance,
              hasReworkSignal: sig.rework,
            });
          } catch {
            /* persist optional */
          }
        }

        const history = await getDeviationHistory(productId, 6);
        if (ac.signal.aborted) return;

        const historyForTrend: HistoryRow[] = history.map((h) => ({
          month: h.month,
          deviation: h.deviation,
          deviationPercent: h.deviationPercent,
          hasQualitySignal: h.hasQualitySignal,
          hasMaintenanceSignal: h.hasMaintenanceSignal,
          hasReworkSignal: h.hasReworkSignal,
        }));

        const trendFlags = computeTrendFlags(historyForTrend);
        if (analysis.valid) {
          analysis = enrichAnalysisWithChronic(analysis, trendFlags);
        }
        const alert = buildTrendAlert(trendFlags, historyForTrend);

        const next: DeviationAnalysisState = {
          analysis,
          history,
          historyForTrend,
          alert,
          loading: false,
        };
        cache.set(key, { state: next, ts: Date.now() });
        setState(next);
      } catch {
        if (!ac.signal.aborted) {
          setState({
            analysis: null,
            history: [],
            historyForTrend: [],
            alert: null,
            loading: false,
          });
        }
      }
    })();

    return () => {
      ac?.abort();
    };
  }, [
    enabled,
    productId,
    month,
    currentRecord,
    getNormalizedBreakdown,
    prevMonthInfo,
    isStale,
    noteTexts,
    notesDigest,
  ]);

  return state;
}
