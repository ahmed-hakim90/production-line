import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const CatalogDashboard = lazyNamed(() => import('../pages/CatalogDashboard'), 'CatalogDashboard');
const Products = lazyNamed(() => import('../pages/Products'), 'Products');
const ProductDetails = lazyNamed(() => import('../pages/ProductDetails'), 'ProductDetails');
const Categories = lazyNamed(() => import('../pages/Categories'), 'Categories');

export const CATALOG_ROUTES: AppRouteDef[] = [
  {
    path: '/catalog',
    permissionsAny: ['products.view', 'materials.view', 'catalog.categories.view'],
    component: CatalogDashboard,
    skeleton: 'dashboard',
  },
  { path: '/products', permission: 'products.view', component: Products },
  { path: '/products/raw-materials', redirectTo: '/manufacturing/materials' },
  { path: '/products/:id', permission: 'products.view', component: ProductDetails },
  { path: '/catalog/categories', permission: 'catalog.categories.view', component: Categories },
];
