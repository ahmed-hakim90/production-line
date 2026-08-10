import { useEffect } from 'react';
import { applyThemeTypographyForDensity } from './applyThemeTypography';
import { applyUiDensity, readUiDensity } from './uiDensity';

/** One-shot: sync CSS variables from localStorage on app load. */
export function UiDensityBootstrap() {
  useEffect(() => {
    const density = readUiDensity();
    applyUiDensity(density);
    applyThemeTypographyForDensity(density);
  }, []);
  return null;
}
