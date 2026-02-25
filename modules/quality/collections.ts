import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from '@/services/firebase';

export const QUALITY_COLLECTIONS = {
  SETTINGS: 'quality_settings',
  REASON_CATALOG: 'quality_reason_catalog',
  WORKER_ASSIGNMENTS: 'quality_workers_assignments',
  INSPECTIONS: 'quality_inspections',
  DEFECTS: 'quality_defects',
  REWORK_ORDERS: 'quality_rework_orders',
  CAPA: 'quality_capa',
  PRINT_LOGS: 'quality_print_logs',
} as const;

export const QUALITY_SETTINGS_DOC_ID = 'global';

export function qualitySettingsDocRef(): DocumentReference {
  return doc(db, QUALITY_COLLECTIONS.SETTINGS, QUALITY_SETTINGS_DOC_ID);
}

export function qualityReasonCatalogRef(): CollectionReference {
  return collection(db, QUALITY_COLLECTIONS.REASON_CATALOG);
}

export function qualityWorkerAssignmentsRef(): CollectionReference {
  return collection(db, QUALITY_COLLECTIONS.WORKER_ASSIGNMENTS);
}

export function qualityInspectionsRef(): CollectionReference {
  return collection(db, QUALITY_COLLECTIONS.INSPECTIONS);
}

export function qualityDefectsRef(): CollectionReference {
  return collection(db, QUALITY_COLLECTIONS.DEFECTS);
}

export function qualityReworkOrdersRef(): CollectionReference {
  return collection(db, QUALITY_COLLECTIONS.REWORK_ORDERS);
}

export function qualityCAPARef(): CollectionReference {
  return collection(db, QUALITY_COLLECTIONS.CAPA);
}

export function qualityPrintLogsRef(): CollectionReference {
  return collection(db, QUALITY_COLLECTIONS.PRINT_LOGS);
}
