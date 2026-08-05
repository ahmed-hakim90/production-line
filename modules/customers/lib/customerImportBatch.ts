import type { CustomerType } from '../types';

/** Updates are 1 write each — stay under Firestore 500-op batch limit. */
export const CUSTOMER_IMPORT_UPDATE_CHUNK = 400;
/** Creates need claim + customer docs (2 writes) — stay under 500. */
export const CUSTOMER_IMPORT_CREATE_CHUNK = 200;

export type CustomerImportWriteRow = {
  rowNo: number;
  code: string;
  type: CustomerType;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  /** When set, import writes an update (no code claim). */
  existingId?: string;
};

export function partitionCustomerImportWriteRows(rows: CustomerImportWriteRow[]): {
  updates: CustomerImportWriteRow[];
  creates: CustomerImportWriteRow[];
} {
  const updates: CustomerImportWriteRow[] = [];
  const creates: CustomerImportWriteRow[] = [];
  for (const row of rows) {
    if (row.existingId) updates.push(row);
    else creates.push(row);
  }
  return { updates, creates };
}

export function chunkCustomerImportRows<T>(rows: T[], size: number): T[][] {
  const chunkSize = Math.max(1, Math.floor(size) || 1);
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    out.push(rows.slice(i, i + chunkSize));
  }
  return out;
}
