/**
 * Contract: header action chrome (PageHeader / ModuleOpsPageShell) must read
 * theme tokens from buildThemeSettingsCssVars — not hardcoded rem/px.
 */
import assert from 'node:assert/strict';
import { DEFAULT_THEME } from '../utils/dashboardConfig.ts';
import { buildThemeSettingsCssVars } from '../core/ui-engine/theme/themeCssVars.ts';

{
  const comfortable = buildThemeSettingsCssVars({
    ...DEFAULT_THEME,
    baseFontSize: 16,
    borderRadius: 8,
    density: 'comfortable',
  });

  assert.equal(comfortable['--font-size-sm'], '15px');
  assert.equal(comfortable['--font-family-base']?.includes(DEFAULT_THEME.baseFontFamily || ''), true);
  assert.equal(comfortable['--border-radius-base'], '8px');
  assert.equal(comfortable['--radius'], '8px');
  assert.ok(Number.parseInt(comfortable['--control-height'] || '0', 10) >= 32);
}

{
  const sharpCompact = buildThemeSettingsCssVars({
    ...DEFAULT_THEME,
    baseFontSize: 12,
    borderRadius: 0,
    density: 'compact',
  });

  assert.equal(sharpCompact['--border-radius-base'], '0px');
  assert.equal(sharpCompact['--radius'], '0px');
  assert.equal(sharpCompact['--font-size-base'], '11px'); // 12 * 0.92
  assert.ok(Number.parseInt(sharpCompact['--control-height-sm'] || '0', 10) >= 28);
}

console.log('theme-header-action-tokens.test.ts: ok');
