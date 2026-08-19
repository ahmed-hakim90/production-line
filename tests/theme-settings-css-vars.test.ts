import assert from 'node:assert/strict';
import { DEFAULT_THEME } from '../utils/dashboardConfig.ts';
import { buildThemeSettingsCssVars } from '../core/ui-engine/theme/themeCssVars.ts';

{
  const vars = buildThemeSettingsCssVars({
    ...DEFAULT_THEME,
    secondaryColor: '#112233',
    successColor: '#00aa00',
    warningColor: '#ffaa00',
    dangerColor: '#cc0000',
    mutedTextColor: '#556677',
    baseFontFamily: 'Cairo',
    baseFontSize: 16,
    borderRadius: 10,
    density: 'comfortable',
    contentMaxWidth: '1400px',
  });

  assert.equal(vars['--color-secondary-hex'], '#112233');
  assert.equal(vars['--color-success-hex'], '#00aa00');
  assert.equal(vars['--color-warning-hex'], '#ffaa00');
  assert.equal(vars['--color-danger-hex'], '#cc0000');
  assert.equal(vars['--color-text-muted'], '#556677');
  assert.match(vars['--font-family-base'] || '', /Cairo/);
  assert.equal(vars['--font-size-base'], '16px');
  assert.equal(vars['--border-radius-base'], '10px');
  assert.equal(vars['--border-radius-lg'], '14px');
  assert.equal(vars['--radius'], '10px');
  assert.equal(vars['--density-scale'], '1');
  assert.equal(vars['--content-max-width'], '1400px');
  assert.equal(vars['--color-secondary'], '17 34 51');
  assert.equal(vars['--control-height'], '43px'); // 38 * (16/14)
  assert.equal(vars['--control-height-lg'], '48px'); // 42 * (16/14)
}

{
  const compact = buildThemeSettingsCssVars({
    ...DEFAULT_THEME,
    baseFontSize: 14,
    density: 'compact',
  });
  assert.equal(compact['--density-scale'], '0.92');
  assert.equal(compact['--font-size-base'], '13px');
  assert.equal(compact['--control-height'], '32px');
  assert.equal(compact['--control-height-lg'], '36px');
}

{
  const sharp = buildThemeSettingsCssVars({
    ...DEFAULT_THEME,
    borderRadius: 0,
    cssVars: { ...DEFAULT_THEME.cssVars, '--radius': '0.75rem' },
  });
  assert.equal(sharp['--border-radius-sm'], '0px');
  assert.equal(sharp['--border-radius-base'], '0px');
  assert.equal(sharp['--border-radius-lg'], '0px');
  assert.equal(sharp['--border-radius-xl'], '0px');
  assert.equal(sharp['--radius'], '0px');
}

{
  const darkMuted = buildThemeSettingsCssVars(
    { ...DEFAULT_THEME, mutedTextColor: undefined },
    'dark',
  );
  assert.equal(darkMuted['--color-text-muted'], '#94a3b8');
}

{
  assert.equal(DEFAULT_THEME.baseFontFamily, 'Cairo');
  const fromLegacy = buildThemeSettingsCssVars({
    ...DEFAULT_THEME,
    baseFontFamily: 'IBM Plex Sans Arabic',
  });
  assert.match(fromLegacy['--font-family-base'] || '', /Cairo/);
  assert.doesNotMatch(fromLegacy['--font-family-base'] || '', /IBM Plex/);
}

console.log('theme-settings-css-vars.test.ts: ok');
