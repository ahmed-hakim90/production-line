#!/usr/bin/env node
import { createRequire } from 'node:module';

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { applicationDefault, getApps, initializeApp } = requireFromFunctions('firebase-admin/app');
const { FieldValue, getFirestore } = requireFromFunctions('firebase-admin/firestore');

const args = new Set(process.argv.slice(2));
const valueArg = (prefix) => process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
const tenantId = valueArg('--tenant=');
const apply = args.has('--apply');
const scrub = args.has('--scrub-legacy-fields');

if (!tenantId) {
  console.error('Usage: node scripts/migrate-repair-financials.mjs --tenant=TENANT_ID [--apply] [--scrub-legacy-fields]');
  process.exit(2);
}

if (!getApps().length) initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const money = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
};

const legacyGross = (job) => {
  const parts = (Array.isArray(job.partsUsed) ? job.partsUsed : [])
    .reduce((sum, row) => sum + money(row.quantity) * money(row.unitCost), 0);
  const products = (Array.isArray(job.jobProducts) ? job.jobProducts : [])
    .reduce((sum, row) => sum + money(row.finalCost ?? row.estimatedCost), 0);
  const calculated = money(parts + products + money(job.laborCost) + money(job.serviceOnlyCost));
  return calculated || money(job.finalCostOverride ?? job.finalCost ?? job.estimatedCost);
};

const [jobsSnap, branchesSnap, treasurySnap] = await Promise.all([
  db.collection('repair_jobs').where('tenantId', '==', tenantId).get(),
  db.collection('repair_branches').where('tenantId', '==', tenantId).get(),
  db.collection('repair_treasury_entries').where('tenantId', '==', tenantId).get(),
]);

const branches = new Map(branchesSnap.docs.map((row) => [row.id, row.data()]));
const paidByJob = new Map();
for (const row of treasurySnap.docs) {
  const entry = row.data();
  const jobId = String(entry.referenceId || entry.repairJobId || '').trim();
  if (!jobId) continue;
  const amount = money(entry.amount);
  const sign = entry.entryType === 'INCOME' ? 1 : entry.entryType === 'EXPENSE' && String(entry.source || '').includes('revers') ? -1 : 0;
  if (sign) paidByJob.set(jobId, money((paidByJob.get(jobId) || 0) + sign * amount));
}

const report = {
  mode: apply ? 'apply' : 'dry-run',
  tenantId,
  jobs: jobsSnap.size,
  financialDocuments: 0,
  treasuryEvidence: 0,
  legacyPaidWithoutEntry: 0,
  partialWithoutEvidence: 0,
  missingCustomers: 0,
  missingCostCenters: 0,
  missingAccountingMaps: 0,
  discrepancies: [],
  manualReview: [],
};

let batch = db.batch();
let writes = 0;
const flush = async () => {
  if (!apply || writes === 0) return;
  await batch.commit();
  batch = db.batch();
  writes = 0;
};

for (const jobDoc of jobsSnap.docs) {
  const job = jobDoc.data();
  const jobId = jobDoc.id;
  const branch = branches.get(String(job.branchId || '')) || {};
  const grossAmount = legacyGross(job);
  const treasuryPaid = money(paidByJob.get(jobId) || 0);
  const legacyPaidFlag = job.paymentStatus === 'paid' || money(job.paidAmount) >= grossAmount && grossAmount > 0;
  const legacyPartialFlag = job.paymentStatus === 'partial' || money(job.paidAmount) > 0;
  let evidence = 'manual_review';
  let paidAmount = 0;
  if (treasuryPaid > 0) {
    evidence = 'treasury_entries';
    paidAmount = Math.min(grossAmount, treasuryPaid);
    report.treasuryEvidence += 1;
  } else if (legacyPaidFlag) {
    evidence = 'legacy_status';
    report.legacyPaidWithoutEntry += 1;
  } else if (legacyPartialFlag) {
    report.partialWithoutEvidence += 1;
  }
  const balanceDue = money(grossAmount - paidAmount);
  const paymentStatus = paidAmount >= grossAmount && grossAmount > 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';
  if (!String(job.customerId || '').trim()) report.missingCustomers += 1;
  if (!String(branch.costCenterId || '').trim()) report.missingCostCenters += 1;
  const accounts = branch.accountingAccounts && typeof branch.accountingAccounts === 'object' ? branch.accountingAccounts : {};
  if (['cash', 'card', 'bankTransfer', 'customerDeposits', 'receivables', 'serviceRevenue', 'partsRevenue', 'discounts', 'partsInventory', 'partsCogs']
    .some((key) => !String(accounts[key] || '').trim())) report.missingAccountingMaps += 1;
  if (Math.abs(money(job.paidAmount) - treasuryPaid) >= 0.01) {
    report.discrepancies.push({ jobId, receiptNo: job.receiptNo || '', legacyPaidAmount: money(job.paidAmount), treasuryPaid });
  }
  if (evidence !== 'treasury_entries' && (legacyPaidFlag || legacyPartialFlag)) {
    report.manualReview.push({ jobId, receiptNo: job.receiptNo || '', reason: evidence });
  }
  report.financialDocuments += 1;

  if (apply) {
    const at = new Date().toISOString();
    batch.set(db.collection('repair_job_financials').doc(jobId), {
      tenantId,
      branchId: String(job.branchId || ''),
      jobId,
      receiptNo: String(job.receiptNo || jobId),
      serviceGross: grossAmount,
      partsGross: 0,
      grossAmount,
      discountType: 'none',
      discountValue: 0,
      discountAmount: 0,
      netAmount: grossAmount,
      paidAmount,
      balanceDue,
      paymentStatus,
      authorizationRevision: 0,
      costCenterId: String(branch.costCenterId || ''),
      accountingAccounts: accounts,
      migrationEvidence: evidence,
      createdAt: String(job.createdAt || at),
      updatedAt: at,
    }, { merge: true });
    writes += 1;
    if (evidence !== 'treasury_entries' && (legacyPaidFlag || legacyPartialFlag)) {
      batch.set(db.collection('repair_financial_migration_reviews').doc(jobId), {
        tenantId,
        branchId: String(job.branchId || ''),
        jobId,
        receiptNo: String(job.receiptNo || jobId),
        status: 'pending',
        reason: evidence,
        legacyPaymentStatus: String(job.paymentStatus || ''),
        legacyPaidAmount: money(job.paidAmount),
        treasuryPaidAmount: treasuryPaid,
        createdAt: at,
      }, { merge: true });
      writes += 1;
    }
    if (scrub) {
      const products = (Array.isArray(job.jobProducts) ? job.jobProducts : []).map((row) => {
        const next = { ...row };
        delete next.estimatedCost;
        delete next.finalCost;
        return next;
      });
      const parts = (Array.isArray(job.partsUsed) ? job.partsUsed : []).map((row) => {
        const next = { ...row };
        delete next.unitCost;
        return next;
      });
      batch.update(jobDoc.ref, {
        jobProducts: products,
        partsUsed: parts,
        estimatedCost: FieldValue.delete(),
        finalCost: FieldValue.delete(),
        finalCostOverride: FieldValue.delete(),
        laborCost: FieldValue.delete(),
        serviceOnlyCost: FieldValue.delete(),
        paidAmount: FieldValue.delete(),
        balanceDue: FieldValue.delete(),
        paymentStatus: FieldValue.delete(),
        updatedAt: at,
      });
      writes += 1;
    }
    if (writes >= 350) await flush();
  }
}

await flush();
console.log(JSON.stringify(report, null, 2));
