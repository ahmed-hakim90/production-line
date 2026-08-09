/**
 * Decide whether an import preview row should write to the database.
 * Rows with action=update and no detected field changes are skipped.
 */

export type MaterialImportSaveDecision = 'create' | 'update' | 'skip';

export type ProductImportSaveDecision = 'create' | 'update' | 'skip' | 'bomOnly';

export function decideMaterialImportSave(
  row: {
    action: 'create' | 'update';
    changes?: string[];
  },
  options?: { skipUpdates?: boolean },
): MaterialImportSaveDecision {
  if (row.action === 'create') return 'create';
  // Re-upload gap fill: keep existing materials untouched.
  if (options?.skipUpdates) return 'skip';
  if (!row.changes?.length) return 'skip';
  return 'update';
}

export function decideProductImportSave(row: {
  action: 'create' | 'update';
  changes?: string[];
  materialsLength: number;
}): ProductImportSaveDecision {
  if (row.action === 'create') return 'create';
  const hasChanges = Boolean(row.changes?.length);
  const hasMaterials = row.materialsLength > 0;
  if (!hasChanges && !hasMaterials) return 'skip';
  if (!hasChanges && hasMaterials) return 'bomOnly';
  return 'update';
}
