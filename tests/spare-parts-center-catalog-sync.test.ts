import assert from 'node:assert/strict';

/**
 * Pure helpers mirrored from sparePartsService linking rules —
 * keep center catalog sync discoverable for regression.
 */
function partLinkedToMaterial(
  part: { materialId?: string; rawMaterialId?: string },
  materialId: string,
): boolean {
  const linked = String(part.materialId || part.rawMaterialId || '').trim();
  return linked === materialId;
}

function nextSparePartCode(parts: Array<{ code?: string }>): string {
  const maxSerial = parts.reduce((max, part) => {
    const match = String(part.code || '').trim().toUpperCase().match(/^SP-(\d{3})$/);
    if (!match) return max;
    const current = Number(match[1] || 0);
    return Number.isFinite(current) ? Math.max(max, current) : max;
  }, 0);
  return `SP-${String(maxSerial + 1).padStart(3, '0')}`;
}

{
  assert.equal(partLinkedToMaterial({ materialId: 'm1' }, 'm1'), true);
  assert.equal(partLinkedToMaterial({ rawMaterialId: 'm1' }, 'm1'), true);
  assert.equal(partLinkedToMaterial({ materialId: 'm2' }, 'm1'), false);
}

{
  assert.equal(nextSparePartCode([]), 'SP-001');
  assert.equal(nextSparePartCode([{ code: 'SP-007' }, { code: 'X-1' }]), 'SP-008');
}

console.log('spare-parts-center-catalog-sync.test.ts: ok');
