/**
 * Backfill tenantId on all business documents + create tenants/{id} and tenant_slugs/{slug}.
 *
 * Usage:
 *   node lib/scripts/backfillTenantId.js --project YOUR_GCP_PROJECT --slug acme --name "Acme" ... [--apply]
 *
 * Project ID: --project flag, or GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT, or default from repo .firebaserc.
 * Auth (pick one):
 *   --credentials C:\path\to\serviceAccount.json
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\key.json"   (PowerShell)
 *   gcloud auth application-default login
 *
 * Firebase Console → Project settings → Service accounts → Generate new private key.
 */
import * as fs from 'fs';
import * as path from 'path';
import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore, } from 'firebase-admin/firestore';
const EXCLUDED = new Set([
    'tenants',
    'tenant_slugs',
    'pending_tenants',
    'user_devices',
    'user_presence',
]);
const COLLECTIONS_TO_MIGRATE = [
    'products',
    'production_lines',
    'productionLines',
    'employees',
    'production_reports',
    'line_status',
    'line_product_config',
    'production_plans',
    'production_plan_followups',
    'supervisors',
    'supervisor_line_assignments',
    'supervisorAssignmentLog',
    'work_orders',
    'notifications',
    'scan_events',
    'product_materials',
    'monthly_production_costs',
    'line_worker_assignments',
    'warehouses',
    'raw_materials',
    'stock_items',
    'stock_transactions',
    'stock_counts',
    'inventory_transfer_requests',
    'cost_centers',
    'cost_center_values',
    'cost_allocations',
    'labor_settings',
    'assets',
    'asset_depreciations',
    'roles',
    'users',
    'system_settings',
    'activity_logs',
    'audit_logs',
    'departments',
    'job_positions',
    'shifts',
    'hr_settings',
    'penalty_rules',
    'late_rules',
    'allowance_types',
    'attendance_raw_logs',
    'attendance_logs',
    'attendance_records',
    'attendance_monthly_summaries',
    'attendance_import_history',
    'leave_requests',
    'leave_balances',
    'employee_loans',
    'employee_allowances',
    'employee_deductions',
    'vehicles',
    'approval_requests',
    'approval_settings',
    'approval_delegations',
    'approval_audit_logs',
    'hr_notifications',
    'employee_performance',
    'employee_bonuses',
    'payroll_months',
    'payroll_records',
    'payroll_audit_logs',
    'payroll_cost_summary',
    'payroll_distributions',
    'hr_config_modules',
    'hr_config_audit_logs',
    'quality_settings',
    'quality_reason_catalog',
    'quality_workers_assignments',
    'quality_inspections',
    'quality_defects',
    'quality_rework_orders',
    'quality_capa',
    'quality_print_logs',
    'production_report_uniques',
    'product_categories',
    'automation_runs',
    'backups',
];
function readDefaultProjectFromFirebaserc() {
    const candidates = [
        path.join(process.cwd(), '.firebaserc'),
        path.join(process.cwd(), '..', '.firebaserc'),
    ];
    for (const p of candidates) {
        try {
            const raw = fs.readFileSync(p, 'utf8');
            const j = JSON.parse(raw);
            const id = j?.projects?.default;
            if (typeof id === 'string' && id.trim())
                return id.trim();
        }
        catch {
            /* missing or invalid */
        }
    }
    return undefined;
}
function resolveProjectId(argv) {
    const get = (f) => {
        const i = argv.indexOf(f);
        return i >= 0 ? argv[i + 1] : '';
    };
    const fromFlag = get('--project').trim();
    if (fromFlag)
        return fromFlag;
    const fromEnv = (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
    if (fromEnv)
        return fromEnv;
    const fromRc = readDefaultProjectFromFirebaserc();
    if (fromRc)
        return fromRc;
    return '';
}
const parseArgs = (argv) => {
    const get = (f) => {
        const i = argv.indexOf(f);
        return i >= 0 ? argv[i + 1] : '';
    };
    const projectId = resolveProjectId(argv);
    return {
        projectId,
        credentialsPath: get('--credentials').trim(),
        slug: get('--slug').trim().toLowerCase(),
        name: get('--name').trim(),
        phone: get('--phone').trim(),
        address: get('--address').trim(),
        apply: argv.includes('--apply'),
    };
};
const run = async () => {
    const args = parseArgs(process.argv.slice(2));
    if (!args.slug || !args.name) {
        console.error('Required: --slug <slug> --name <name> [--project <id>] [--credentials <serviceAccount.json>] [--phone] [--address] [--apply]');
        process.exit(1);
    }
    if (!args.projectId) {
        console.error('Missing Firebase/GCP project id. Use: --project <id> or set GCLOUD_PROJECT, or add projects.default in .firebaserc next to firebase.json.');
        process.exit(1);
    }
    if (!getApps().length) {
        const credRaw = (args.credentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
        if (credRaw) {
            const credResolved = path.isAbsolute(credRaw)
                ? credRaw
                : path.resolve(process.cwd(), credRaw);
            if (!fs.existsSync(credResolved)) {
                console.error(`Credentials file not found: ${credResolved}`);
                process.exit(1);
            }
            initializeApp({
                projectId: args.projectId,
                credential: cert(credResolved),
            });
        }
        else {
            initializeApp({ projectId: args.projectId });
        }
    }
    const db = getFirestore();
    const tenantRef = db.collection('tenants').doc();
    const tenantId = tenantRef.id;
    console.log(args.apply ? 'APPLY' : 'DRY-RUN', { tenantId, slug: args.slug });
    if (args.apply) {
        await tenantRef.set({
            slug: args.slug,
            name: args.name,
            phone: args.phone,
            address: args.address,
            status: 'active',
            createdAt: FieldValue.serverTimestamp(),
        });
        await db.collection('tenant_slugs').doc(args.slug).set({ tenantId });
        const legacySettings = await db.collection('system_settings').doc('global').get();
        if (legacySettings.exists) {
            await db
                .collection('system_settings')
                .doc(tenantId)
                .set({ ...legacySettings.data(), tenantId }, { merge: true });
        }
    }
    const summary = {};
    for (const name of COLLECTIONS_TO_MIGRATE) {
        if (EXCLUDED.has(name))
            continue;
        let updated = 0;
        let last;
        for (;;) {
            let q = db.collection(name).orderBy('__name__').limit(500);
            if (last)
                q = q.startAfter(last);
            const snap = await q.get();
            if (snap.empty)
                break;
            last = snap.docs[snap.docs.length - 1];
            const batch = db.batch();
            let ops = 0;
            for (const docSnap of snap.docs) {
                const data = docSnap.data();
                if (data.tenantId)
                    continue;
                updated++;
                if (args.apply) {
                    batch.update(docSnap.ref, { tenantId });
                    ops++;
                }
            }
            if (args.apply && ops > 0)
                await batch.commit();
            if (snap.size < 500)
                break;
        }
        if (updated > 0)
            summary[name] = updated;
    }
    console.log('Documents missing tenantId (count, may include already filled pages):');
    console.log(JSON.stringify(summary, null, 2));
};
run().catch((e) => {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Could not load the default credentials')) {
        console.error('\nLocal Admin SDK needs credentials. Use a service account JSON from Firebase Console (Project settings → Service accounts), then:\n' +
            '  node lib/scripts/backfillTenantId.js --credentials C:\\path\\to\\key.json --project ... --slug ... --name ... --apply\n' +
            'Or set GOOGLE_APPLICATION_CREDENTIALS to that file path, or run: gcloud auth application-default login');
    }
    process.exit(1);
});
