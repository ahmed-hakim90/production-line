import React, { useMemo, useRef, useState } from 'react';
import { Download, Loader2, Upload, X } from 'lucide-react';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import type { FirestoreEmployee, FirestoreRole } from '../../../types';
import { parseUsersImportFile, type ParsedUserImportRow } from '../../../utils/importUsers';
import { downloadUsersTemplate } from '../../../utils/downloadTemplates';

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
      if (parsed.totalRows === 0) setMessage('الملف لا يحتوي على بيانات.');
    } catch {
      setMessage('تعذر قراءة ملف الاستيراد.');
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
        next[idx] = { ...next[idx], status: 'error', runtimeError: `الدور غير معروف: ${target.roleNameOrId}` };
        failedCount += 1;
        continue;
      }

      let employeeId: string | undefined;
      const code = String(target.employeeCode || '').trim().toLowerCase();
      if (code) {
        employeeId = employeeByCode.get(code);
        if (!employeeId) {
          next[idx] = { ...next[idx], status: 'error', runtimeError: `كود الموظف غير موجود: ${target.employeeCode}` };
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
        next[idx] = { ...next[idx], status: 'error', runtimeError: error?.message || 'تعذر إنشاء الحساب' };
        failedCount += 1;
      }
      setEntries([...next]);
    }

    setEntries([...next]);
    setCreating(false);
    setMessage(`تم إنشاء ${createdCount} حساب، وفشل ${failedCount}.`);
  };

  const pendingEntries = entries.filter((entry) => entry.status === 'pending');
  const selectedPending = pendingEntries.filter((entry) => entry.selected);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[96vw] max-w-5xl max-h-[90dvh] border border-[var(--color-border)] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">استيراد مستخدمين</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">الرفع لا ينشئ الحسابات مباشرة. راجع الصفوف ثم أنشئ المطلوب.</p>
          </div>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors" disabled={creating}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && void handlePickFile(e.target.files[0])} />

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={parsing || creating}>
              {parsing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {parsing ? 'جاري قراءة الملف...' : 'اختيار ملف الاستيراد'}
            </button>
            <button className="btn btn-secondary" onClick={downloadUsersTemplate} disabled={parsing || creating}>
              <Download size={15} />
              تحميل قالب الاستيراد
            </button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${filter === 'all' ? 'bg-primary text-white border-primary' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
              onClick={() => setFilter('all')}
            >
              الكل
            </button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${filter === 'pending' ? 'bg-amber-500 text-white border-amber-500' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
              onClick={() => setFilter('pending')}
            >
              غير منشأ
            </button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${filter === 'created' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
              onClick={() => setFilter('created')}
            >
              منشأ
            </button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${filter === 'error' ? 'bg-rose-600 text-white border-rose-600' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
              onClick={() => setFilter('error')}
            >
              أخطاء
            </button>
          </div>

          {message && (
            <div className="rounded-[var(--border-radius-base)] border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-bold text-amber-700">
              {message}
            </div>
          )}

          <div className="text-xs text-[var(--color-text-muted)] font-medium">
            إجمالي: {entries.length} | غير منشأ: {pendingEntries.length} | منشأ: {entries.filter((entry) => entry.status === 'created').length} | أخطاء: {entries.filter((entry) => entry.status === 'error').length}
          </div>

          <div className="erp-table-scroll">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: '#f8f9fa' }}>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="text-right py-2.5 px-3">تحديد</th>
                  <th className="text-right py-2.5 px-3">الاسم</th>
                  <th className="text-right py-2.5 px-3">البريد</th>
                  <th className="text-right py-2.5 px-3">الدور</th>
                  <th className="text-right py-2.5 px-3">كود الموظف</th>
                  <th className="text-right py-2.5 px-3">الحالة</th>
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
                      {entry.status === 'pending' ? 'غير منشأ' : entry.status === 'created' ? 'تم الإنشاء' : `خطأ: ${entry.runtimeError || entry.errors.join('، ')}`}
                    </td>
                  </tr>
                ))}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 px-3 text-center text-[var(--color-text-muted)]">لا توجد صفوف لهذا الفلتر.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <button className="btn btn-secondary" onClick={handleClose} disabled={creating}>إغلاق</button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setEntries((prev) =>
                prev.map((entry) => (entry.status === 'pending' ? { ...entry, selected: true } : entry)),
              );
            }}
            disabled={creating || pendingEntries.length === 0}
          >
            تحديد الكل غير المنشأ
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void runCreateForEntries(selectedPending)}
            disabled={creating || selectedPending.length === 0}
          >
            إنشاء/تفعيل المحدد ({selectedPending.length})
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void runCreateForEntries(pendingEntries)}
            disabled={creating || pendingEntries.length === 0}
          >
            إنشاء/تفعيل الكل غير المنشأ ({pendingEntries.length})
          </button>
        </div>
      </div>
    </div>
  );
};

