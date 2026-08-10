import assert from 'node:assert/strict';
import {
  THEME_PRESETS,
  secondaryFromPrimary,
  softAccentFromPrimary,
  tintedBackgroundFromPrimary,
} from '../core/ui-engine/theme/themePresets.ts';

{
  assert.ok(THEME_PRESETS.length >= 10);
  const ids = new Set(THEME_PRESETS.map((p) => p.id));
  assert.equal(ids.size, THEME_PRESETS.length, 'preset ids must be unique');
}

{
  for (const preset of THEME_PRESETS) {
    const t = preset.partialTheme;
    assert.ok(t.primaryColor, `${preset.id}: primary`);
    assert.ok(t.secondaryColor, `${preset.id}: secondary`);
    assert.ok(t.successColor, `${preset.id}: success`);
    assert.ok(t.warningColor, `${preset.id}: warning`);
    assert.ok(t.dangerColor, `${preset.id}: danger`);
    assert.ok(t.backgroundColor, `${preset.id}: background`);
    assert.ok(t.textColor, `${preset.id}: text`);
    assert.ok(t.mutedTextColor, `${preset.id}: muted`);
    assert.deepEqual(t.cssVars, {}, `${preset.id}: cssVars must clear sticky overrides`);
    assert.equal(preset.swatches.length, 3);
    assert.equal(preset.swatches[2].toLowerCase(), (t.primaryColor || '').toLowerCase());
  }
}

{
  const light = THEME_PRESETS.filter((p) => p.partialTheme.darkMode === 'light');
  const dark = THEME_PRESETS.filter((p) => p.partialTheme.darkMode === 'dark');
  assert.ok(light.length >= 8);
  assert.ok(dark.length >= 2);

  for (const preset of light) {
    assert.notEqual(
      (preset.partialTheme.backgroundColor || '').toLowerCase(),
      '#f0f2f5',
      `${preset.id}: light themes should use tinted backgrounds, not flat gray`,
    );
  }

  for (const preset of dark) {
    assert.equal(preset.partialTheme.backgroundColor, '#020617');
  }
}

{
  const primary = '#0284C7';
  const secondary = secondaryFromPrimary(primary);
  const soft = softAccentFromPrimary(primary);
  const bg = tintedBackgroundFromPrimary(primary);
  assert.match(secondary, /^#[0-9a-fA-F]{6}$/);
  assert.match(soft, /^#[0-9a-fA-F]{6}$/);
  assert.match(bg, /^#[0-9a-fA-F]{6}$/);
  assert.notEqual(secondary.toLowerCase(), primary.toLowerCase());
  assert.notEqual(soft.toLowerCase(), primary.toLowerCase());
}

{
  const successes = new Set(THEME_PRESETS.map((p) => p.partialTheme.successColor));
  const warnings = new Set(THEME_PRESETS.map((p) => p.partialTheme.warningColor));
  const dangers = new Set(THEME_PRESETS.map((p) => p.partialTheme.dangerColor));
  assert.equal(successes.size, 1, 'success color stays stable across presets');
  assert.equal(warnings.size, 1, 'warning color stays stable across presets');
  assert.equal(dangers.size, 1, 'danger color stays stable across presets');
}

console.log('theme-presets-harmony.test.ts: ok');
