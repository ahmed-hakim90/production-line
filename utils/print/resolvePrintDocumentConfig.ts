import type {
  PrintCustomLine,
  PrintDocumentTypeId,
  PrintTemplateSettings,
} from '../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../dashboardConfig';
import {
  PRINT_CUSTOM_LINES_MAX,
  defaultFieldsForDocument,
  getPrintDocumentEntry,
} from './printDocumentRegistry';
import { migratePrintTemplateV1 } from './migratePrintTemplate';

export type ResolvedPrintDocumentConfig = {
  documentType: PrintDocumentTypeId;
  labelAr: string;
  /** Effective company / header line for this document */
  headerText: string;
  /** Effective footer tagline */
  footerText: string;
  /** Enabled non-empty custom lines only */
  customLines: string[];
  /** Merged visibility map (registry defaults + override) */
  fields: Record<string, boolean>;
  isFieldVisible: (key: string) => boolean;
};

function normalizeCustomLines(lines: PrintCustomLine[] | undefined): string[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .slice(0, PRINT_CUSTOM_LINES_MAX)
    .filter((line) => line && line.enabled !== false && String(line.text || '').trim())
    .map((line) => String(line.text).trim());
}

/**
 * Merge global print chrome with per-document overrides and registry defaults.
 */
export function resolvePrintDocumentConfig(
  printSettings: PrintTemplateSettings | null | undefined,
  documentType: PrintDocumentTypeId,
): ResolvedPrintDocumentConfig {
  const migrated = migratePrintTemplateV1({
    ...DEFAULT_PRINT_TEMPLATE,
    ...(printSettings ?? {}),
    documents: {
      ...DEFAULT_PRINT_TEMPLATE.documents,
      ...(printSettings?.documents ?? {}),
    },
  });

  const entry = getPrintDocumentEntry(documentType);
  const override = migrated.documents?.[documentType];
  const fields = {
    ...defaultFieldsForDocument(documentType),
    ...(override?.fields ?? {}),
  };

  const headerOverride = String(override?.headerText ?? '').trim();
  const footerOverride = String(override?.footerText ?? '').trim();

  return {
    documentType,
    labelAr: entry.labelAr,
    headerText: headerOverride || String(migrated.headerText || '').trim() || 'مؤسسة المغربي',
    footerText: footerOverride || String(migrated.footerText || '').trim(),
    customLines: normalizeCustomLines(override?.customLines),
    fields,
    isFieldVisible: (key: string) => fields[key] !== false,
  };
}
