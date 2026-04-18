import type { BostaApiDeliveryRow } from '../../auth/services/firebase';
import type { OnlineDispatchShipment } from '../../../types';
import { extractBostaTrackingDigits } from '../services/onlineDispatchService';

export type BostaApiMergedRow = {
  api: BostaApiDeliveryRow;
  local: (OnlineDispatchShipment & { id: string }) | null;
};

export function buildTrackingToLocalMap(
  rows: Array<OnlineDispatchShipment & { id: string }>,
): Map<string, OnlineDispatchShipment & { id: string }> {
  const m = new Map<string, OnlineDispatchShipment & { id: string }>();
  for (const r of rows) {
    const digits = extractBostaTrackingDigits(r.barcode);
    if (digits) m.set(digits, r);
  }
  return m;
}

export function mergeBostaApiWithLocal(
  apiItems: BostaApiDeliveryRow[],
  trackingMap: Map<string, OnlineDispatchShipment & { id: string }>,
): BostaApiMergedRow[] {
  return apiItems.map((api) => ({
    api,
    local: trackingMap.get(api.trackingNumber) ?? null,
  }));
}
