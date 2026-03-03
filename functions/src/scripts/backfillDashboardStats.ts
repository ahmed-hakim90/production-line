import { initializeApp, getApps } from 'firebase-admin/app';
import { DocumentData, FieldValue, getFirestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';

type Aggregate = {
  totalProduction: number;
  totalWaste: number;
  totalCost: number;
  reportsCount: number;
};

type ParsedArgs = {
  apply: boolean;
  cleanup: boolean;
  tenantId: string;
  pageSize: number;
};

const REPORTS_COLLECTION = 'production_reports';
const MAX_WRITE_BATCH = 400;

const toNumber = (value: unknown): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseArgs = (argv: string[]): ParsedArgs => {
  const getValue = (flag: string): string | undefined => {
    const idx = argv.findIndex((arg) => arg === flag);
    if (idx === -1) return undefined;
    return argv[idx + 1];
  };

  const tenantId = getValue('--tenant') || 'global';
  const pageSizeRaw = Number(getValue('--page-size') || 1000);
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.max(100, Math.min(pageSizeRaw, 5000)) : 1000;

  return {
    apply: argv.includes('--apply'),
    cleanup: !argv.includes('--no-cleanup'),
    tenantId,
    pageSize,
  };
};

const makeAggregate = (): Aggregate => ({
  totalProduction: 0,
  totalWaste: 0,
  totalCost: 0,
  reportsCount: 0,
});

const run = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (!getApps().length) {
    initializeApp();
  }
  const db = getFirestore();
  const dailyPath = `dashboardStats/${args.tenantId}/daily`;
  const monthlyPath = `dashboardStats/${args.tenantId}/monthly`;

  const dailyAgg = new Map<string, Aggregate>();
  const monthlyAgg = new Map<string, Aggregate>();

  let readCount = 0;
  let pageCount = 0;
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;

  for (;;) {
    let q = db.collection(REPORTS_COLLECTION).orderBy('__name__').limit(args.pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;
    pageCount += 1;
    readCount += snap.size;

    for (const row of snap.docs) {
      const data = row.data() as Record<string, unknown>;
      const date = String(data.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const month = date.slice(0, 7);

      const daily = dailyAgg.get(date) || makeAggregate();
      daily.totalProduction += toNumber(data.quantityProduced);
      daily.totalWaste += toNumber(data.quantityWaste);
      daily.totalCost += toNumber(data.totalCost);
      daily.reportsCount += 1;
      dailyAgg.set(date, daily);

      const monthly = monthlyAgg.get(month) || makeAggregate();
      monthly.totalProduction += toNumber(data.quantityProduced);
      monthly.totalWaste += toNumber(data.quantityWaste);
      monthly.totalCost += toNumber(data.totalCost);
      monthly.reportsCount += 1;
      monthlyAgg.set(month, monthly);
    }

    lastDoc = snap.docs[snap.docs.length - 1] || null;
    if (snap.size < args.pageSize) break;
  }

  const summary = {
    mode: args.apply ? 'APPLY' : 'DRY_RUN',
    tenantId: args.tenantId,
    pagesRead: pageCount,
    reportsRead: readCount,
    dailyDocsComputed: dailyAgg.size,
    monthlyDocsComputed: monthlyAgg.size,
    cleanupStale: args.cleanup,
  };
  console.log('[dashboardStats backfill] Summary:', summary);

  if (!args.apply) {
    console.log('[dashboardStats backfill] Dry run complete. Re-run with --apply to write data.');
    return;
  }

  const writeAggregates = async (
    path: string,
    entries: Array<[string, Aggregate]>,
    kind: 'daily' | 'monthly',
  ) => {
    for (let i = 0; i < entries.length; i += MAX_WRITE_BATCH) {
      const batch = db.batch();
      const chunk = entries.slice(i, i + MAX_WRITE_BATCH);
      for (const [id, agg] of chunk) {
        const base = kind === 'daily'
          ? { date: id, month: id.slice(0, 7) }
          : { month: id };
        batch.set(db.doc(`${path}/${id}`), {
          ...base,
          ...agg,
          updatedAt: FieldValue.serverTimestamp(),
          backfilledAt: FieldValue.serverTimestamp(),
          source: 'backfill-script',
        }, { merge: true });
      }
      await batch.commit();
    }
  };

  await writeAggregates(dailyPath, Array.from(dailyAgg.entries()), 'daily');
  await writeAggregates(monthlyPath, Array.from(monthlyAgg.entries()), 'monthly');

  if (args.cleanup) {
    const cleanupMissing = async (path: string, validIds: Set<string>) => {
      const existing = await db.collection(path).select().get();
      const stale: string[] = [];
      existing.docs.forEach((d) => {
        if (!validIds.has(d.id)) stale.push(d.id);
      });

      for (let i = 0; i < stale.length; i += MAX_WRITE_BATCH) {
        const batch = db.batch();
        stale.slice(i, i + MAX_WRITE_BATCH).forEach((id) => {
          batch.delete(db.doc(`${path}/${id}`));
        });
        await batch.commit();
      }
      console.log(`[dashboardStats backfill] Removed stale docs from ${path}:`, stale.length);
    };

    await cleanupMissing(dailyPath, new Set(dailyAgg.keys()));
    await cleanupMissing(monthlyPath, new Set(monthlyAgg.keys()));
  }

  console.log('[dashboardStats backfill] Apply complete.');
};

run().catch((error) => {
  console.error('[dashboardStats backfill] Failed:', error);
  process.exitCode = 1;
});
