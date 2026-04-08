import type { OnlineDispatchShipment } from '../../../types';

/** Who created the shipment row (admin UI) or first meaningful registration when legacy. */
export function onlineDispatchCreatorUid(r: OnlineDispatchShipment): string | undefined {
  if (r.createdByUid) return r.createdByUid;
  if (r.status === 'pending') return undefined;
  return r.handedToWarehouseByUid;
}

/** Who last moved the shipment to its current `status` (explicit field or legacy inference). */
export function onlineDispatchLastStatusActorUid(r: OnlineDispatchShipment): string | undefined {
  if (r.lastStatusByUid) return r.lastStatusByUid;
  if (r.status === 'handed_to_post') return r.handedToPostByUid;
  if (r.status === 'at_warehouse') return r.handedToWarehouseByUid;
  return undefined;
}
