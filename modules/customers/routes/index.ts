import type { AppRouteDef } from '../../shared/routes';
import type { Permission } from '../../../utils/permissions';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const CustomerDepositsListPage = lazyNamed(
  () => import('../pages/CustomerDepositsListPage'),
  'CustomerDepositsListPage',
);
const CustomerDepositNewPage = lazyNamed(
  () => import('../pages/CustomerDepositNewPage'),
  'CustomerDepositNewPage',
);
const CustomerDepositDetailPage = lazyNamed(
  () => import('../pages/CustomerDepositDetailPage'),
  'CustomerDepositDetailPage',
);
const CustomerDepositCustomerPage = lazyNamed(
  () => import('../pages/CustomerDepositCustomerPage'),
  'CustomerDepositCustomerPage',
);
const CustomerDepositBankPage = lazyNamed(
  () => import('../pages/CustomerDepositBankPage'),
  'CustomerDepositBankPage',
);
const CustomerDepositMasterPage = lazyNamed(
  () => import('../pages/CustomerDepositMasterPage'),
  'CustomerDepositMasterPage',
);

const customerDepositsAccess: Permission[] = [
  'customerDeposits.view',
  'customerDeposits.create',
  'customerDeposits.confirm',
  'customerDeposits.manage',
];

export const CUSTOMER_DEPOSIT_ROUTES: AppRouteDef[] = [
  {
    path: '/customers/deposits',
    permissionsAny: customerDepositsAccess,
    component: CustomerDepositsListPage,
  },
  {
    path: '/customers/deposits/new',
    permissionsAny: ['customerDeposits.create', 'customerDeposits.manage'],
    component: CustomerDepositNewPage,
  },
  {
    path: '/customers/deposits/master',
    permission: 'customerDeposits.manage',
    component: CustomerDepositMasterPage,
  },
  {
    path: '/customers/deposits/customer/:customerId',
    permissionsAny: customerDepositsAccess,
    component: CustomerDepositCustomerPage,
  },
  {
    path: '/customers/deposits/bank-account/:accountId',
    permissionsAny: customerDepositsAccess,
    component: CustomerDepositBankPage,
  },
  {
    path: '/customers/deposits/:entryId',
    permissionsAny: customerDepositsAccess,
    component: CustomerDepositDetailPage,
  },
];
