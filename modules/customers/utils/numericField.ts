/**
 * يطبيع قيم مالية قادمة من Firestore أو استيراد Excel (نص بفواصل، أرقام عربية شرقية، إلخ).
 * يعيد null إن لم يُستنتج رقم صالح.
 */
export function parseNumericField(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'bigint') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  let s = String(v).trim();
  if (!s) return null;
  s = s
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .replace(/٬/g, '')
    .replace(/٫/g, '.')
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0));
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function coerceNumericField(v: unknown): number {
  return parseNumericField(v) ?? 0;
}
