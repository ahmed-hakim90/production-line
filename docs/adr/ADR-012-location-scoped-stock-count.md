# ADR-012: Location- and rack-scoped stock counts

## Decision

Stock-count sessions may target an entire warehouse, one active rack, or one active warehouse location.

- A location count stores `countScope: location`, `locationId`, and immutable location/rack labels on the session.
- A rack count stores `countScope: rack`, `rackId`, and a rack label on the session, but each line still carries its own `locationId`/`locationCode` — one row per item per shelf inside the rack, never an aggregated per-item total across shelves.
- Session creation is server-validated against the current `stock_location_balances` rows for that location/rack.
- The count screen selects warehouse → scope → rack → (location, for a single-shelf count) before creating the session.
- Approval posts ordinary `ADJUSTMENT` ledger rows carrying each line's own `locationId`. The existing movement transaction updates that shelf's location balance and the warehouse aggregate by the same delta — so a rack count's differences post to each shelf individually, never as one merged difference dumped on a random shelf.
- Legacy sessions without `countScope` remain warehouse-scoped.
- A location or rack session must never run the maintenance-center aggregate absolute-balance synchronization: `line.countedQty` there is a single shelf's balance, not the warehouse total, so overwriting the repair ledger's absolute quantity with it would corrupt stock for any material stored outside that shelf/rack. Its ordinary adjustment movements are the source of truth instead.

## Consequences

Printing a rack or shelf remains a presentation option, while creating a location- or rack-scoped session is now a separate inventory mutation scope. Deploy the Functions change with the client so location/rack snapshots are validated server-side. The count-review modal must render the shelf per line for rack sessions (and key rows by item+location, not item alone) since the same item can legitimately appear once per shelf.
