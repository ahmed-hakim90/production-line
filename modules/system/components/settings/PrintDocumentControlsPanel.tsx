import React, { useCallback, useMemo } from 'react';
import type { PrintCustomLine, PrintDocumentTypeId, PrintTemplateSettings } from '../../../../types';
import { Button } from '../UI';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import {
  PRINT_CUSTOM_LINES_MAX,
  PRINT_DOCUMENT_REGISTRY,
  getPrintDocumentEntry,
} from '../../../../utils/print/printDocumentRegistry';
import { syncProductionLegacyFlags } from '../../../../utils/print/migratePrintTemplate';
import { resolvePrintDocumentConfig } from '../../../../utils/print/resolvePrintDocumentConfig';

type Props = {
  localPrint: PrintTemplateSettings;
  setLocalPrint: React.Dispatch<React.SetStateAction<PrintTemplateSettings>>;
  selectedDocType: PrintDocumentTypeId;
  setSelectedDocType: React.Dispatch<React.SetStateAction<PrintDocumentTypeId>>;
};

function newCustomLine(): PrintCustomLine {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: '',
    enabled: true,
  };
}

export const PrintDocumentControlsPanel: React.FC<Props> = ({
  localPrint,
  setLocalPrint,
  selectedDocType,
  setSelectedDocType,
}) => {
  const entry = useMemo(() => getPrintDocumentEntry(selectedDocType), [selectedDocType]);
  const resolved = useMemo(
    () => resolvePrintDocumentConfig(localPrint, selectedDocType),
    [localPrint, selectedDocType],
  );
  const override = localPrint.documents?.[selectedDocType];
  const customLines = override?.customLines ?? [];

  const patchDocument = useCallback(
    (patch: Partial<NonNullable<PrintTemplateSettings['documents']>[PrintDocumentTypeId]>) => {
      setLocalPrint((prev) => {
        const nextDoc = {
          ...(prev.documents?.[selectedDocType] ?? {}),
          ...patch,
        };
        const next: PrintTemplateSettings = {
          ...prev,
          documents: {
            ...prev.documents,
            [selectedDocType]: nextDoc,
          },
        };
        return selectedDocType === 'productionReport' ? syncProductionLegacyFlags(next) : next;
      });
    },
    [selectedDocType, setLocalPrint],
  );

  const toggleField = (key: string) => {
    patchDocument({
      fields: {
        ...resolved.fields,
        [key]: !resolved.isFieldVisible(key),
      },
    });
  };

  return (
    <OpsDashPanel title="عناصر المستند">
      <div className="space-y-5">
        <div>
          <p className="text-sm font-bold text-[var(--color-text)] mb-2">نوع المستند</p>
          <div className="flex flex-wrap gap-2">
            {PRINT_DOCUMENT_REGISTRY.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setSelectedDocType(doc.id)}
                className={`px-3 py-2 rounded-[var(--border-radius-base)] text-sm font-bold border transition-all ${
                  selectedDocType === doc.id
                    ? 'bg-primary text-white border-primary'
                    : 'bg-[var(--color-card)] text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                {doc.labelAr}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
              عنوان خاص ({entry.labelAr})
            </label>
            <input
              type="text"
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder={`افتراضي: ${localPrint.headerText || 'العنوان العام'}`}
              value={override?.headerText ?? ''}
              onChange={(e) => patchDocument({ headerText: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
              تذييل خاص ({entry.labelAr})
            </label>
            <input
              type="text"
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder={`افتراضي: ${localPrint.footerText || 'التذييل العام'}`}
              value={override?.footerText ?? ''}
              onChange={(e) => patchDocument({ footerText: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold text-[var(--color-text)]">إظهار / إخفاء الحقول</p>
          {entry.fields.map((field) => {
            const on = resolved.isFieldVisible(field.key);
            return (
              <div
                key={field.key}
                className={`flex items-center gap-3 p-4 rounded-[var(--border-radius-lg)] border transition-all ${
                  on
                    ? 'bg-[var(--color-card)] border-[var(--color-border)]'
                    : 'bg-[var(--color-bg)]/70 border-[var(--color-border)] opacity-60'
                }`}
              >
                <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-icons-round text-primary">{field.icon || 'toggle_on'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--color-text)]">{field.labelAr}</p>
                  {field.descriptionAr ? (
                    <p className="text-xs text-[var(--color-text-muted)]">{field.descriptionAr}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => toggleField(field.key)}
                  className={`w-12 h-7 rounded-full transition-all relative shrink-0 ${
                    on ? 'bg-[rgb(var(--color-success)/0.1)]0' : 'bg-[var(--color-border)]'
                  }`}
                  aria-pressed={on}
                  aria-label={field.labelAr}
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full shadow transition-all ${
                      on ? 'right-0.5' : 'right-[22px]'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {selectedDocType === 'productionReport' ? (
          <div
            className={`flex items-center gap-3 p-4 rounded-[var(--border-radius-lg)] border transition-all ${
              localPrint.printBackground
                ? 'bg-[var(--color-card)] border-[var(--color-border)]'
                : 'bg-[var(--color-bg)]/70 border-[var(--color-border)] opacity-60'
            }`}
          >
            <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-primary">format_color_fill</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--color-text)]">طباعة الألوان والخلفيات</p>
              <p className="text-xs text-[var(--color-text-muted)]">إعداد عام للطابعة (ليس خاصاً بحقل مستند)</p>
            </div>
            <button
              type="button"
              onClick={() => setLocalPrint((p) => ({ ...p, printBackground: !p.printBackground }))}
              className={`w-12 h-7 rounded-full transition-all relative shrink-0 ${
                localPrint.printBackground ? 'bg-[rgb(var(--color-success)/0.1)]0' : 'bg-[var(--color-border)]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full shadow transition-all ${
                  localPrint.printBackground ? 'right-0.5' : 'right-[22px]'
                }`}
              />
            </button>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[var(--color-text)]">سطور نص مخصصة</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                تظهر أسفل الترويسة — حتى {PRINT_CUSTOM_LINES_MAX} سطور
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              solid={false}
              disabled={customLines.length >= PRINT_CUSTOM_LINES_MAX}
              onClick={() => patchDocument({ customLines: [...customLines, newCustomLine()] })}
            >
              إضافة سطر
            </Button>
          </div>
          {customLines.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">لا توجد سطور مخصصة لهذا المستند.</p>
          ) : (
            customLines.map((line, index) => (
              <div
                key={line.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = customLines.map((row, i) =>
                      i === index ? { ...row, enabled: !row.enabled } : row,
                    );
                    patchDocument({ customLines: next });
                  }}
                  className={`w-10 h-7 rounded-full transition-all relative shrink-0 ${
                    line.enabled !== false ? 'bg-[rgb(var(--color-success)/0.1)]0' : 'bg-[var(--color-border)]'
                  }`}
                  aria-label="تفعيل السطر"
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full shadow transition-all ${
                      line.enabled !== false ? 'right-0.5' : 'right-[22px]'
                    }`}
                  />
                </button>
                <input
                  type="text"
                  className="flex-1 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm py-2 px-3 outline-none focus:border-primary"
                  placeholder={`سطر ${index + 1}`}
                  value={line.text}
                  onChange={(e) => {
                    const next = customLines.map((row, i) =>
                      i === index ? { ...row, text: e.target.value } : row,
                    );
                    patchDocument({ customLines: next });
                  }}
                />
                <button
                  type="button"
                  className="w-9 h-9 rounded-[var(--border-radius-base)] bg-[var(--color-bg)] flex items-center justify-center hover:bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]"
                  onClick={() =>
                    patchDocument({ customLines: customLines.filter((_, i) => i !== index) })
                  }
                  aria-label="حذف السطر"
                >
                  <span className="material-icons-round text-base">delete</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </OpsDashPanel>
  );
};
