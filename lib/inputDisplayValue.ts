/**
 * For controlled inputs: when the stored value is exactly 0, show empty so `placeholder` is visible.
 * Does not change `null` / `undefined` (leave those to the caller).
 */
export function hideZeroForInput(value: unknown): unknown {
  if (value === 0 || value === '0') return '';
  return value;
}
