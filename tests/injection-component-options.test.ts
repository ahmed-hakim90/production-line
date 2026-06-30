import assert from 'node:assert/strict';
import {
  filterInjectionComponentOptions,
  mergeInjectionComponentOptions,
} from '../modules/production/utils/injectionComponentOptions.ts';

const materials = [
  {
    id: 'mat-1',
    code: 'INJ-00018',
    name: 'فانوس ابيض pp',
    type: 'semi_finished' as const,
    categoryName: 'حقن',
    baseUnit: 'piece' as const,
    isActive: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'mat-2',
    code: 'RM-OLD',
    name: 'مادة قديمة',
    type: 'raw_material' as const,
    categoryName: 'حقن',
    baseUnit: 'piece' as const,
    legacyRawMaterialId: 'raw-legacy-1',
    isActive: true,
    createdAt: '2026-01-01',
  },
];

const rawRows = [
  {
    id: 'raw-legacy-1',
    code: 'RM-OLD',
    name: 'مادة قديمة',
    categoryName: 'حقن',
    unit: 'piece',
    isActive: true,
  },
  {
    id: 'raw-only',
    code: 'RM-ONLY',
    name: 'مادة حقن قديمة',
    categoryName: 'حقن',
    unit: 'piece',
    isActive: true,
  },
];

const merged = mergeInjectionComponentOptions(materials, rawRows);
assert.equal(merged.some((row) => row.id === 'mat-1'), true);
assert.equal(merged.some((row) => row.id === 'raw-only'), true);
assert.equal(merged.some((row) => row.id === 'raw-legacy-1'), false, 'linked legacy row is hidden');

const injectionOnly = filterInjectionComponentOptions(merged, 'حقن');
assert.equal(injectionOnly.some((row) => row.code === 'INJ-00018'), true);

console.log('injection-component-options.test.ts: ok');
