import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, isConfigured, auth } from '../../auth/services/firebase';
import type {
  ProductionReport,
  SupplyCycle,
  SupplyCycleKind,
  SupplyCycleWasteLine,
} from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { getReportWaste } from '../../../utils/calculations';
import { reportService } from './reportService';
import { systemSettingsService } from '../../system/services/systemSettingsService';

const CYCLES = 'supply_cycles';
const WASTE_LINES = 'supply_cycle_waste_lines';

function timestampToMillis(v: unknown): number {
  if (v != null && typeof v === 'object' && 'toMillis' in v) {
    const fn = (v as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') return fn.call(v);
  }
  return 0;
}

function normalizeBatchPrefix(raw: string | undefined): string {
  const p = (raw || 'SC').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return p || 'SC';
}

/** PREFIX-YYYY-NNNN لأي بادئة (SC، BT، أو من إعدادات planSettings) */
function parseAnyBatchCode(code: string): { prefix: string; year: number; seq: number } | null {
  const m = /^([A-Z0-9]{2,6})-(\d{4})-(\d+)$/i.exec(String(code || '').trim());
  if (!m) return null;
  return { prefix: m[1].toUpperCase(), year: Number(m[2]), seq: Number(m[3]) || 0 };
}

async function generateNextBatchCode(): Promise<string> {
  const year = new Date().getFullYear();
  let prefix = 'SC';
  try {
    const settings = await systemSettingsService.get();
    prefix = normalizeBatchPrefix(settings?.planSettings?.supplyCycleBatchCodePrefix);
  } catch {
    /* use default */
  }
  try {
    const q = tenantQuery(db, CYCLES, orderBy('createdAt', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return `${prefix}-${year}-0001`;

    const latest = snap.docs[0].data() as Partial<SupplyCycle>;
    const parsed = parseAnyBatchCode(latest.batchCode ?? '');
    if (!parsed || parsed.year !== year) return `${prefix}-${year}-0001`;

    return `${prefix}-${year}-${String(parsed.seq + 1).padStart(4, '0')}`;
  } catch {
    return `${prefix}-${year}-${Date.now().toString().slice(-4)}`;
  }
}

export function computeSupplyCycleTotals(
  cycle: Pick<SupplyCycle, 'openingQty' | 'receivedQty' | 'consumedQty'>,
  manualWasteSum: number,
  reportWasteSum: number,
): { totalWaste: number; remaining: number; manualWasteSum: number; reportWasteSum: number } {
  const manualWasteSumN = Number(manualWasteSum) || 0;
  const reportWasteSumN = Number(reportWasteSum) || 0;
  const totalWaste = manualWasteSumN + reportWasteSumN;
  const remaining =
    (Number(cycle.openingQty) || 0) +
    (Number(cycle.receivedQty) || 0) -
    (Number(cycle.consumedQty) || 0) -
    totalWaste;
  return { totalWaste, remaining, manualWasteSum: manualWasteSumN, reportWasteSum: reportWasteSumN };
}

async function deleteWasteLinesForCycle(cycleId: string): Promise<void> {
  const q = tenantQuery(db, WASTE_LINES, where('cycleId', '==', cycleId));
  const snap = await getDocs(q);
  const docs = snap.docs;
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    docs.slice(i, i + chunkSize).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

function sumReportWasteForCycleKind(cycle: SupplyCycle, r: ProductionReport): number {
  if (cycle.kind === 'finished_good') {
    return getReportWaste(r);
  }
  const scrap = (r.componentScrapItems || []).find(
    (x) => String(x.materialId) === String(cycle.itemId),
  );
  return Number(scrap?.quantity || 0);
}

/** هالك من تقارير مربوطة بـ supplyCycleId أولاً؛ وإلا تقدير من نطاق التاريخ + الصنف. */
async function aggregateReportWasteByDateRange(cycle: SupplyCycle): Promise<number> {
  const { periodStart, periodEnd, kind, itemId } = cycle;
  if (!periodStart || !periodEnd || !itemId) return 0;

  let total = 0;
  let cursor: QueryDocumentSnapshot | null = null;
  let hasMore = true;

  while (hasMore) {
    const page = await reportService.listByDateRangePaged({
      startDate: periodStart,
      endDate: periodEnd,
      limit: 500,
      cursor: cursor ?? undefined,
      productId: kind === 'finished_good' ? itemId : undefined,
    });

    for (const r of page.items) {
      total += sumReportWasteForCycleKind(cycle, r);
    }

    hasMore = page.hasMore;
    cursor = page.nextCursor;
  }

  return total;
}

export async function aggregateReportWasteForCycle(cycle: SupplyCycle): Promise<number> {
  if (!isConfigured || !cycle.id) return 0;
  const { periodStart, periodEnd, itemId } = cycle;
  if (!periodStart || !periodEnd || !itemId) return 0;

  const linked = await reportService.listAllBySupplyCycleId(cycle.id);
  if (linked.length > 0) {
    return linked.reduce((sum, r) => sum + sumReportWasteForCycleKind(cycle, r), 0);
  }

  return aggregateReportWasteByDateRange(cycle);
}

function uid(): string | undefined {
  return auth.currentUser?.uid ?? undefined;
}

export type SupplyCycleCreateInput = Omit<
  SupplyCycle,
  'id' | 'tenantId' | 'batchCode' | 'createdAt' | 'updatedAt' | 'closedAt' | 'closedByUid' | 'closedWasteTotal' | 'closedRemaining'
>;

export type SupplyCycleUpdateInput = Partial<
  Pick<
    SupplyCycle,
    | 'kind'
    | 'itemId'
    | 'externalLabel'
    | 'periodStart'
    | 'periodEnd'
    | 'openingQty'
    | 'receivedQty'
    | 'consumedQty'
    | 'status'
  >
>;

export const supplyCycleService = {
  async list(): Promise<SupplyCycle[]> {
    if (!isConfigured) return [];
    const q = tenantQuery(db, CYCLES, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupplyCycle));
  },

  /**
   * يطابق دورة توريد (مسودة أو مفتوحة) لنفس الصنف وتاريخ التقرير ضمن فترة الدورة.
   * عند وجود أكثر من دورة: يُفضَّل «مفتوح» ثم الأحدث إنشاءً.
   */
  async findAutoLinkForReport(input: {
    productId: string;
    date: string;
    reportType?: 'finished_product' | 'component_injection';
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const pid = String(input.productId || '').trim();
    const d = String(input.date || '').trim();
    if (!pid || !d) return null;

    const kind: SupplyCycleKind =
      input.reportType === 'component_injection' ? 'raw_material' : 'finished_good';

    const cycles = await this.list();
    const matches = cycles.filter((c) => {
      if (c.status === 'closed' || !c.id) return false;
      if (d < c.periodStart || d > c.periodEnd) return false;
      if (c.kind !== kind) return false;
      return String(c.itemId) === pid;
    });
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0].id!;

    matches.sort((a, b) => {
      const pref = (s: SupplyCycle) => (s.status === 'open' ? 1 : 0);
      const prefDiff = pref(b) - pref(a);
      if (prefDiff !== 0) return prefDiff;
      return timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt);
    });
    return matches[0].id ?? null;
  },

  async getById(id: string): Promise<SupplyCycle | null> {
    if (!isConfigured || !id) return null;
    const ref = doc(db, CYCLES, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as SupplyCycle;
    if (data.tenantId && data.tenantId !== getCurrentTenantId()) return null;
    return { id: snap.id, ...data };
  },

  async create(input: SupplyCycleCreateInput): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const tenantId = getCurrentTenantId();
    const batchCode = await generateNextBatchCode();
    const status = input.status ?? 'draft';
    const payload = {
      tenantId,
      batchCode,
      kind: input.kind,
      itemId: input.itemId,
      externalLabel: input.externalLabel?.trim() || '',
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      openingQty: Number(input.openingQty) || 0,
      receivedQty: Number(input.receivedQty) || 0,
      consumedQty: Number(input.consumedQty) || 0,
      status,
      createdAt: serverTimestamp(),
      createdByUid: uid() ?? null,
      updatedAt: serverTimestamp(),
      updatedByUid: uid() ?? null,
    };
    const ref = await addDoc(collection(db, CYCLES), payload);
    return ref.id;
  },

  async update(id: string, input: SupplyCycleUpdateInput): Promise<void> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const existing = await this.getById(id);
    if (!existing) throw new Error('Cycle not found');
    if (existing.status === 'closed') throw new Error('Cannot edit a closed cycle');

    await updateDoc(doc(db, CYCLES, id), {
      ...input,
      updatedAt: serverTimestamp(),
      updatedByUid: uid() ?? null,
    });
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const existing = await this.getById(id);
    if (!existing) throw new Error('Cycle not found');
    if (existing.status === 'closed') throw new Error('Cannot delete a closed cycle');

    const wasteLines = await this.listWasteLines(id);
    const manualSum = wasteLines.reduce((s, w) => s + (Number(w.quantity) || 0), 0);
    const reportWaste = await aggregateReportWasteForCycle(existing);

    if (existing.status === 'draft') {
      await deleteWasteLinesForCycle(id);
      await deleteDoc(doc(db, CYCLES, id));
      return;
    }

    if (existing.status === 'open') {
      const hasNumbers =
        (Number(existing.openingQty) || 0) !== 0 ||
        (Number(existing.receivedQty) || 0) !== 0 ||
        (Number(existing.consumedQty) || 0) !== 0;
      if (wasteLines.length > 0 || hasNumbers || manualSum > 0 || reportWaste > 0) {
        throw new Error('Cannot delete an open cycle with data; clear quantities and waste first, or use draft.');
      }
      await deleteDoc(doc(db, CYCLES, id));
      return;
    }
  },

  async close(id: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const existing = await this.getById(id);
    if (!existing) throw new Error('Cycle not found');
    if (existing.status === 'closed') return;

    const wasteLines = await this.listWasteLines(id);
    const manualSum = wasteLines.reduce((s, w) => s + (Number(w.quantity) || 0), 0);
    const reportWaste = await aggregateReportWasteForCycle(existing);
    const { totalWaste, remaining } = computeSupplyCycleTotals(existing, manualSum, reportWaste);

    await updateDoc(doc(db, CYCLES, id), {
      status: 'closed',
      closedAt: serverTimestamp(),
      closedByUid: uid() ?? null,
      closedWasteTotal: totalWaste,
      closedRemaining: remaining,
      updatedAt: serverTimestamp(),
      updatedByUid: uid() ?? null,
    });
  },

  async listWasteLines(cycleId: string): Promise<SupplyCycleWasteLine[]> {
    if (!isConfigured) return [];
    const q = tenantQuery(db, WASTE_LINES, where('cycleId', '==', cycleId));
    const snap = await getDocs(q);
    const toMs = (v: unknown): number => {
      if (v == null) return 0;
      if (typeof (v as { toMillis?: () => number }).toMillis === 'function') {
        return (v as { toMillis: () => number }).toMillis();
      }
      if (typeof v === 'object' && v && 'seconds' in (v as object)) {
        return Number((v as { seconds: number }).seconds) * 1000;
      }
      return 0;
    };
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as SupplyCycleWasteLine))
      .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
  },

  async addManualWasteLine(cycleId: string, quantity: number, note?: string): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const existing = await this.getById(cycleId);
    if (!existing) throw new Error('Cycle not found');
    if (existing.status === 'closed') throw new Error('Cannot add waste to a closed cycle');

    const ref = await addDoc(collection(db, WASTE_LINES), {
      tenantId: getCurrentTenantId(),
      cycleId,
      source: 'manual' as const,
      quantity: Number(quantity) || 0,
      note: note?.trim() || '',
      createdAt: serverTimestamp(),
      createdByUid: uid() ?? null,
    });
    return ref.id;
  },

  async deleteWasteLine(lineId: string): Promise<void> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const ref = doc(db, WASTE_LINES, lineId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as SupplyCycleWasteLine;
    if (data.tenantId && data.tenantId !== getCurrentTenantId()) throw new Error('Forbidden');
    const cycle = await this.getById(data.cycleId);
    if (cycle?.status === 'closed') throw new Error('Cannot delete waste from a closed cycle');
    await deleteDoc(ref);
  },
};
