import type { AppRouteDef } from '../../shared/routes';
import { Products } from '../pages/Products';
import { ProductDetails } from '../pages/ProductDetails';
import { RawMaterials } from '../pages/RawMaterials';
import { Categories } from '../pages/Categories';

export const CATALOG_ROUTES: AppRouteDef[] = [
  { path: '/products', permission: 'products.view', component: Products },
  { path: '/products/raw-materials', permission: 'products.rawMaterials.view', component: RawMaterials },
  { path: '/products/:id', permission: 'products.view', component: ProductDetails },
  { path: '/catalog/categories', permission: 'catalog.categories.view', component: Categories },
];
