import type { BomItem } from '../types';

export const bomItemIdentity = (
  item: Pick<BomItem, 'itemType' | 'itemId'>,
) => `${String(item.itemType || '').trim()}:${String(item.itemId || '').trim()}`;

export const deterministicBomItemId = (
  bomId: string,
  item: Pick<BomItem, 'itemType' | 'itemId'>,
) => [bomId, item.itemType, item.itemId]
  .map((part) => encodeURIComponent(String(part || '').trim()))
  .join('__');

export function assertUniqueBomItem(
  rows: Array<Pick<BomItem, 'id' | 'itemType' | 'itemId'>>,
  candidate: Pick<BomItem, 'itemType' | 'itemId'>,
  editingItemId?: string,
): void {
  const identity = bomItemIdentity(candidate);
  const duplicate = rows.find(
    (row) => row.id !== editingItemId && bomItemIdentity(row) === identity,
  );
  if (duplicate) {
    throw new Error('هذا المكوّن مرتبط بالمنتج بالفعل؛ عدّل السطر الموجود بدلاً من إضافته مرة أخرى.');
  }
}
