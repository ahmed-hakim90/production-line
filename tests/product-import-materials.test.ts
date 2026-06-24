import assert from 'node:assert/strict';
import {
  resolveProductImportMaterial,
  type ProductImportMaterialCatalogItem,
} from '../utils/importProducts.ts';

const materials: ProductImportMaterialCatalogItem[] = [
  { id: 'm1', code: 'MAT-001', name: 'موتور نحاس', baseUnit: 'piece', isActive: true },
  { id: 'm2', code: 'MAT-002', name: 'هيكل بلاستيك', baseUnit: 'kg', isActive: true },
  { id: 'm3', code: 'MAT-003', name: 'اسم مكرر', baseUnit: 'piece', isActive: true },
  { id: 'm4', code: 'MAT-004', name: 'اسم مكرر', baseUnit: 'piece', isActive: true },
  { id: 'm5', code: 'MAT-005', name: 'مادة موقوفة', baseUnit: 'piece', isActive: false },
];

{
  const resolved = resolveProductImportMaterial(
    { materialCode: 'mat-001', materialName: 'اسم مختلف' },
    materials,
  );
  assert.equal(resolved.material?.id, 'm1');
}

{
  const resolved = resolveProductImportMaterial(
    { materialName: 'هيكل بلاستيك' },
    materials,
  );
  assert.equal(resolved.material?.id, 'm2');
  assert.equal(resolved.material?.baseUnit, 'kg');
}

{
  const resolved = resolveProductImportMaterial(
    { materialName: 'اسم مكرر' },
    materials,
  );
  assert.match(resolved.error ?? '', /يطابق أكثر من مادة/);
}

{
  const resolved = resolveProductImportMaterial(
    { materialCode: 'MAT-404', materialName: 'مادة غير موجودة' },
    materials,
  );
  assert.match(resolved.error ?? '', /لم يتم العثور/);
}

{
  const resolved = resolveProductImportMaterial(
    { materialCode: 'MAT-005', materialName: 'مادة موقوفة' },
    materials,
  );
  assert.match(resolved.error ?? '', /غير نشطة/);
}

console.log('product-import-materials.test.ts: ok');
