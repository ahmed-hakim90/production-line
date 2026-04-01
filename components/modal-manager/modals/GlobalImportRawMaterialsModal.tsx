import React, { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Loader2, Save } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { rawMaterialService } from '../../../modules/inventory/services/rawMaterialService';
import { parseRawMaterialsExcel, type RawMaterialImportResult } from '../../../utils/importRawMaterials';
import { downloadRawMaterialsMasterTemplate } from '../../../utils/downloadTemplates';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { useTranslation } from 'react-i18next';

type RawMaterialsImportPayload = {
  onSaved?: () => void;
};

const asPayload = (payload: Record<string, unknown> | undefined): RawMaterialsImportPayload => {
  if (!payload) return {};
  const next: RawMaterialsImportPayload = {};
  if (typeof payload.onSaved === 'function') next.onSaved = payload.onSaved as () => void;
  return next;
};

export const GlobalImportRawMaterialsModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.INVENTORY_RAW_MATERIALS_IMPORT);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<RawMaterialImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const parsedPayload = useMemo(() => asPayload(payload), [payload]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (saving) return;
    setResult(null);
    setFileName('');
    setMessage(null);
    close();
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setResult(null);
    setMessage(null);
    try {
      const parsed = await parseRawMaterialsExcel(file);
      setResult(parsed);
    } catch (error: any) {
      setResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0 });
      setMessage({ type: 'error', text: error?.message || t('modalManager.importRawMaterials.readImportFileError') });
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    const validRows = result.rows.filter((row) => row.errors.length === 0);
    if (validRows.length === 0) {
      setMessage({ type: 'error', text: t('modalManager.importRawMaterials.noValidRowsToSave') });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const existing = await rawMaterialService.getAll();
      const byCode = new Map(existing.map((row) => [String(row.code || '').trim().toUpperCase(), row]));
      let created = 0;
      let updated = 0;

      for (const row of validRows) {
        const current = byCode.get(row.code);
        if (current?.id) {
          await rawMaterialService.update(current.id, {
            name: row.name,
            code: row.code,
            unit: row.unit || 'unit',
            minStock: Number(row.minStock || 0),
            isActive: row.isActive,
          });
          updated += 1;
        } else {
          const id = await rawMaterialService.create({
            name: row.name,
            code: row.code,
            unit: row.unit || 'unit',
            minStock: Number(row.minStock || 0),
            isActive: row.isActive,
          });
          if (id) {
            created += 1;
            byCode.set(row.code, {
              id,
              name: row.name,
              code: row.code,
              unit: row.unit || 'unit',
              minStock: Number(row.minStock || 0),
              isActive: row.isActive,
              createdAt: new Date().toISOString(),
            });
          }
        }
      }

      parsedPayload.onSaved?.();
      setResult(null);
      setFileName('');
      setMessage({
        type: 'success',
        text: t('modalManager.importRawMaterials.saveSummary', { created, updated }),
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || t('modalManager.importRawMaterials.saveImportDataError') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-5xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileSelected}
        />

        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{t('modalManager.importRawMaterials.title')}</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{fileName || '—'}</p>
          </div>
          <Button variant="outline" onClick={downloadRawMaterialsMasterTemplate} disabled={saving || parsing}>
            <Download size={14} />
            {t('modalManager.importRawMaterials.downloadTemplate')}
          </Button>
        </div>

        <div className="p-6 overflow-auto flex-1 space-y-4">
          {parsing ? (
            <p className="text-sm text-slate-500">{t('modalManager.importRawMaterials.analyzingFile')}</p>
          ) : !result ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">{t('modalManager.importRawMaterials.chooseExcelToStart')}</p>
              <Button variant="primary" onClick={openFilePicker} disabled={saving || parsing}>
                <FileUp size={14} />
                {t('modalManager.importRawMaterials.selectImportFile')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                  <p className="text-xs text-slate-500">{t('modalManager.importRawMaterials.totalRows')}</p>
                  <p className="text-lg font-black">{result.totalRows}</p>
                </div>
                <div className="rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/10 p-3">
                  <p className="text-xs text-emerald-700">{t('modalManager.importRawMaterials.validRows')}</p>
                  <p className="text-lg font-bold text-emerald-700">{result.validCount}</p>
                </div>
                <div className="rounded-[var(--border-radius-lg)] border border-rose-200 bg-rose-50/60 dark:bg-rose-900/10 p-3">
                  <p className="text-xs text-rose-700">{t('modalManager.importRawMaterials.rowsWithErrors')}</p>
                  <p className="text-lg font-bold text-rose-700">{result.errorCount}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <table className="erp-table w-full text-right border-collapse">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">#</th>
                      <th className="erp-th">{t('modalManager.importRawMaterials.table.code')}</th>
                      <th className="erp-th">{t('modalManager.importRawMaterials.table.materialName')}</th>
                      <th className="erp-th">{t('modalManager.importRawMaterials.table.unit')}</th>
                      <th className="erp-th">{t('modalManager.importRawMaterials.table.minimum')}</th>
                      <th className="erp-th">{t('modalManager.importRawMaterials.table.status')}</th>
                      <th className="erp-th">{t('modalManager.importRawMaterials.table.validation')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {result.rows.map((row) => (
                      <tr key={`${row.rowIndex}-${row.code}`}>
                        <td className="px-3 py-2 text-sm">{row.rowIndex}</td>
                        <td className="px-3 py-2 text-sm font-bold">{row.code || '—'}</td>
                        <td className="px-3 py-2 text-sm">{row.name || '—'}</td>
                        <td className="px-3 py-2 text-sm">{row.unit || '—'}</td>
                        <td className="px-3 py-2 text-sm">{row.minStock}</td>
                        <td className="px-3 py-2 text-sm">{row.isActive ? t('modalManager.importRawMaterials.active') : t('modalManager.importRawMaterials.inactive')}</td>
                        <td className="px-3 py-2 text-sm">
                          {row.errors.length === 0 ? (
                            <span className="text-emerald-600 font-bold">{t('modalManager.importRawMaterials.valid')}</span>
                          ) : (
                            <span className="text-rose-600 font-bold">{row.errors.join(' | ')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {message && (
            <div
              className={`rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-bold ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            {t('ui.close')}
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || parsing || !result}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t('modalManager.importRawMaterials.saveValidRows')}
          </Button>
        </div>
      </div>
    </div>
  );
};
