import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button, SearchableSelect } from '@/components/UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { useAppStore } from '@/store/useAppStore';
import type { AttendanceRecord } from '@/modules/attendance/types';
import { useTranslation } from 'react-i18next';

type RowDraft = { checkIn: string; checkOut: string };

function monthRangeToday(): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${d}` };
}

function toClock(value: any): string {
  if (!value) return '';
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) return value;
  return '';
}

export const GlobalAttendanceSignatureFixModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.ATTENDANCE_SIGNATURE_FIX);
  const employees = useAppStore((s) => s.employees);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);
  const getSinglePunchRecordsByEmployee = useAppStore((s) => s.getSinglePunchRecordsByEmployee);
  const updateAttendanceRecordTimes = useAppStore((s) => s.updateAttendanceRecordTimes);

  const [loading, setLoading] = React.useState(false);
  const [savingId, setSavingId] = React.useState('');
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState('');
  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, RowDraft>>({});
  const [range, setRange] = React.useState(monthRangeToday());

  const employeeOptions = React.useMemo(
    () => employees.map((emp) => ({ value: emp.id, label: `${emp.name}${emp.code ? ` (${emp.code})` : ''}` })),
    [employees],
  );

  React.useEffect(() => {
    if (!isOpen) return;
    void fetchEmployees();
  }, [fetchEmployees, isOpen]);

  if (!isOpen) return null;

  const loadRecords = async () => {
    if (!selectedEmployeeId) return;
    setLoading(true);
    setMessage(null);
    try {
      const rows = await getSinglePunchRecordsByEmployee(selectedEmployeeId, range.startDate, range.endDate);
      setRecords(rows);
      const initialDrafts: Record<string, RowDraft> = {};
      rows.forEach((row) => {
        initialDrafts[row.id] = {
          checkIn: toClock(row.checkIn),
          checkOut: toClock(row.checkOut),
        };
      });
      setDrafts(initialDrafts);
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message || t('modalManager.attendanceSignatureFix.fetchRecordsError') });
    } finally {
      setLoading(false);
    }
  };

  const updateDraft = (recordId: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [recordId]: {
        checkIn: prev[recordId]?.checkIn || '',
        checkOut: prev[recordId]?.checkOut || '',
        ...patch,
      },
    }));
  };

  const saveRow = async (recordId: string) => {
    const draft = drafts[recordId];
    if (!draft) return;
    setSavingId(recordId);
    setMessage(null);
    try {
      await updateAttendanceRecordTimes(recordId, {
        checkIn: draft.checkIn || null,
        checkOut: draft.checkOut || null,
      });
      setMessage({ type: 'success', text: t('modalManager.attendanceSignatureFix.saveSuccess') });
      await loadRecords();
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message || t('modalManager.attendanceSignatureFix.saveError') });
    } finally {
      setSavingId('');
    }
  };

  return (
    <div className="erp-modal-overlay" onClick={() => { if (!savingId) close(); }}>
      <div
        className="erp-modal-panel w-[96vw] max-w-5xl max-h-[92dvh] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="erp-modal-head">
          <h3 className="erp-modal-title">{t('modalManager.attendanceSignatureFix.title')}</h3>
          <button className="erp-modal-close" onClick={() => { if (!savingId) close(); }} aria-label={t('ui.close')}>
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className="erp-modal-body space-y-4">
          {message && (
            <div className={`rounded-[var(--border-radius-base)] px-3 py-2 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {message.text}
            </div>
          )}

          <div className="erp-filter-bar border border-[var(--color-border)] rounded-[var(--border-radius-base)]">
            <div className="w-full md:w-[320px]">
              <label className="erp-filter-label">{t('modalManager.attendanceSignatureFix.employee')}</label>
              <SearchableSelect
                options={employeeOptions}
                value={selectedEmployeeId}
                onChange={(value) => setSelectedEmployeeId(value)}
                placeholder={t('modalManager.attendanceSignatureFix.selectEmployee')}
              />
            </div>
            <label className="erp-filter-date">
              <span className="erp-filter-label">{t('modalManager.attendanceSignatureFix.from')}</span>
              <input type="date" value={range.startDate} onChange={(e) => setRange((p) => ({ ...p, startDate: e.target.value }))} />
            </label>
            <label className="erp-filter-date">
              <span className="erp-filter-label">{t('modalManager.attendanceSignatureFix.to')}</span>
              <input type="date" value={range.endDate} onChange={(e) => setRange((p) => ({ ...p, endDate: e.target.value }))} />
            </label>
            <button
              type="button"
              className="erp-filter-apply"
              onClick={() => void loadRecords()}
              disabled={loading || !selectedEmployeeId}
            >
              <span className="material-icons-round text-sm">search</span>
              {loading ? t('modalManager.attendanceSignatureFix.loading') : t('modalManager.attendanceSignatureFix.showDays')}
            </button>
          </div>

          <div className="overflow-auto border border-[var(--color-border)] rounded-[var(--border-radius-base)]">
            <table className="erp-table min-w-full text-sm">
              <thead className="bg-[var(--color-bg-alt)]">
                <tr>
                  <th className="px-3 py-2 text-right">{t('modalManager.attendanceSignatureFix.table.date')}</th>
                  <th className="px-3 py-2 text-right">{t('modalManager.attendanceSignatureFix.table.status')}</th>
                  <th className="px-3 py-2 text-right">{t('modalManager.attendanceSignatureFix.table.checkIn')}</th>
                  <th className="px-3 py-2 text-right">{t('modalManager.attendanceSignatureFix.table.checkOut')}</th>
                  <th className="px-3 py-2 text-right">{t('modalManager.attendanceSignatureFix.table.action')}</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-[var(--color-text-muted)]" colSpan={5}>
                      {t('modalManager.attendanceSignatureFix.noRows')}
                    </td>
                  </tr>
                )}
                {records.map((record) => {
                  const row = drafts[record.id] || { checkIn: '', checkOut: '' };
                  const rowSaving = savingId === record.id;
                  return (
                    <tr key={record.id} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 font-semibold">{record.date}</td>
                      <td className="px-3 py-2">{record.statusDetails || record.status}</td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          className="w-full border border-[var(--color-border)] rounded px-2 py-1.5"
                          value={row.checkIn}
                          onChange={(e) => updateDraft(record.id, { checkIn: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          className="w-full border border-[var(--color-border)] rounded px-2 py-1.5"
                          value={row.checkOut}
                          onChange={(e) => updateDraft(record.id, { checkOut: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => void saveRow(record.id)}
                          disabled={rowSaving}
                        >
                          {rowSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          {rowSaving ? t('modalManager.attendanceSignatureFix.saving') : t('ui.save')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="erp-modal-foot">
          <button type="button" className="erp-btn erp-btn-light" onClick={() => close()}>
            {t('ui.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

