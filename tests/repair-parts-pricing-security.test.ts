import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canManageRepairPartsPricing,
  normalizeRepairPartsPricingUpdates,
  validateRepairPartsPricingMaterial,
} from '../functions/src/repairPartsPricingOps';

const update = normalizeRepairPartsPricingUpdates([{
  materialId: 'material-1',
  code: 'MAT-001',
  current: { consumer: 100, trader: 80, cost: 50 },
  next: { consumer: 120, trader: 90, cost: 55 },
}])[0];

describe('repair parts pricing backend security', () => {
  it('requires the pricing permission unless the actor is a super admin', () => {
    assert.equal(canManageRepairPartsPricing({ isSuperAdmin: false, permissions: {} }), false);
    assert.equal(canManageRepairPartsPricing({
      isSuperAdmin: false,
      permissions: { 'repair.pricing.manage': true },
    }), true);
    assert.equal(canManageRepairPartsPricing({ isSuperAdmin: true, permissions: {} }), true);
  });

  it('rejects cross-tenant material updates', () => {
    assert.throws(
      () => validateRepairPartsPricingMaterial({
        tenantId: 'tenant-b',
        code: 'MAT-001',
        type: 'raw_material',
        isActive: true,
        defaultSalePrice: 100,
        traderSalePrice: 80,
        purchaseCost: 50,
      }, update, 'tenant-a'),
      (error: unknown) => (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'permission-denied'
      ),
    );
  });

  it('rejects unexpected input fields and stale prices', () => {
    assert.throws(() => normalizeRepairPartsPricingUpdates([{
      materialId: 'material-1',
      code: 'MAT-001',
      current: { consumer: 100, trader: 80, cost: 50 },
      next: { consumer: 120, trader: 90, cost: 55 },
      tenantId: 'attacker-controlled',
    }]), /حقول غير مسموحة/);

    assert.throws(
      () => validateRepairPartsPricingMaterial({
        tenantId: 'tenant-a',
        code: 'MAT-001',
        type: 'raw_material',
        isActive: true,
        defaultSalePrice: 101,
        traderSalePrice: 80,
        purchaseCost: 50,
      }, update, 'tenant-a'),
      (error: unknown) => (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'failed-precondition'
      ),
    );
  });
});
