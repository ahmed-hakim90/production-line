import { useMemo } from 'react';
import type { OnlineDispatchShipment } from '../../../types';
import type { BostaApiDeliveryRow } from '../../auth/services/firebase';
import { buildTrackingToLocalMap, mergeBostaApiWithLocal } from '../utils/bostaApiMerge';

export function useMergedBostaRows(
  apiItems: BostaApiDeliveryRow[],
  tenantRows: Array<OnlineDispatchShipment & { id: string }>,
) {
  return useMemo(
    () => mergeBostaApiWithLocal(apiItems, buildTrackingToLocalMap(tenantRows)),
    [apiItems, tenantRows],
  );
}
