import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

const db = getFirestore();
const STATS_ROOT = 'dashboardStats/global';
const EMPLOYEES_COLLECTION = 'employees';
const LINES_COLLECTION = 'production_lines';
const REPORTS_COLLECTION = 'production_reports';
const ASSIGNMENTS_COLLECTION = 'line_worker_assignments';
const NOTIFICATIONS_COLLECTION = 'notifications';
const AUTOMATION_RUNS_COLLECTION = 'automation_runs';

type ReportLike = {
  date?: string;
  quantityProduced?: number;
  componentScrapItems?: Array<{ quantity?: number }>;
  totalCost?: number;
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const deriveComponentWaste = (items: ReportLike['componentScrapItems']): number => {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + toNumber(item?.quantity), 0);
};

const normalizeReport = (value: ReportLike | undefined): Required<ReportLike> | null => {
  if (!value || !value.date || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
  return {
    date: value.date,
    quantityProduced: toNumber(value.quantityProduced),
    componentScrapItems: Array.isArray(value.componentScrapItems) ? value.componentScrapItems : [],
    totalCost: toNumber(value.totalCost),
  };
};

const monthKey = (date: string) => date.slice(0, 7);

const toYmd = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getOperationalDate = (startHour = 8, now = new Date()): string => {
  const d = new Date(now);
  if (d.getHours() < startHour) d.setDate(d.getDate() - 1);
  return toYmd(d);
};

const summarizeNames = (names: string[], maxItems = 5): string => {
  if (names.length === 0) return '—';
  const picked = names.slice(0, maxItems);
  const rest = names.length - picked.length;
  return rest > 0 ? `${picked.join('، ')} +${rest}` : picked.join('، ');
};

const applyDelta = async (report: Required<ReportLike>, factor: 1 | -1) => {
  const dailyRef = db.doc(`${STATS_ROOT}/daily/${report.date}`);
  const monthlyRef = db.doc(`${STATS_ROOT}/monthly/${monthKey(report.date)}`);
  const wasteQuantity = deriveComponentWaste(report.componentScrapItems);
  const payload = {
    totalProduction: FieldValue.increment(report.quantityProduced * factor),
    totalWaste: FieldValue.increment(wasteQuantity * factor),
    totalCost: FieldValue.increment(report.totalCost * factor),
    reportsCount: FieldValue.increment(1 * factor),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  batch.set(dailyRef, { date: report.date, month: monthKey(report.date), ...payload }, { merge: true });
  batch.set(monthlyRef, { month: monthKey(report.date), ...payload }, { merge: true });
  await batch.commit();
};

export const aggregateProductionReports = onDocumentWritten(
  {
    document: 'production_reports/{reportId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const before = normalizeReport(event.data?.before?.data() as ReportLike | undefined);
    const after = normalizeReport(event.data?.after?.data() as ReportLike | undefined);

    if (before) {
      await applyDelta(before, -1);
    }
    if (after) {
      await applyDelta(after, 1);
    }
  },
);

export const notifyDailySupervisorReportCompliance = onSchedule(
  {
    schedule: '5 16 * * *',
    timeZone: 'Africa/Cairo',
    region: 'us-central1',
    memory: '256MiB',
  },
  async () => {
    const operationalDate = getOperationalDate(8, new Date());
    const runRef = db.doc(`${AUTOMATION_RUNS_COLLECTION}/report_compliance_daily_${operationalDate}`);

    const [employeesSnap, linesSnap, assignmentsSnap, reportsSnap] = await Promise.all([
      db.collection(EMPLOYEES_COLLECTION).get(),
      db.collection(LINES_COLLECTION).get(),
      db.collection(ASSIGNMENTS_COLLECTION).where('date', '==', operationalDate).get(),
      db.collection(REPORTS_COLLECTION).where('date', '==', operationalDate).get(),
    ]);

    const lineNameById = new Map<string, string>();
    linesSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { name?: string };
      lineNameById.set(docSnap.id, String(data.name || '').trim() || docSnap.id);
    });

    const supervisorsById = new Map<string, { id: string; name: string }>();
    const recipients: Array<{ id: string; name: string }> = [];
    employeesSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { name?: string; level?: number; isActive?: boolean };
      const id = docSnap.id;
      const level = Number(data.level || 0);
      const isActive = data.isActive !== false;
      if (!isActive) return;

      const name = String(data.name || '').trim() || id;
      if (level === 2) supervisorsById.set(id, { id, name });
      if (level >= 3) recipients.push({ id, name });
    });

    const assignedMap = new Map<string, { id: string; name: string; lineNames: string[] }>();
    assignmentsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { employeeId?: string; lineId?: string };
      const employeeId = String(data.employeeId || '').trim();
      if (!employeeId || !supervisorsById.has(employeeId)) return;

      const existing = assignedMap.get(employeeId) || {
        id: employeeId,
        name: supervisorsById.get(employeeId)?.name || employeeId,
        lineNames: [],
      };
      const lineId = String(data.lineId || '').trim();
      const lineName = lineNameById.get(lineId) || lineId || '—';
      if (lineName && !existing.lineNames.includes(lineName)) existing.lineNames.push(lineName);
      assignedMap.set(employeeId, existing);
    });

    const submittedIds = new Set<string>();
    reportsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { employeeId?: string };
      const employeeId = String(data.employeeId || '').trim();
      if (employeeId && supervisorsById.has(employeeId)) submittedIds.add(employeeId);
    });

    const submitted = Array.from(assignedMap.values())
      .filter((row) => submittedIds.has(row.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const missing = Array.from(assignedMap.values())
      .filter((row) => !submittedIds.has(row.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    const title = `متابعة تقارير المشرفين (${operationalDate})`;
    const message =
      `المطلوب: ${assignedMap.size} | بعت: ${submitted.length} | ما بعتش: ${missing.length}` +
      `\nبعت: ${summarizeNames(submitted.map((row) => row.name))}` +
      `\nما بعتش: ${summarizeNames(missing.map((row) => row.name))}`;

    let alreadySent = false;
    await db.runTransaction(async (tx) => {
      const runSnap = await tx.get(runRef);
      if (runSnap.exists) {
        alreadySent = true;
        return;
      }

      tx.create(runRef, {
        operationalDate,
        assignedSupervisorsCount: assignedMap.size,
        submittedCount: submitted.length,
        missingCount: missing.length,
        submittedSupervisorIds: submitted.map((row) => row.id),
        missingSupervisorIds: missing.map((row) => row.id),
        deliveredTo: recipients.map((r) => r.id),
        createdAt: FieldValue.serverTimestamp(),
      });

      recipients.forEach((recipient) => {
        const notifRef = db.collection(NOTIFICATIONS_COLLECTION).doc();
        tx.create(notifRef, {
          recipientId: recipient.id,
          type: 'report_compliance_daily',
          title,
          message,
          referenceId: operationalDate,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    });

    if (alreadySent) return;
  },
);
