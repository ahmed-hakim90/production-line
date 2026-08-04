import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const Customers = lazyNamed(() => import('../pages/Customers'), 'Customers');
const CustomerDetail = lazyNamed(() => import('../pages/CustomerDetail'), 'CustomerDetail');
const CustomersImport = lazyNamed(() => import('../pages/CustomersImport'), 'CustomersImport');

export const CUSTOMER_ROUTES: AppRouteDef[] = [
  { path: '/customers', permission: 'customers.view', component: Customers },
  { path: '/customers/import', permission: 'customers.import', component: CustomersImport },
  { path: '/customers/:customerId', permission: 'customers.view', component: CustomerDetail },
];
