import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/** Ensure Admin SDK is initialized even when modules load before index.ts. */
export function getDb(): Firestore {
  if (!getApps().length) {
    initializeApp();
  }
  return getFirestore();
}
