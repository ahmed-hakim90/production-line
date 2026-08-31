# ADR-012 — Production gate offline queue

## Decision

The production gate keeps a device-scoped, minimal cache of active employees and an ordered local queue of gate events. The cache is permission-gated and contains only the employee identity and current gate preview required by the gate screen.

Every registration has a stable client-generated `eventId`, the device timestamp, and the expected action. Reconnect synchronization is sequential. The server stores an idempotency receipt in `production_gate_events` in the same transaction as the session/state mutation. A retry therefore returns the original result instead of creating another movement.

## Conflict and time policy

- Server authorization and the server-side state remain authoritative.
- Offline timestamps may be at most five minutes in the future and 36 hours old.
- An event older than the employee's latest accepted action, or whose expected action conflicts with server state, fails into manual review.
- Failed events remain on the gate device until explicitly retried; successful events are removed only after server acknowledgement.
- The device displays connection, pending, syncing, and failed-review states. Cached identity lookup remains available without a network connection.

## Operational constraint

The gate should run on a dedicated device whose clock and browser profile are controlled. Clearing browser site data removes unsynchronized events, so operators must resolve the pending counter before browser maintenance or device replacement.
