import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
const REPORTS_COLLECTION = 'production_reports';
const MAX_WRITE_BATCH = 400;
const toNumber = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const deriveComponentWaste = (items) => {
    if (!Array.isArray(items))
        return 0;
    return items.reduce((sum, item) => {
        const qty = item && typeof item === 'object'
            ? toNumber(item.quantity)
            : 0;
        return sum + qty;
    }, 0);
};
const parseArgs = (argv) => {
    const getValue = (flag) => {
        const idx = argv.findIndex((arg) => arg === flag);
        if (idx === -1)
            return undefined;
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
const makeAggregate = () => ({
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
    const dailyAgg = new Map();
    const monthlyAgg = new Map();
    const productAgg = new Map();
    const productMonthlyAgg = new Map();
    let readCount = 0;
    let pageCount = 0;
    let lastDoc = null;
    for (;;) {
        let q = db.collection(REPORTS_COLLECTION)
            .where('tenantId', '==', args.tenantId)
            .orderBy('__name__')
            .limit(args.pageSize);
        if (lastDoc)
            q = q.startAfter(lastDoc);
        const snap = await q.get();
        if (snap.empty)
            break;
        pageCount += 1;
        readCount += snap.size;
        for (const row of snap.docs) {
            const data = row.data();
            const date = String(data.date || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
                continue;
            const month = date.slice(0, 7);
            const productId = String(data.productId || '').trim();
            const wasteQuantity = deriveComponentWaste(data.componentScrapItems);
            const reportType = String(data.reportType || 'finished_product');
            const quantityProduced = reportType === 'packaging' || reportType === 'component_waste'
                ? 0
                : toNumber(data.quantityProduced);
            const reportCost = toNumber(data.fullManufacturingCostSnapshot
                ?? data.legacyConversionCostSnapshot
                ?? data.totalCost);
            const daily = dailyAgg.get(date) || makeAggregate();
            daily.totalProduction += quantityProduced;
            daily.totalWaste += wasteQuantity;
            daily.totalCost += reportCost;
            daily.reportsCount += 1;
            dailyAgg.set(date, daily);
            const monthly = monthlyAgg.get(month) || makeAggregate();
            monthly.totalProduction += quantityProduced;
            monthly.totalWaste += wasteQuantity;
            monthly.totalCost += reportCost;
            monthly.reportsCount += 1;
            monthlyAgg.set(month, monthly);
            if (productId) {
                const product = productAgg.get(productId) || makeAggregate();
                product.totalProduction += quantityProduced;
                product.totalWaste += wasteQuantity;
                product.totalCost += reportCost;
                product.reportsCount += 1;
                productAgg.set(productId, product);
                const productMonthKey = `${month}__${productId}`;
                const productMonth = productMonthlyAgg.get(productMonthKey) || makeAggregate();
                productMonth.totalProduction += quantityProduced;
                productMonth.totalWaste += wasteQuantity;
                productMonth.totalCost += reportCost;
                productMonth.reportsCount += 1;
                productMonthlyAgg.set(productMonthKey, productMonth);
            }
        }
        lastDoc = snap.docs[snap.docs.length - 1] || null;
        if (snap.size < args.pageSize)
            break;
    }
    const summary = {
        mode: args.apply ? 'APPLY' : 'DRY_RUN',
        tenantId: args.tenantId,
        pagesRead: pageCount,
        reportsRead: readCount,
        dailyDocsComputed: dailyAgg.size,
        monthlyDocsComputed: monthlyAgg.size,
        productDocsComputed: productAgg.size,
        productMonthlyDocsComputed: productMonthlyAgg.size,
        cleanupStale: args.cleanup,
    };
    console.log('[dashboardStats backfill] Summary:', summary);
    if (!args.apply) {
        console.log('[dashboardStats backfill] Dry run complete. Re-run with --apply to write data.');
        return;
    }
    const writeAggregates = async (path, entries, kind) => {
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
    const writeProductAggregates = async (path, entries, monthly) => {
        for (let i = 0; i < entries.length; i += MAX_WRITE_BATCH) {
            const batch = db.batch();
            entries.slice(i, i + MAX_WRITE_BATCH).forEach(([id, aggregate]) => {
                const separator = id.indexOf('__');
                batch.set(db.doc(`${path}/${id}`), {
                    ...aggregate,
                    productId: monthly ? id.slice(separator + 2) : id,
                    ...(monthly ? { month: id.slice(0, separator) } : {}),
                    updatedAt: FieldValue.serverTimestamp(),
                    backfilledAt: FieldValue.serverTimestamp(),
                    source: 'backfill-script',
                }, { merge: true });
            });
            await batch.commit();
        }
    };
    await writeProductAggregates(`dashboardStats/${args.tenantId}/products`, Array.from(productAgg.entries()), false);
    await writeProductAggregates(`dashboardStats/${args.tenantId}/productMonths`, Array.from(productMonthlyAgg.entries()), true);
    const latestMonthByProduct = new Map();
    productMonthlyAgg.forEach((aggregate, key) => {
        const separator = key.indexOf('__');
        const month = key.slice(0, separator);
        const productId = key.slice(separator + 2);
        const current = latestMonthByProduct.get(productId);
        if (!current || month > current.month)
            latestMonthByProduct.set(productId, { month, aggregate });
    });
    const productEntries = Array.from(productAgg.entries());
    for (let chunkIndex = 0; chunkIndex < Math.ceil(productEntries.length / MAX_WRITE_BATCH); chunkIndex += 1) {
        const batch = db.batch();
        productEntries.slice(chunkIndex * MAX_WRITE_BATCH, (chunkIndex + 1) * MAX_WRITE_BATCH).forEach(([productId, aggregate]) => {
            const latest = latestMonthByProduct.get(productId);
            batch.set(db.doc(`products/${productId}`), {
                totalProduction: aggregate.totalProduction,
                totalWaste: aggregate.totalWaste,
                ...(latest ? {
                    productionStatsMonth: latest.month,
                    monthlyProduction: latest.aggregate.totalProduction,
                    monthlyWaste: latest.aggregate.totalWaste,
                    monthlyProductionCost: latest.aggregate.totalCost,
                } : {}),
                productionStatsUpdatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        });
        await batch.commit();
    }
    if (args.cleanup) {
        const cleanupMissing = async (path, validIds) => {
            const existing = await db.collection(path).select().get();
            const stale = [];
            existing.docs.forEach((d) => {
                if (!validIds.has(d.id))
                    stale.push(d.id);
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
