import type { Asset, AssetDepreciationRunResult } from '../../../types';
import { assetDepreciationService } from './assetDepreciationService';
import { assetService, calculateMonthlyDepreciation } from './assetService';

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPeriod = (input?: string): string => {
  if (input && /^\d{4}-\d{2}$/.test(input)) return input;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const periodToDate = (period: string): Date => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1);
};

const dateToPeriod = (date: Date): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
);

const addMonths = (period: string, months: number): string => {
  const base = periodToDate(period);
  return dateToPeriod(new Date(base.getFullYear(), base.getMonth() + months, 1));
};

const periodToLastDay = (period: string): Date => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month, 0, 23, 59, 59, 999);
};

const comparePeriods = (a: string, b: string): number => a.localeCompare(b);

const isAssetEligibleForPeriod = (asset: Asset, period: string): boolean => {
  const purchaseDate = new Date(asset.purchaseDate || '');
  if (Number.isNaN(purchaseDate.getTime())) return false;
  return purchaseDate <= periodToLastDay(period);
};

const getPurchaseStartPeriod = (asset: Asset): string | null => {
  const purchaseDate = new Date(asset.purchaseDate || '');
  if (Number.isNaN(purchaseDate.getTime())) return null;
  return dateToPeriod(new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), 1));
};

const getDepreciationAmount = (asset: Asset): number => {
  const purchaseCost = Math.max(0, toNumber(asset.purchaseCost));
  const salvageValue = Math.max(0, toNumber(asset.salvageValue));
  const accumulated = Math.max(0, toNumber(asset.accumulatedDepreciation));
  const usefulLifeMonths = Math.max(1, Math.floor(toNumber(asset.usefulLifeMonths, 1)));
  const fallbackMonthly = calculateMonthlyDepreciation(
    purchaseCost,
    salvageValue,
    usefulLifeMonths,
    asset.depreciationMethod || 'straight_line',
  );
  const plannedMonthly = Math.max(0, toNumber(asset.monthlyDepreciation || fallbackMonthly, fallbackMonthly));
  const depreciableTotal = Math.max(0, purchaseCost - salvageValue);
  const remaining = Math.max(0, depreciableTotal - accumulated);
  return Math.min(plannedMonthly, remaining);
};

export const assetDepreciationJobService = {
  async runForPeriod(periodInput?: string): Promise<AssetDepreciationRunResult> {
    const period = toPeriod(periodInput);
    const activeAssets = await assetService.getActive();

    let processedAssets = 0;
    let createdEntries = 0;
    let skippedEntries = 0;

    for (const asset of activeAssets) {
      if (!asset.id) continue;
      if (!isAssetEligibleForPeriod(asset, period)) {
        skippedEntries += 1;
        continue;
      }
      const purchaseStart = getPurchaseStartPeriod(asset);
      if (!purchaseStart) {
        skippedEntries += 1;
        continue;
      }
      const startPeriod = purchaseStart;
      if (comparePeriods(startPeriod, period) > 0) {
        skippedEntries += 1;
        continue;
      }

      let runningAccumulated = 0;
      let runningBookValue = Math.max(0, toNumber(asset.purchaseCost));
      let assetHasNewEntries = false;
      const depreciationAmountPerMonth = getDepreciationAmount({
        ...asset,
        accumulatedDepreciation: 0,
      });

      for (let cursor = startPeriod; comparePeriods(cursor, period) <= 0; cursor = addMonths(cursor, 1)) {
        const depreciationAmount = Math.min(
          depreciationAmountPerMonth,
          Math.max(0, toNumber(asset.purchaseCost) - toNumber(asset.salvageValue) - runningAccumulated),
        );
        if (depreciationAmount <= 0) {
          break;
        }

        const nextAccumulated = Math.max(0, runningAccumulated + depreciationAmount);
        const nextBookValue = Math.max(
          Math.max(0, toNumber(asset.salvageValue)),
          Math.max(0, toNumber(asset.purchaseCost)) - nextAccumulated,
        );

        await assetDepreciationService.upsert({
          assetId: asset.id,
          period: cursor,
          depreciationAmount,
          accumulatedDepreciation: nextAccumulated,
          bookValue: nextBookValue,
        });

        runningAccumulated = nextAccumulated;
        runningBookValue = nextBookValue;
        createdEntries += 1; // Includes updates for existing months to heal sparse schedules.
        assetHasNewEntries = true;
      }

      if (!assetHasNewEntries) {
        skippedEntries += 1;
        continue;
      }

      await assetService.update(asset.id, {
        accumulatedDepreciation: runningAccumulated,
        currentValue: runningBookValue,
      });

      processedAssets += 1;
    }

    return {
      period,
      processedAssets,
      createdEntries,
      skippedEntries,
    };
  },
};
