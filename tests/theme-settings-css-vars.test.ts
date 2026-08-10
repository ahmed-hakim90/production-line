import assert from 'node:assert/strict';
import { DEFAULT_THEME } from '../utils/dashboardConfig.ts';
import { buildThemeSettingsCssVars } from '../core/ui-engine/theme/tenantTheme.ts';

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
  assert.equal(vars['--density-scale'], '1');
  assert.equal(vars['--content-max-width'], '1400px');
  assert.equal(vars['--color-secondary'], '17 34 51');
}

{
  const compact = buildThemeSettingsCssVars({
    ...DEFAULT_THEME,
    baseFontSize: 14,
    density: 'compact',
  });
  assert.equal(compact['--density-scale'], '0.92');
  assert.equal(compact['--font-size-base'], '13px');
}

{
  const darkMuted = buildThemeSettingsCssVars(
    { ...DEFAULT_THEME, mutedTextColor: undefined },
    'dark',
  );
  assert.equal(darkMuted['--color-text-muted'], '#94a3b8');
}

console.log('theme-settings-css-vars.test.ts: ok');
