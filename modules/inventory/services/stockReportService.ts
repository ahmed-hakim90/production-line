import type { PeriodBalanceReport, StockTransaction } from '../types';
import { buildDailyNetFromTransactions, buildPeriodBalanceReport } from '../engines/periodBalanceEngine';
import { stockService } from './stockService';

const MAX_PAGES = 200;
const PAGE_SIZE = 100;

/**
 * Cursor-paginate all transactions in a date range (no silent 500-row truncation).
 */
export async function fetchAllTransactionsInRange(params: {
  warehouseId?: string;
  startDate: string;
  endDate: string;
  sourceModule?: StockTransaction['sourceModule'];
}): Promise<{ transactions: StockTransaction[]; truncated: boolean }> {
  const transactions: StockTransaction[] = [];
  let cursor: Awaited<ReturnType<typeof stockService.getTransactionsPaged>>['nextCursor'] = null;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await stockService.getTransactionsPaged({
      warehouseId: params.warehouseId,
      startDate: params.startDate,
      endDate: params.endDate,
      sourceModule: params.sourceModule,
      limit: PAGE_SIZE,
      cursor: cursor || undefined,
    });
    transactions.push(...res.items);
    if (!res.hasMore || !res.nextCursor) break;
    cursor = res.nextCursor;
    if (page === MAX_PAGES - 1 && res.hasMore) truncated = true;
  }

  return { transactions, truncated };
}

export const stockReportService = {
  async buildWarehousePeriodReport(params: {
    warehouseId: string;
    startDate: string;
    endDate: string;
  }): Promise<PeriodBalanceReport & { truncated?: boolean; daily?: ReturnType<typeof buildDailyNetFromTransactions> }> {
    const [balances, txResult] = await Promise.all([
      stockService.getBalances(params.warehouseId),
      fetchAllTransactionsInRange({
        warehouseId: params.warehouseId,
        startDate: params.startDate,
        endDate: params.endDate,
      }),
    ]);

    const report = buildPeriodBalanceReport({
      warehouseId: params.warehouseId,
      startDate: params.startDate,
      endDate: params.endDate,
      currentBalances: balances,
      transactionsInPeriod: txResult.transactions,
    });

    return {
      ...report,
      truncated: txResult.truncated,
      daily: buildDailyNetFromTransactions(txResult.transactions),
    };
  },
};
