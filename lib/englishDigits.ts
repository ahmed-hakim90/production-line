/**
 * Normalize Eastern Arabic / Persian digits to Western (0–9) for inputs and parsers.
 */

export function toEnglishDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    // Arabic decimal ٫ → `.` ; thousands ٬ dropped
    .replace(/[٫٬]/g, (ch) => (ch === '٫' ? '.' : ''));
}

export function hasNonEnglishDigits(value: string): boolean {
  return /[٠-٩۰-۹٫٬]/.test(value);
}

/** Number / tel / date-like fields, or explicit opt-in via data-english-digits / inputMode. */
export function isEnglishDigitsInput(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  if (el.dataset.englishDigits === 'false') return false;
  if (el.dataset.englishDigits === 'true') return true;

  if (el instanceof HTMLTextAreaElement) {
    return el.inputMode === 'numeric' || el.inputMode === 'decimal';
  }

  const type = (el.type || 'text').toLowerCase();
  if (
    type === 'number' ||
    type === 'tel' ||
    type === 'date' ||
    type === 'time' ||
    type === 'datetime-local' ||
    type === 'month' ||
    type === 'week'
  ) {
    return true;
  }

  return el.inputMode === 'numeric' || el.inputMode === 'decimal';
}
