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

const periodToLastDay = (period: string): Date => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month, 0, 23, 59, 59, 999);
};

const isAssetEligibleForPeriod = (asset: Asset, period: string): boolean => {
  const purchaseDate = new Date(asset.purchaseDate || '');
  if (Number.isNaN(purchaseDate.getTime())) return false;
  return purchaseDate <= periodToLastDay(period);
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
    const existingEntries = await assetDepreciationService.getByPeriod(period);
    const existingAssetIds = new Set(existingEntries.map((entry) => String(entry.assetId)));

    let processedAssets = 0;
    let createdEntries = 0;
    let skippedEntries = 0;

    for (const asset of activeAssets) {
      if (!asset.id) continue;
      if (!isAssetEligibleForPeriod(asset, period)) {
        skippedEntries += 1;
        continue;
      }
      if (existingAssetIds.has(asset.id)) {
        skippedEntries += 1;
        continue;
      }

      const depreciationAmount = getDepreciationAmount(asset);
      if (depreciationAmount <= 0) {
        skippedEntries += 1;
        continue;
      }

      const nextAccumulated = Math.max(0, toNumber(asset.accumulatedDepreciation) + depreciationAmount);
      const nextBookValue = Math.max(
        Math.max(0, toNumber(asset.salvageValue)),
        Math.max(0, toNumber(asset.purchaseCost)) - nextAccumulated,
      );

      await assetDepreciationService.upsert({
        assetId: asset.id,
        period,
        depreciationAmount,
        accumulatedDepreciation: nextAccumulated,
        bookValue: nextBookValue,
      });

      await assetService.update(asset.id, {
        accumulatedDepreciation: nextAccumulated,
        currentValue: nextBookValue,
      });

      processedAssets += 1;
      createdEntries += 1;
    }

    return {
      period,
      processedAssets,
      createdEntries,
      skippedEntries,
    };
  },
};
