import React, { useMemo, useRef, useState } from 'react';
import { Download, Loader2, Upload, X } from 'lucide-react';
import { Button } from '../../UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import type { FirestoreEmployee, FirestoreRole } from '../../../types';
import { parseUsersImportFile, type ParsedUserImportRow } from '../../../utils/importUsers';
import { downloadUsersTemplate } from '../../../utils/downloadTemplates';
import { useTranslation } from 'react-i18next';

type ImportStatus = 'pending' | 'created' | 'error';
type ImportEntry = ParsedUserImportRow & { status: ImportStatus; selected: boolean; runtimeError?: string };

type ImportUsersPayload = {
  roles: FirestoreRole[];
  employees: FirestoreEmployee[];
  existingEmails: string[];
  onCreateUser: (input: {
    displayName: string;
    email: string;
    password: string;
    roleId: string;
    employeeId?: string;
  }) => Promise<void>;
};

export const GlobalImportSystemUsersModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.SYSTEM_USERS_IMPORT);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'created' | 'error'>('pending');
  const [message, setMessage] = useState<string>('');

  const modalPayload = payload as ImportUsersPayload | undefined;
  const roles = modalPayload?.roles ?? [];
  const employees = modalPayload?.employees ?? [];
  const existingEmails = modalPayload?.existingEmails ?? [];

  const roleByNormalizedName = useMemo(() => {
    const map = new Map<string, string>();
    roles.forEach((role) => {
      if (!role.id) return;
      map.set(String(role.id).trim().toLowerCase(), role.id);
      map.set(String(role.name || '').trim().toLowerCase(), role.id);
    });
    return map;
  }, [roles]);

  const employeeByCode = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => {
      if (!employee.id || !employee.code) return;
      map.set(String(employee.code).trim().toLowerCase(), employee.id);
    });
    return map;
  }, [employees]);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((entry) => entry.status === filter);
  }, [entries, filter]);

  if (!isOpen || !modalPayload) return null;

  const handleClose = () => {
    if (creating) return;
    setEntries([]);
    setMessage('');
    setFilter('pending');
    close();
  };

  const handlePickFile = async (file: File) => {
    setParsing(true);
    setMessage('');
    try {
      const parsed = await parseUsersImportFile(file, existingEmails);
      const next = parsed.rows.map((row) => ({
        ...row,
        status: row.errors.length > 0 ? 'error' as const : 'pending' as const,
        selected: row.errors.length === 0,
      }));
      setEntries(next);
      if (parsed.totalRows === 0) setMessage(t('modalManager.importSystemUsers.fileHasNoData'));
    } catch {
      setMessage(t('modalManager.importSystemUsers.readImportFileError'));
    } finally {
      setParsing(false);
    }
  };

  const runCreateForEntries = async (targets: ImportEntry[]) => {
    if (targets.length === 0) return;
    setCreating(true);
    setMessage('');
    let createdCount = 0;
    let failedCount = 0;
    const next = [...entries];

    for (const target of targets) {
      const idx = next.findIndex((entry) => entry.rowIndex === target.rowIndex);
      if (idx === -1) continue;

      const roleId = roleByNormalizedName.get(String(target.roleNameOrId || '').trim().toLowerCase());
      if (!roleId) {
        next[idx] = { ...next[idx], status: 'error', runtimeError: t('modalManager.importSystemUsers.unknownRole', { role: target.roleNameOrId }) };
        failedCount += 1;
        continue;
      }

      let employeeId: string | undefined;
      const code = String(target.employeeCode || '').trim().toLowerCase();
      if (code) {
        employeeId = employeeByCode.get(code);
        if (!employeeId) {
          next[idx] = { ...next[idx], status: 'error', runtimeError: t('modalManager.importSystemUsers.employeeCodeNotFound', { code: target.employeeCode }) };
          failedCount += 1;
          continue;
        }
      }

      try {
        await modalPayload.onCreateUser({
          displayName: target.displayName,
          email: target.email,
          password: target.password,
          roleId,
          employeeId,
        });
        next[idx] = { ...next[idx], status: 'created', selected: false, runtimeError: undefined };
        createdCount += 1;
      } catch (error: any) {
        next[idx] = { ...next[idx], status: 'error', runtimeError: error?.message || t('modalManager.importSystemUsers.createAccountError') };
        failedCount += 1;
      }
      setEntries([...next]);
    }

    setEntries([...next]);
    setCreating(false);
    setMessage(t('modalManager.importSystemUsers.createSummary', { created: createdCount, failed: failedCount }));
  };

  const pendingEntries = entries.filter((entry) => entry.status === 'pending');
  const selectedPending = pendingEntries.filter((entry) => entry.selected);

  return (
    <ManagedModalPortal>
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[10050] flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[96vw] max-w-5xl max-h-[90dvh] border border-[var(--color-border)] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{t('modalManager.importSystemUsers.title')}</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{t('modalManager.importSystemUsers.subtitle')}</p>
          </div>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] transition-colors" disabled={creating}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && void handlePickFile(e.target.files[0])} />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={parsing || creating}>
              {parsing ? t('modalManager.importSystemUsers.readingFile') : t('modalManager.importSystemUsers.selectImportFile')}
            </Button>
            <Button variant="secondary" onClick={downloadUsersTemplate} disabled={parsing || creating}>
              {t('modalManager.importSystemUsers.downloadTemplate')}
            </Button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${filter === 'all' ? 'bg-primary text-white border-primary' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
              onClick={() => setFilter('all')}
            >
              {t('modalManager.importSystemUsers.filterAll')}
            </button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${filter === 'pending' ? 'bg-[rgb(var(--color-warning)/0.1)]0 text-white border-[rgb(var(--color-warning))]' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
              onClick={() => setFilter('pending')}
            >
              {t('modalManager.importSystemUsers.filterPending')}
            </button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${filter === 'created' ? 'bg-[rgb(var(--color-success))] text-white border-[rgb(var(--color-success))]' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
              onClick={() => setFilter('created')}
            >
              {t('modalManager.importSystemUsers.filterCreated')}
            </button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${filter === 'error' ? 'bg-[rgb(var(--color-danger))] text-white border-[rgb(var(--color-danger))]' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
              onClick={() => setFilter('error')}
            >
              {t('modalManager.importSystemUsers.filterErrors')}
            </button>
          </div>

          {message && (
            <div className="rounded-[var(--border-radius-base)] border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)]/80 px-3 py-2 text-xs font-bold text-[rgb(var(--color-warning))]">
              {message}
            </div>
          )}

          <div className="text-xs text-[var(--color-text-muted)] font-medium">
            {t('modalManager.importSystemUsers.stats', {
              total: entries.length,
              pending: pendingEntries.length,
              created: entries.filter((entry) => entry.status === 'created').length,
              errors: entries.filter((entry) => entry.status === 'error').length,
            })}
          </div>

          <div className="erp-table-scroll">
            <table className="erp-table w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--color-bg)' }}>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="text-right py-2.5 px-3">{t('modalManager.importSystemUsers.table.select')}</th>
                  <th className="text-right py-2.5 px-3">{t('modalManager.importSystemUsers.table.name')}</th>
                  <th className="text-right py-2.5 px-3">{t('modalManager.importSystemUsers.table.email')}</th>
                  <th className="text-right py-2.5 px-3">{t('modalManager.importSystemUsers.table.role')}</th>
                  <th className="text-right py-2.5 px-3">{t('modalManager.importSystemUsers.table.employeeCode')}</th>
                  <th className="text-right py-2.5 px-3">{t('modalManager.importSystemUsers.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.rowIndex} className="border-b border-[var(--color-border)]">
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        checked={entry.selected}
                        disabled={entry.status !== 'pending' || creating}
                        onChange={(e) => {
                          setEntries((prev) =>
                            prev.map((row) =>
                              row.rowIndex === entry.rowIndex ? { ...row, selected: e.target.checked } : row,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td className="py-2.5 px-3">{entry.displayName}</td>
                    <td className="py-2.5 px-3">{entry.email}</td>
                    <td className="py-2.5 px-3">{entry.roleNameOrId}</td>
                    <td className="py-2.5 px-3">{entry.employeeCode || '—'}</td>
                    <td className="py-2.5 px-3">
                      {entry.status === 'pending'
                        ? t('modalManager.importSystemUsers.status.pending')
                        : entry.status === 'created'
                          ? t('modalManager.importSystemUsers.status.created')
                          : t('modalManager.importSystemUsers.status.error', {
                              reason:
                                entry.runtimeError ||
                                entry.errors.join(t('modalManager.shared.listSeparator')),
                            })}
                    </td>
                  </tr>
                ))}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 px-3 text-center text-[var(--color-text-muted)]">{t('modalManager.importSystemUsers.noRowsForFilter')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={creating} iconName="close" tone="neutral">{t('ui.close')}</Button>
          <Button
            variant="outline"
            onClick={() => {
              setEntries((prev) =>
                prev.map((entry) => (entry.status === 'pending' ? { ...entry, selected: true } : entry)),
              );
            }}
            disabled={creating || pendingEntries.length === 0}
            iconName="select_all"
            tone="neutral"
          >
            {t('modalManager.importSystemUsers.selectAllPending')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void runCreateForEntries(selectedPending)}
            disabled={creating || selectedPending.length === 0}
            tone="submit"
          >
            {t('modalManager.importSystemUsers.createSelected', { count: selectedPending.length })}
          </Button>
          <Button
            variant="primary"
            onClick={() => void runCreateForEntries(pendingEntries)}
            disabled={creating || pendingEntries.length === 0}
            tone="submit"
          >
            {t('modalManager.importSystemUsers.createAllPending', { count: pendingEntries.length })}
          </Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
