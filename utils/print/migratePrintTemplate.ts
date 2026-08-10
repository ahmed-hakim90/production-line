import type {
  PrintDocumentOverride,
  PrintDocumentTypeId,
  PrintTemplateSettings,
} from '../../types';
import {
  PRINT_DOCUMENT_TYPE_IDS,
  defaultFieldsForDocument,
} from './printDocumentRegistry';

const PRODUCTION_LEGACY_FIELD_MAP = {
  waste: 'showWaste',
  employee: 'showEmployee',
  costs: 'showCosts',
  workOrder: 'showWorkOrder',
  sellingPrice: 'showSellingPrice',
  qrCode: 'showQRCode',
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeDocumentOverride(
  id: PrintDocumentTypeId,
  incoming: PrintDocumentOverride | undefined,
): PrintDocumentOverride {
  const defaults = defaultFieldsForDocument(id);
  const fields = {
    ...defaults,
    ...(isPlainObject(incoming?.fields) ? incoming!.fields : {}),
  };
  return {
    headerText: typeof incoming?.headerText === 'string' ? incoming.headerText : '',
    footerText: typeof incoming?.footerText === 'string' ? incoming.footerText : '',
    customLines: Array.isArray(incoming?.customLines) ? incoming!.customLines.slice(0, 5) : [],
    fields,
  };
}

/**
 * Ensures `documents.*` exists and seeds productionReport fields from legacy
 * show* toggles when those keys were never saved under documents.
 */
export function migratePrintTemplateV1(
  input: PrintTemplateSettings,
): PrintTemplateSettings {
  const hadProductionFields = isPlainObject(input.documents?.productionReport?.fields);

  const documents: Partial<Record<PrintDocumentTypeId, PrintDocumentOverride>> = {
    ...(input.documents ?? {}),
  };

  for (const id of PRINT_DOCUMENT_TYPE_IDS) {
    documents[id] = mergeDocumentOverride(id, documents[id]);
  }

  const production = documents.productionReport!;
  const productionFields = { ...production.fields };

  // Seed from legacy only when the tenant never stored document field keys.
  if (!hadProductionFields) {
    for (const [fieldKey, legacyKey] of Object.entries(PRODUCTION_LEGACY_FIELD_MAP)) {
      const legacyValue = input[legacyKey as keyof PrintTemplateSettings];
      if (typeof legacyValue === 'boolean') {
        productionFields[fieldKey] = legacyValue;
      }
    }
  }

  documents.productionReport = { ...production, fields: productionFields };

  // Keep legacy flat flags in sync with productionReport (read paths + old UI).
  const synced: PrintTemplateSettings = {
    ...input,
    documents,
    showWaste: productionFields.waste !== false,
    showEmployee: productionFields.employee !== false,
    showCosts: productionFields.costs !== false,
    showWorkOrder: productionFields.workOrder !== false,
    showSellingPrice: productionFields.sellingPrice !== false,
    showQRCode: productionFields.qrCode === true,
  };

  return synced;
}

/** Apply a production field toggle and mirror the matching legacy flag. */
export function syncProductionLegacyFlags(
  template: PrintTemplateSettings,
): PrintTemplateSettings {
  const fields = template.documents?.productionReport?.fields;
  if (!fields) return template;
  return {
    ...template,
    showWaste: fields.waste !== false,
    showEmployee: fields.employee !== false,
    showCosts: fields.costs !== false,
    showWorkOrder: fields.workOrder !== false,
    showSellingPrice: fields.sellingPrice !== false,
    showQRCode: fields.qrCode === true,
  };
}
