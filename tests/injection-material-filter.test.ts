import assert from 'node:assert/strict';
import {
  isInjectionMaterial,
  parseInjectionCategoryTokens,
} from '../modules/production/utils/injectionMaterialFilter.ts';

const tokens = parseInjectionCategoryTokens('حقن, injection');

assert.equal(
  isInjectionMaterial({ categoryName: 'مكونات حقن', name: 'سنادة' }, tokens),
  true,
);

assert.equal(
  isInjectionMaterial({ categoryName: '', name: 'مكون حقن علوي', code: 'A-001' }, tokens),
  true,
);

assert.equal(
  isInjectionMaterial({ name: 'Upper component', code: 'INJECTION-001' }, tokens),
  true,
);

assert.equal(
  isInjectionMaterial({ categoryName: 'مواد تعبئة', name: 'مكون حقن' }, tokens),
  false,
);

assert.equal(
  isInjectionMaterial({ categoryName: '', name: 'مادة عادية', code: 'RM-001' }, tokens),
  false,
);

console.log('injection-material-filter.test.ts: ok');
