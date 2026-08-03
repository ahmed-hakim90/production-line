import assert from 'node:assert/strict';
import {
  conversionRateFromWeightPerPiece,
  materialPurchaseCostPerBaseUnit,
  weightPerPieceFromConversionRate,
} from '../modules/manufacturing/types.ts';

const weightPerPieceKg = 0.17;
const conversionRate = conversionRateFromWeightPerPiece(weightPerPieceKg);

assert.ok(Math.abs(conversionRate - 5.88235294117647) < 1e-10);
assert.ok(Math.abs(weightPerPieceFromConversionRate(conversionRate) - weightPerPieceKg) < 1e-10);
assert.ok(
  Math.abs(
    materialPurchaseCostPerBaseUnit({ purchaseCost: 95, conversionRate }) - 16.15,
  ) < 1e-10,
);

console.log('material-cost tests passed');
