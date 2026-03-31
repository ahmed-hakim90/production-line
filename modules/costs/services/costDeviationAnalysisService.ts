import {
  doc,
  getDocs,
  limit,
  orderBy,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type { DeviationReason } from '../analysis/costDeviationTypes';

const COLLECTION = 'cost_deviation_analysis';

function snapshotDocId(productId: string, month: string): string {
  return `${productId}_${month}`;
}

export type DeviationHistoryRow = {
  month: string;
  deviation: number;
  deviationPercent: number;
  hasQualitySignal: boolean;
  hasMaintenanceSignal: boolean;
  hasReworkSignal: boolean;
};

export async function upsertDeviationSnapshot(params: {
  productId: string;
  month: string;
  deviation: number;
  deviationPercent: number;
  reasons: DeviationReason[];
  confidence: number;
  summary: string;
  hasQualitySignal: boolean;
  hasMaintenanceSignal: boolean;
  hasReworkSignal: boolean;
}): Promise<void> {
  if (!isConfigured) return;
  const tenantId = getCurrentTenantId();
  const id = snapshotDocId(params.productId, params.month);
  const topReason = params.reasons[0];
  await setDoc(
    doc(db, COLLECTION, id),
    {
      tenantId,
      productId: params.productId,
      month: params.month,
      deviation: params.deviation,
      deviationPercent: params.deviationPercent,
      topReasonId: topReason?.id ?? null,
      reasons: params.reasons,
      confidence: params.confidence,
      summary: params.summary,
      hasQualitySignal: params.hasQualitySignal,
      hasMaintenanceSignal: params.hasMaintenanceSignal,
      hasReworkSignal: params.hasReworkSignal,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getDeviationHistory(
  productId: string,
  maxMonths = 6,
): Promise<DeviationHistoryRow[]> {
  if (!isConfigured) return [];
  try {
    const q = tenantQuery(
      db,
      COLLECTION,
      where('productId', '==', productId),
      orderBy('month', 'desc'),
      limit(maxMonths),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        month: String(data.month || ''),
        deviation: Number(data.deviation ?? 0),
        deviationPercent: Number(data.deviationPercent ?? 0),
        hasQualitySignal: Boolean(data.hasQualitySignal),
        hasMaintenanceSignal: Boolean(data.hasMaintenanceSignal),
        hasReworkSignal: Boolean(data.hasReworkSignal),
      };
    });
  } catch (e) {
    console.error('costDeviationAnalysisService.getDeviationHistory', e);
    return [];
  }
}
