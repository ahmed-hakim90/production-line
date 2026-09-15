import { HttpsError } from 'firebase-functions/v2/https';
function fail(message) { throw new HttpsError('invalid-argument', message); }
/** Validate against the server template, never trust client labels/types or omitted required checks. */
export function validateQualityResults(template, input) {
    if (!Array.isArray(input) || input.length > template.length)
        fail('نتائج الجودة لا تطابق النموذج.');
    const checks = new Map(template.map(check => [check.id, check]));
    if (checks.size !== template.length)
        fail('نموذج الجودة يحتوي معايير مكررة؛ راجع مدير الجودة.');
    const seen = new Set();
    const results = input.map(result => {
        if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.checkId !== 'string')
            fail('نتيجة فحص غير صالحة.');
        const check = checks.get(result.checkId);
        if (!check || seen.has(result.checkId))
            fail('معيار غير معروف أو مكرر.');
        seen.add(result.checkId);
        const value = result.value;
        if (check.inputType === 'number') {
            if (typeof value !== 'number' || !Number.isFinite(value))
                fail('قيمة الفحص يجب أن تكون رقمًا صالحًا.');
            if ((check.minValue !== undefined && value < check.minValue) || (check.maxValue !== undefined && value > check.maxValue))
                fail(`قيمة ${check.label} خارج الحدود المعرفة.`);
        }
        else if (check.inputType === 'text') {
            if (typeof value !== 'string' || !value.trim() || value.length > 2000)
                fail('نص الفحص مطلوب بحد أقصى ٢٠٠٠ حرف.');
        }
        else
            fail('نوع معيار غير مدعوم.');
        if (result.notes !== undefined && (typeof result.notes !== 'string' || result.notes.length > 500))
            fail('ملاحظات الفحص بحد أقصى ٥٠٠ حرف.');
        return { checkId: check.id, label: check.label, value: typeof value === 'string' ? value.trim() : value, notes: String(result.notes || '').trim() };
    });
    if (template.some(check => check.required && !seen.has(check.id)))
        fail('استكمل كل معايير الفحص الإلزامية.');
    return results;
}
