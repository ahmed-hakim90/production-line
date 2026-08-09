export const DEFAULT_UNREPAIRABLE_REASONS = [
    { id: 'parts_unavailable', label: 'قطع الغيار غير متوفرة', enabled: true },
    { id: 'parts_discontinued', label: 'قطع الغيار متوقفة أو الموديل قديم', enabled: true },
    { id: 'uneconomical_repair', label: 'تكلفة الإصلاح غير اقتصادية', enabled: true },
    { id: 'severe_damage', label: 'تلف جسيم لا يمكن إصلاحه', enabled: true },
    { id: 'liquid_or_fire_damage', label: 'تلف بسبب سوائل أو حريق', enabled: true },
    { id: 'previous_tampering', label: 'عبث أو إصلاح سابق يمنع الإصلاح', enabled: true },
    { id: 'outside_service_scope', label: 'العطل خارج نطاق خدمات المركز', enabled: true },
    { id: 'other', label: 'سبب آخر', enabled: true },
];
export function normalizeUnrepairableReasons(raw) {
    if (!Array.isArray(raw) || raw.length === 0)
        return DEFAULT_UNREPAIRABLE_REASONS;
    const normalized = raw.slice(0, 50).map((value, index) => {
        const row = value && typeof value === 'object' ? value : {};
        return {
            id: String(row.id || `reason-${index + 1}`).trim().slice(0, 80),
            label: String(row.label || '').trim().slice(0, 200),
            enabled: row.enabled !== false,
        };
    }).filter((row) => row.id && row.label);
    return normalized.length > 0 ? normalized : DEFAULT_UNREPAIRABLE_REASONS;
}
export function resolveUnrepairableReason(rawCatalog, reasonCode) {
    const code = String(reasonCode || '').trim();
    if (!code)
        return null;
    return normalizeUnrepairableReasons(rawCatalog).find((row) => row.enabled !== false && row.id === code) || null;
}
