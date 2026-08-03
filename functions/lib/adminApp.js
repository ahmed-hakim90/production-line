import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
/** Ensure Admin SDK is initialized even when modules load before index.ts. */
export function getDb() {
    if (!getApps().length) {
        initializeApp();
    }
    return getFirestore();
}
