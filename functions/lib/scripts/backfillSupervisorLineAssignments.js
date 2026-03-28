import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
const REPORTS_COLLECTION = 'production_reports';
const WORK_ORDERS_COLLECTION = 'work_orders';
const LINES_COLLECTION = 'production_lines';
const ASSIGNMENTS_COLLECTION = 'supervisor_line_assignments';
const MAX_WRITE_BATCH = 400;
const parseArgs = (argv) => {
    const getValue = (flag) => {
        const idx = argv.findIndex((arg) => arg === flag);
        if (idx === -1)
            return undefined;
        return argv[idx + 1];
    };
    const pageSizeRaw = Number(getValue('--page-size') || 1000);
    const pageSize = Number.isFinite(pageSizeRaw) ? Math.max(200, Math.min(5000, pageSizeRaw)) : 1000;
    return {
        apply: argv.includes('--apply'),
        pageSize,
    };
};
const isYmd = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const todayYmd = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};
const run = async () => {
    const args = parseArgs(process.argv.slice(2));
    if (!getApps().length)
        initializeApp();
    const db = getFirestore();
    const existingSnap = await db.collection(ASSIGNMENTS_COLLECTION).where('isActive', '==', true).get();
    const linesWithActive = new Set(existingSnap.docs
        .map((d) => String(d.data().lineId || '').trim())
        .filter(Boolean));
    const candidates = new Map();
    let reportReads = 0;
    let workOrderReads = 0;
    let lastReportDoc = null;
    for (;;) {
        let q = db.collection(REPORTS_COLLECTION).orderBy('__name__').limit(args.pageSize);
        if (lastReportDoc)
            q = q.startAfter(lastReportDoc);
        const snap = await q.get();
        if (snap.empty)
            break;
        reportReads += snap.size;
        for (const row of snap.docs) {
            const data = row.data();
            const lineId = String(data.lineId || '').trim();
            const supervisorId = String(data.employeeId || '').trim();
            const date = String(data.date || '').trim();
            if (!lineId || !supervisorId || !isYmd(date))
                continue;
            const prev = candidates.get(lineId);
            if (!prev || date > prev.date) {
                candidates.set(lineId, { lineId, supervisorId, date, source: 'report' });
            }
        }
        lastReportDoc = snap.docs[snap.docs.length - 1] || null;
        if (snap.size < args.pageSize)
            break;
    }
    let lastWorkOrderDoc = null;
    for (;;) {
        let q = db.collection(WORK_ORDERS_COLLECTION).orderBy('__name__').limit(args.pageSize);
        if (lastWorkOrderDoc)
            q = q.startAfter(lastWorkOrderDoc);
        const snap = await q.get();
        if (snap.empty)
            break;
        workOrderReads += snap.size;
        for (const row of snap.docs) {
            const data = row.data();
            const lineId = String(data.lineId || '').trim();
            const supervisorId = String(data.supervisorId || '').trim();
            const date = String(data.targetDate || '').trim();
            if (!lineId || !supervisorId || !isYmd(date))
                continue;
            if (candidates.has(lineId))
                continue;
            const prev = candidates.get(lineId);
            if (!prev || date > prev.date) {
                candidates.set(lineId, { lineId, supervisorId, date, source: 'work_order' });
            }
        }
        lastWorkOrderDoc = snap.docs[snap.docs.length - 1] || null;
        if (snap.size < args.pageSize)
            break;
    }
    const linesSnap = await db.collection(LINES_COLLECTION).select().get();
    const allLines = linesSnap.docs.map((d) => d.id);
    const toCreate = Array.from(candidates.values()).filter((item) => !linesWithActive.has(item.lineId));
    const unresolvedLines = allLines.filter((lineId) => !linesWithActive.has(lineId) && !candidates.has(lineId));
    console.log('[supervisor assignment migration] Summary:', {
        mode: args.apply ? 'APPLY' : 'DRY_RUN',
        reportReads,
        workOrderReads,
        activeAssignmentsFound: linesWithActive.size,
        candidatesFound: candidates.size,
        toCreate: toCreate.length,
        unresolvedLines: unresolvedLines.length,
    });
    if (toCreate.length > 0) {
        console.log('[supervisor assignment migration] Sample inserts:', toCreate.slice(0, 10));
    }
    if (unresolvedLines.length > 0) {
        console.log('[supervisor assignment migration] Lines without inferred supervisor:', unresolvedLines.slice(0, 30));
    }
    if (!args.apply) {
        console.log('[supervisor assignment migration] Dry run complete. Re-run with --apply to write data.');
        return;
    }
    for (let i = 0; i < toCreate.length; i += MAX_WRITE_BATCH) {
        const batch = db.batch();
        const chunk = toCreate.slice(i, i + MAX_WRITE_BATCH);
        chunk.forEach((item) => {
            const ref = db.collection(ASSIGNMENTS_COLLECTION).doc();
            batch.set(ref, {
                lineId: item.lineId,
                supervisorId: item.supervisorId,
                effectiveFrom: item.date,
                isActive: true,
                reason: 'migrate',
                changedBy: 'migration-script',
                changedAt: FieldValue.serverTimestamp(),
                source: item.source,
            });
        });
        await batch.commit();
    }
    const validateDate = todayYmd();
    const activeAfter = await db.collection(ASSIGNMENTS_COLLECTION).where('isActive', '==', true).get();
    const activeByLine = new Map();
    activeAfter.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const lineId = String(data.lineId || '').trim();
        const from = String(data.effectiveFrom || '').trim();
        const to = String(data.effectiveTo || '').trim();
        if (!lineId || !from || from > validateDate)
            return;
        if (to && to < from)
            return;
        if (to && to < validateDate)
            return;
        activeByLine.set(lineId, (activeByLine.get(lineId) || 0) + 1);
    });
    const conflicts = Array.from(activeByLine.entries()).filter(([, count]) => count > 1);
    if (conflicts.length > 0) {
        console.warn('[supervisor assignment migration] Validation warning: multiple active supervisors on same line:', conflicts.slice(0, 30));
    }
    else {
        console.log('[supervisor assignment migration] Validation passed: no active conflicts for', validateDate);
    }
};
run().catch((error) => {
    console.error('[supervisor assignment migration] Failed:', error);
    process.exitCode = 1;
});
