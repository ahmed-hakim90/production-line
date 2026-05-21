import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const OpsInbox = lazyNamed(() => import('../pages/OpsInbox'), 'OpsInbox');

export const OPERATIONS_ROUTES: AppRouteDef[] = [
  { path: '/operations', permission: 'operations.inbox.view', component: OpsInbox },
];
