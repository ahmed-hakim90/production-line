import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from '@/services/firebase';

export const CUSTOMERS_COLLECTIONS = {
  CUSTOMERS: 'customers',
  ACTIVITIES: 'customer_activities',
} as const;

export const CUSTOMER_ENTITY_TYPE = 'customer';

export function customersRef(): CollectionReference {
  return collection(db, CUSTOMERS_COLLECTIONS.CUSTOMERS);
}

export function customerDocRef(id: string): DocumentReference {
  return doc(db, CUSTOMERS_COLLECTIONS.CUSTOMERS, id);
}

export function customerActivitiesRef(): CollectionReference {
  return collection(db, CUSTOMERS_COLLECTIONS.ACTIVITIES);
}

export function customerActivityDocRef(id: string): DocumentReference {
  return doc(db, CUSTOMERS_COLLECTIONS.ACTIVITIES, id);
}
