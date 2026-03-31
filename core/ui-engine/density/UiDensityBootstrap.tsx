import { useEffect } from 'react';
import { applyUiDensity, readUiDensity } from './uiDensity';

/** One-shot: sync CSS variables from localStorage on app load. */
export function UiDensityBootstrap() {
  useEffect(() => {
    applyUiDensity(readUiDensity());
  }, []);
  return null;
}
