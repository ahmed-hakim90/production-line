# Firebase low-read rollout

Use this order so old documents remain searchable while the UI is switched to cursor queries.

1. Deploy the writer/aggregate Functions.
2. Deploy `firestore.indexes.json` and `firestore.rules`.
3. Run both backfills in dry-run mode for one tenant.
4. Apply the backfills for that tenant and verify the reported read/write counts.
5. Deploy the SPA.

```bash
npm --prefix functions run build
firebase deploy --only functions:aggregateProductionReports
firebase deploy --only firestore:indexes,firestore:rules

npm --prefix functions run backfill:search:dry -- --tenant TENANT_ID
npm --prefix functions run backfill:dashboardStats:dry -- --tenant TENANT_ID

npm --prefix functions run backfill:search:apply -- --tenant TENANT_ID
npm --prefix functions run backfill:dashboardStats:apply -- --tenant TENANT_ID
```

The search backfill processes 400 documents per batch. To resume a specific collection from its last logged document id:

```bash
npm --prefix functions run backfill:search:apply -- \
  --tenant TENANT_ID --collection products --start-after LAST_DOCUMENT_ID
```

Run the same sequence independently for every tenant. Full catalog/report reads remain reserved for explicit import, migration, backup, and export operations.
