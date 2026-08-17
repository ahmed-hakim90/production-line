import type { ProductionPlan, ProductionReport } from '../../../types';
import type { ProductionIssueOrder, ProductionIssueOrderLine, StockItemBalance } from '../types';
import { matchesItemSearch } from './itemSearch';
import { filterReportsForProductionPlan } from '../../production/utils/productionPlanReports';
import { countsTowardProductManufacturingVolume } from '../../production/utils/reportTypes';

export type FloorIssueLineView = {
  itemType: ProductionIssueOrderLine['itemType'];
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  qtyPerUnit: number;
  /** Quantity issued on this production issue only — never a period total. */
  issuedQty: number;
  returnedQty: number;
  compensatedQty: number;
  /** Current production-floor warehouse balance (shared across issues). */
  floorQty: number;
};

export type FloorIssueCard = {
  order: ProductionIssueOrder;
  sourceLabel: string;
  summaryAr: string;
  issuedAt: string;
  lines: FloorIssueLineView[];
};

export type FloorProductCard = {
  productId: string;
  productName: string;
  productCode: string;
  issues: FloorIssueCard[];
};

/** Piece-qty balance for one floor issue: issued vs activated production reports. */
export type FloorIssuePieceBalance = {
  issuedQty: number;
  producedQty: number;
  remainingQty: number;
};

export type FloorProductExportRow = {
  المنتج: string;
  كود_المنتج: string;
  مرجع_الصرف: string;
  المصدر: string;
  كمية_المنتج_لهذا_الصرف: number;
  المكون: string;
  كود_المكون: string;
  لكل_وحدة: number;
  كمية_هذا_الصرف: number;
  مرتجع: number;
  تعويض: number;
};

const ISSUED_STATUS = 'issued';

export function issuedQtyForLine(line: Pick<ProductionIssueOrderLine, 'issuedQty' | 'requiredQty'>): number {
  const issued = Number(line.issuedQty);
  if (Number.isFinite(issued) && issued > 0) return issued;
  return Math.max(0, Number(line.requiredQty || 0));
}

export function floorIssueSourceLabel(
  order: Pick<ProductionIssueOrder, 'sourceType' | 'workOrderId' | 'productionPlanId' | 'productionReportId' | 'productionReportCode'>,
): string {
  if (order.sourceType === 'work_order' || String(order.workOrderId || '').trim()) return 'أمر شغل';
  if (order.sourceType === 'production_report' || String(order.productionReportId || order.productionReportCode || '').trim()) {
    return 'تقرير إنتاج';
  }
  return 'خطة إنتاج';
}

export function floorIssueSummaryAr(
  order: Pick<ProductionIssueOrder, 'quantity' | 'sourceType' | 'workOrderId' | 'productionPlanId' | 'productionReportId' | 'productionReportCode'>,
): string {
  const qty = Number(order.quantity || 0);
  const qtyText = Number.isFinite(qty) ? qty.toLocaleString('en-US') : '0';
  return `مصروف ل${floorIssueSourceLabel(order)} ${qtyText} قطعة`;
}

export function issueTimestamp(order: Pick<ProductionIssueOrder, 'issuedAt' | 'createdAt'>): string {
  return String(order.issuedAt || order.createdAt || '');
}

export function isIssuedToFloor(
  order: Pick<ProductionIssueOrder, 'status' | 'targetWarehouseId'>,
  floorWarehouseId: string,
): boolean {
  const floorId = String(floorWarehouseId || '').trim();
  if (!floorId) return false;
  return order.status === ISSUED_STATUS && String(order.targetWarehouseId || '').trim() === floorId;
}

export function isIssueInRange(
  order: Pick<ProductionIssueOrder, 'issuedAt' | 'createdAt'>,
  range: { startDate?: string; endDate?: string } | null | undefined,
): boolean {
  if (!range?.startDate && !range?.endDate) return true;
  const at = issueTimestamp(order);
  if (!at) return true;
  if (range.startDate && at < range.startDate) return false;
  if (range.endDate && at > range.endDate) return false;
  return true;
}

function balanceKey(itemType: string, itemId: string): string {
  return `${itemType}__${itemId}`;
}

function toLineView(
  line: ProductionIssueOrderLine,
  floorQtyByItem: Map<string, number>,
): FloorIssueLineView {
  return {
    itemType: line.itemType,
    itemId: line.itemId,
    itemName: line.itemName,
    itemCode: line.itemCode,
    unit: line.unit,
    qtyPerUnit: Number(line.qtyPerUnit || 0),
    issuedQty: issuedQtyForLine(line),
    returnedQty: Number(line.returnedQty || 0),
    compensatedQty: Number(line.compensatedQty || 0),
    floorQty: Number(floorQtyByItem.get(balanceKey(line.itemType, line.itemId)) || 0),
  };
}

function toIssueCard(order: ProductionIssueOrder, floorQtyByItem: Map<string, number>): FloorIssueCard {
  return {
    order,
    sourceLabel: floorIssueSourceLabel(order),
    summaryAr: floorIssueSummaryAr(order),
    issuedAt: issueTimestamp(order),
    lines: (order.lines || []).map((line) => toLineView(line, floorQtyByItem)),
  };
}

/**
 * Group issued floor orders into one card per product.
 * Issues stay separate — never sum FG qty or component qty across صروف.
 */
export function groupIssuedOrdersByProduct(params: {
  orders: ProductionIssueOrder[];
  floorWarehouseId: string;
  balances?: StockItemBalance[];
  range?: { startDate?: string; endDate?: string } | null;
}): FloorProductCard[] {
  const floorQtyByItem = new Map<string, number>();
  for (const row of params.balances || []) {
    floorQtyByItem.set(balanceKey(row.itemType, row.itemId), Number(row.quantity || 0));
  }

  const byProduct = new Map<string, FloorProductCard>();
  for (const order of params.orders) {
    if (!isIssuedToFloor(order, params.floorWarehouseId)) continue;
    if (!isIssueInRange(order, params.range)) continue;
    const productId = String(order.productId || '').trim();
    if (!productId) continue;
    const issue = toIssueCard(order, floorQtyByItem);
    const existing = byProduct.get(productId);
    if (existing) {
      existing.issues.push(issue);
      continue;
    }
    byProduct.set(productId, {
      productId,
      productName: String(order.productName || '').trim() || productId,
      productCode: String(order.productCode || '').trim(),
      issues: [issue],
    });
  }

  const cards = Array.from(byProduct.values());
  for (const card of cards) {
    card.issues.sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt)));
  }
  cards.sort((a, b) => {
    const aAt = a.issues[0]?.issuedAt || '';
    const bAt = b.issues[0]?.issuedAt || '';
    return String(bAt).localeCompare(String(aAt));
  });
  return cards;
}

export function filterProductCards(cards: FloorProductCard[], query: string): FloorProductCard[] {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return cards;
  return cards.filter((card) => {
    if (card.productName.toLowerCase().includes(q) || card.productCode.toLowerCase().includes(q)) return true;
    return card.issues.some((issue) => {
      if (String(issue.order.referenceNo || '').toLowerCase().includes(q)) return true;
      if (issue.summaryAr.toLowerCase().includes(q) || issue.sourceLabel.toLowerCase().includes(q)) return true;
      return issue.lines.some((line) => matchesItemSearch(line, q));
    });
  });
}

export function flattenProductCardsForExport(cards: FloorProductCard[]): FloorProductExportRow[] {
  const rows: FloorProductExportRow[] = [];
  for (const card of cards) {
    for (const issue of card.issues) {
      for (const line of issue.lines) {
        rows.push({
          المنتج: card.productName,
          كود_المنتج: card.productCode,
          مرجع_الصرف: issue.order.referenceNo,
          المصدر: issue.sourceLabel,
          كمية_المنتج_لهذا_الصرف: Number(issue.order.quantity || 0),
          المكون: line.itemName,
          كود_المكون: line.itemCode,
          لكل_وحدة: line.qtyPerUnit,
          كمية_هذا_الصرف: line.issuedQty,
          مرتجع: line.returnedQty,
          تعويض: line.compensatedQty,
        });
      }
    }
  }
  return rows;
}

export function reportsAffectedByFloorIssue(params: {
  issue: Pick<ProductionIssueOrder, 'productId' | 'productionPlanId' | 'workOrderId' | 'productionReportId'>;
  plan?: ProductionPlan | null;
  reports: ProductionReport[];
}): ProductionReport[] {
  const productId = String(params.issue.productId || '').trim();
  const planId = String(params.issue.productionPlanId || '').trim();
  const workOrderId = String(params.issue.workOrderId || '').trim();
  const reportId = String(params.issue.productionReportId || '').trim();
  const matched = new Map<string, ProductionReport>();

  const add = (report: ProductionReport) => {
    const id = String(report.id || '').trim();
    if (!id) return;
    if (productId && String(report.productId || '').trim() !== productId) return;
    matched.set(id, report);
  };

  for (const report of params.reports) {
    if (reportId && String(report.id || '').trim() === reportId) add(report);
    if (planId && String(report.productionPlanId || '').trim() === planId) add(report);
    if (workOrderId && String(report.workOrderId || '').trim() === workOrderId) add(report);
  }

  if (params.plan?.id) {
    for (const report of filterReportsForProductionPlan(params.plan, params.reports)) {
      add(report);
    }
  }

  return Array.from(matched.values()).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** Legacy rows without processingState count as activated; pending/processing/failed do not. */
export function isFloorReportActivated(
  report: Pick<ProductionReport, 'processingState'>,
): boolean {
  const state = String(report.processingState || '').trim();
  return !state || state === 'completed';
}

export function isFloorReportCountingTowardIssue(
  report: Pick<ProductionReport, 'processingState' | 'reportType'>,
): boolean {
  return isFloorReportActivated(report) && countsTowardProductManufacturingVolume(report);
}

export function floorIssuePieceBalanceFromProduced(
  issuedQtyRaw: number,
  producedQtyRaw: number,
): FloorIssuePieceBalance {
  const issuedQty = Math.max(0, Number(issuedQtyRaw) || 0);
  const producedQty = Math.max(0, Number(producedQtyRaw) || 0);
  return {
    issuedQty,
    producedQty,
    remainingQty: Math.max(0, issuedQty - producedQty),
  };
}

/**
 * Single-issue balance without FIFO sharing (all matching activated reports count here).
 * Prefer `allocateFloorIssuePieceBalances` when multiple issues share the same plan reports.
 */
export function floorIssuePieceBalance(params: {
  issue: Pick<ProductionIssueOrder, 'quantity' | 'productId' | 'productionPlanId' | 'workOrderId' | 'productionReportId'>;
  plan?: ProductionPlan | null;
  reports: ProductionReport[];
}): FloorIssuePieceBalance {
  const issuedQty = Math.max(0, Number(params.issue.quantity || 0));
  const producedQty = reportsAffectedByFloorIssue(params)
    .filter(isFloorReportCountingTowardIssue)
    .reduce((sum, report) => sum + Math.max(0, Number(report.quantityProduced || 0)), 0);
  return floorIssuePieceBalanceFromProduced(issuedQty, producedQty);
}

/**
 * Allocate activated manufacturing-report qty across floor issues FIFO by issuedAt
 * so shared plan/work-order reports are not double-counted on every issue.
 */
export function allocateFloorIssuePieceBalances(params: {
  issues: Array<Pick<
    ProductionIssueOrder,
    'id' | 'quantity' | 'productId' | 'productionPlanId' | 'workOrderId' | 'productionReportId' | 'issuedAt' | 'createdAt'
  >>;
  reports: ProductionReport[];
  plansById?: Record<string, ProductionPlan | undefined | null>;
}): Map<string, FloorIssuePieceBalance> {
  const result = new Map<string, FloorIssuePieceBalance>();
  const pool = new Map<string, number>();

  for (const report of params.reports) {
    if (!isFloorReportCountingTowardIssue(report)) continue;
    const id = String(report.id || '').trim();
    if (!id) continue;
    pool.set(id, Math.max(0, Number(report.quantityProduced || 0)));
  }

  const sorted = [...params.issues].sort((a, b) => {
    const byTime = issueTimestamp(a).localeCompare(issueTimestamp(b));
    if (byTime !== 0) return byTime;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  for (const issue of sorted) {
    const issueId = String(issue.id || '').trim();
    const issuedQty = Math.max(0, Number(issue.quantity || 0));
    if (!issueId) continue;

    const planId = String(issue.productionPlanId || '').trim();
    const plan = planId ? params.plansById?.[planId] || null : null;
    const linked = reportsAffectedByFloorIssue({
      issue,
      plan,
      reports: params.reports,
    })
      .filter(isFloorReportCountingTowardIssue)
      .sort((a, b) => {
        const byDate = String(a.date || '').localeCompare(String(b.date || ''));
        if (byDate !== 0) return byDate;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

    let need = issuedQty;
    let producedQty = 0;
    for (const report of linked) {
      if (need <= 0) break;
      const reportId = String(report.id || '').trim();
      const available = Number(pool.get(reportId) || 0);
      if (available <= 0) continue;
      const take = Math.min(need, available);
      pool.set(reportId, available - take);
      producedQty += take;
      need -= take;
    }

    result.set(issueId, floorIssuePieceBalanceFromProduced(issuedQty, producedQty));
  }

  return result;
}

export function sumFloorIssuePieceBalances(
  balances: Iterable<FloorIssuePieceBalance>,
): FloorIssuePieceBalance {
  let issuedQty = 0;
  let producedQty = 0;
  for (const row of balances) {
    issuedQty += Math.max(0, Number(row.issuedQty) || 0);
    producedQty += Math.max(0, Number(row.producedQty) || 0);
  }
  return floorIssuePieceBalanceFromProduced(issuedQty, producedQty);
}

export function floorIssuePieceBalancesForProductCard(params: {
  card: FloorProductCard;
  reports: ProductionReport[];
  plansById?: Record<string, ProductionPlan | undefined | null>;
}): {
  byIssueId: Map<string, FloorIssuePieceBalance>;
  total: FloorIssuePieceBalance;
} {
  const byIssueId = allocateFloorIssuePieceBalances({
    issues: params.card.issues.map((issue) => issue.order),
    reports: params.reports,
    plansById: params.plansById,
  });
  return {
    byIssueId,
    total: sumFloorIssuePieceBalances(byIssueId.values()),
  };
}

