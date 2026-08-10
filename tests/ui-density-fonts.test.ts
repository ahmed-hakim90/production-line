import assert from 'node:assert/strict';
import { applyUiDensity } from '../core/ui-engine/density/uiDensity.ts';

{
  // jsdom-less: applyUiDensity is a no-op without document — just ensure export is callable.
  // When document exists (browser), it must not overwrite theme font vars.
  const hadDocument = typeof document !== 'undefined';
  if (hadDocument) {
    const root = document.documentElement;
    root.style.setProperty('--font-size-base', '16px');
    root.style.setProperty('--font-size-sm', '15px');
    root.style.setProperty('--control-height', '43px');
    applyUiDensity('compact');
    assert.equal(root.style.getPropertyValue('--font-size-base').trim(), '16px');
    assert.equal(root.style.getPropertyValue('--font-size-sm').trim(), '15px');
    assert.equal(root.style.getPropertyValue('--control-height').trim(), '43px');
    assert.equal(root.dataset.uiDensity, 'compact');
    assert.equal(root.style.getPropertyValue('--density-scale').trim(), '0.92');
    applyUiDensity('comfortable');
    assert.equal(root.style.getPropertyValue('--font-size-base').trim(), '16px');
    assert.equal(root.dataset.uiDensity, 'comfortable');
    assert.equal(root.style.getPropertyValue('--density-scale').trim(), '1');
  }
}

console.log('ui-density-fonts.test.ts: ok');
