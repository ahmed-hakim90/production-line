import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  darkenHex,
  lightenHex,
  resolveImageExportPalette,
  Factory_IMAGE_PRIMARY,
} from '../utils/imageExportTheme.ts';
import { resolvePrintAccentHex } from '../utils/printTheme.ts';

describe('resolveImageExportPalette', () => {
  it('derives soft badge and track colors from primary', () => {
    const palette = resolveImageExportPalette('#4F46E5');
    assert.equal(palette.primary, '#4F46E5');
    assert.equal(palette.badgeText, '#4F46E5');
    assert.match(palette.badgeBg, /^#[0-9a-f]{6}$/i);
    assert.match(palette.progressTrack, /^#[0-9a-f]{6}$/i);
    assert.notEqual(palette.badgeBg.toLowerCase(), palette.primary.toLowerCase());
  });

  it('falls back to Factory default for invalid input', () => {
    const palette = resolveImageExportPalette('not-a-color');
    assert.equal(palette.primary, Factory_IMAGE_PRIMARY);
  });

  it('accepts hex without leading hash', () => {
    assert.equal(resolveImageExportPalette('059669').primary, '#059669');
  });
});

describe('hex mix helpers', () => {
  it('lightens and darkens toward white/black', () => {
    const light = lightenHex('#000000', 0.5);
    const dark = darkenHex('#ffffff', 0.5);
    assert.equal(light.toLowerCase(), '#808080');
    assert.equal(dark.toLowerCase(), '#808080');
  });
});

describe('resolvePrintAccentHex', () => {
  it('prefers explicit print primary over UI fallback', () => {
    assert.equal(resolvePrintAccentHex('#1f2937'), '#1f2937');
  });
});
