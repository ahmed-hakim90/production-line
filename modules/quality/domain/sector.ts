/**
 * Factory sectors from the standalone quality system.
 * "home" is home appliances and "seria" is the seria electrical line.
 * Hakim does not model these as HR departments or product categories.
 * They are tags on quality records, and optional tags pointing at existing products or lines.
 */
export type QualitySector = 'home' | 'seria';

export const QUALITY_SECTORS: Array<{ id: QualitySector; label: string }> = [
  { id: 'home', label: 'الأجهزة المنزلية' },
  { id: 'seria', label: 'قسم السريا' },
];

export function qualitySectorLabel(sector: QualitySector | 'all' | undefined): string {
  if (sector === 'seria') return 'قسم السريا';
  if (sector === 'home') return 'الأجهزة المنزلية';
  return 'المصنع بالكامل';
}

export function resolveRecordSector(
  selected: QualitySector | 'all',
  lineSector: QualitySector | null | undefined,
  productSector: QualitySector | null | undefined,
): QualitySector {
  if (selected !== 'all') return selected;
  const tagged = productSector || lineSector;
  if (!tagged) throw new Error('اختر قطاع الجودة قبل الحفظ. هذا السجل غير موسوم.');
  return tagged;
}

export function assertSectorMatch(
  lineSector: QualitySector | null | undefined,
  productSector: QualitySector | null | undefined,
): void {
  if (lineSector && productSector && lineSector !== productSector) {
    throw new Error('المنتج المختار موسوم بقطاع جودة مختلف عن خط الإنتاج.');
  }
}
