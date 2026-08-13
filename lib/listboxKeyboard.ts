const DOWN_KEYS = new Set(['ArrowDown', 'Down']);
const UP_KEYS = new Set(['ArrowUp', 'Up']);

export function isListboxNavKey(key: string): boolean {
  return DOWN_KEYS.has(key) || UP_KEYS.has(key) || key === 'Home' || key === 'End';
}

export function isListboxOpenKey(key: string): boolean {
  return DOWN_KEYS.has(key) || UP_KEYS.has(key);
}

/** Next highlighted index for a vertical listbox. Loops at both ends. */
export function listboxIndexAfterKey(key: string, current: number, length: number): number {
  if (length <= 0) return 0;
  const max = length - 1;
  const safe = Math.max(0, Math.min(current, max));
  if (DOWN_KEYS.has(key)) return safe === max ? 0 : safe + 1;
  if (UP_KEYS.has(key)) return safe === 0 ? max : safe - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return max;
  return safe;
}
