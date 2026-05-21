import type { AssetDepreciationMethod } from '../../../types';

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min = 0): number => (value < min ? min : value);

export const calculateMonthlyDepreciation = (
  purchaseCost: number,
  salvageValue: number,
  usefulLifeMonths: number,
  method: AssetDepreciationMethod,
  accumulatedDepreciation = 0,
): number => {
  const safeCost = clamp(toNumber(purchaseCost));
  const safeSalvage = clamp(toNumber(salvageValue));
  const safeLife = Math.max(1, Math.floor(toNumber(usefulLifeMonths, 1)));
  const depreciable = Math.max(0, safeCost - safeSalvage);
  const accumulated = clamp(toNumber(accumulatedDepreciation));

  if (method === 'declining_balance') {
    const rate = 2 / safeLife;
    const bookValue = Math.max(safeSalvage, safeCost - accumulated);
    return Math.max(0, bookValue * rate);
  }
  return depreciable / safeLife;
};
