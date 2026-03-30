import {
  collection,
  query,
  where,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import { getCurrentTenantId } from './currentTenant';

/** Firestore query scoped to the current tenant (prepends `where('tenantId', '==', …)`). */
export function tenantQuery(
  db: Firestore,
  collectionPath: string,
  ...constraints: QueryConstraint[]
) {
  return query(
    collection(db, collectionPath),
    where('tenantId', '==', getCurrentTenantId()),
    ...constraints,
  );
}
