import assert from 'node:assert/strict';
import {
  buildPermissionCatalogFromGroups,
  resolveResourcePermissionGuards,
} from '../utils/permissionCatalog.ts';

const fixtureGroups = [
  {
    key: 'catalog',
    label: 'الكتالوج',
    permissions: [
      { key: 'products.view', label: 'عرض المنتجات' },
      { key: 'products.create', label: 'إنشاء منتج' },
      { key: 'products.edit', label: 'تعديل المنتجات' },
      { key: 'products.delete', label: 'حذف المنتجات' },
    ],
  },
  {
    key: 'repair',
    label: 'الصيانة',
    permissions: [
      { key: 'repair.jobs.create', label: 'إنشاء طلب صيانة' },
      { key: 'repair.jobs.edit', label: 'تعديل طلب صيانة' },
      { key: 'repair.jobs.technician', label: 'صلاحية فني' },
      { key: 'materials.view', label: 'عرض المواد' },
      { key: 'materials.manage', label: 'إدارة المواد' },
    ],
  },
];

const catalog = buildPermissionCatalogFromGroups(fixtureGroups);
assert.ok(catalog.length >= 3);

const products = catalog.find((r) => r.id === 'products');
assert.ok(products);
assert.equal(products?.crud.view?.key, 'products.view');
assert.equal(products?.crud.create?.key, 'products.create');
assert.equal(products?.crud.edit?.key, 'products.edit');
assert.equal(products?.crud.delete?.key, 'products.delete');

const jobs = catalog.find((r) => r.id === 'repair.jobs');
assert.ok(jobs);
assert.equal(jobs?.crud.create?.key, 'repair.jobs.create');
assert.ok(jobs?.actions.some((a) => a.verb === 'technician'));

const full = resolveResourcePermissionGuards(
  {
    'products.view': true,
    'products.create': true,
    'products.edit': false,
    'products.delete': false,
  },
  'products',
  catalog,
);
assert.equal(full.canView, true);
assert.equal(full.canCreate, true);
assert.equal(full.canEdit, false);
assert.equal(full.canDelete, false);
assert.equal(full.canAccessPage, true);

const manageOnly = resolveResourcePermissionGuards(
  { 'materials.manage': true },
  'materials',
  catalog,
);
assert.equal(manageOnly.canManage, true);
assert.equal(manageOnly.canView, true);
assert.equal(manageOnly.canEdit, true);

const denied = resolveResourcePermissionGuards({}, 'products', catalog);
assert.equal(denied.canAccessPage, false);

console.log('permission-catalog.test.ts: ok');
