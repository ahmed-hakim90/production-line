import React from 'react';
import { Loader2, Users } from 'lucide-react';
import { Button, SearchableSelect } from '@/components/UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { shiftService } from '@/modules/hr/shiftService';
import type { FirestoreShift } from '@/modules/hr/types';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from 'react-i18next';

type SaveMessage = { type: 'success' | 'error'; text: string } | null;

function parseCodes(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,;\n\r\t]+/).map((item) => item.trim()).filter(Boolean)));
}

export const GlobalAttendanceShiftRulesModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.ATTENDANCE_SHIFT_RULES);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);

  const [loading, setLoading] = React.useState(false);
  const [savingRules, setSavingRules] = React.useState(false);
  const [assigning, setAssigning] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState<SaveMessage>(null);
  const [shifts, setShifts] = React.useState<FirestoreShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = React.useState('');
  const [codesInput, setCodesInput] = React.useState('');
  const [assignmentSummary, setAssignmentSummary] = React.useState<string>('');
  const [form, setForm] = React.useState({
    startTime: '08:00',
    endTime: '16:00',
    latestCheckInTime: '11:59',
    firstCheckOutTime: '12:00',
    breakMinutes: 60,
    lateGraceMinutes: 15,
    crossesMidnight: false,
    isActive: true,
  });

  const selectedShift = React.useMemo(
    () => shifts.find((shift) => shift.id === selectedShiftId) || null,
    [selectedShiftId, shifts],
  );

  const shiftOptions = React.useMemo(
    () =>
      shifts.map((shift) => ({
        value: shift.id || '',
        label: `${shift.name} (${shift.startTime} - ${shift.endTime})`,
      })),
    [shifts],
  );

  const refreshShifts = React.useCallback(async () => {
    setLoading(true);
    setSaveMsg(null);
    try {
      const rows = await shiftService.getAll();
      setShifts(rows);
      if (!selectedShiftId && rows.length > 0) {
        setSelectedShiftId(rows[0].id || '');
      } else if (selectedShiftId && !rows.some((item) => item.id === selectedShiftId)) {
        setSelectedShiftId(rows[0]?.id || '');
      }
    } catch (error) {
      setSaveMsg({ type: 'error', text: (error as Error).message || t('modalManager.attendanceShiftRules.loadError') });
    } finally {
      setLoading(false);
    }
  }, [selectedShiftId]);

  React.useEffect(() => {
    if (!isOpen) return;
    void refreshShifts();
    void fetchEmployees();
  }, [fetchEmployees, isOpen, refreshShifts]);

  React.useEffect(() => {
    if (!selectedShift) return;
    setForm({
      startTime: selectedShift.startTime || '08:00',
      endTime: selectedShift.endTime || '16:00',
      latestCheckInTime: selectedShift.latestCheckInTime || '11:59',
      firstCheckOutTime: selectedShift.firstCheckOutTime || selectedShift.endTime || '12:00',
      breakMinutes: Number(selectedShift.breakMinutes || 0),
      lateGraceMinutes: Number(selectedShift.lateGraceMinutes || 0),
      crossesMidnight: Boolean(selectedShift.crossesMidnight),
      isActive: selectedShift.isActive !== false,
    });
  }, [selectedShift]);

  if (!isOpen) return null;

  const handleSaveRules = async () => {
    if (!selectedShiftId) return;
    setSavingRules(true);
    setSaveMsg(null);
    try {
      await shiftService.updateShiftRules(selectedShiftId, {
        startTime: form.startTime,
        endTime: form.endTime,
        latestCheckInTime: form.latestCheckInTime,
        firstCheckOutTime: form.firstCheckOutTime,
        breakMinutes: Math.max(0, Number(form.breakMinutes || 0)),
        lateGraceMinutes: Math.max(0, Number(form.lateGraceMinutes || 0)),
        crossesMidnight: form.crossesMidnight,
        isActive: form.isActive,
      });
      setSaveMsg({ type: 'success', text: t('modalManager.attendanceShiftRules.saveSuccess') });
      await refreshShifts();
    } catch (error) {
      setSaveMsg({ type: 'error', text: (error as Error).message || t('modalManager.attendanceShiftRules.saveError') });
    } finally {
      setSavingRules(false);
    }
  };

  const handleAssignCodes = async () => {
    if (!selectedShiftId) return;
    const parsedCodes = parseCodes(codesInput);
    if (parsedCodes.length === 0) {
      setSaveMsg({ type: 'error', text: t('modalManager.attendanceShiftRules.enterCodesError') });
      return;
    }
    setAssigning(true);
    setSaveMsg(null);
    setAssignmentSummary('');
    try {
      const result = await shiftService.assignEmployeesByCodes(selectedShiftId, parsedCodes);
      const missingText = result.missing.length > 0
        ? t('modalManager.attendanceShiftRules.missingCodes', { codes: result.missing.join(', ') })
        : '';
      setAssignmentSummary(t('modalManager.attendanceShiftRules.assignmentSummary', { updated: result.updated, total: parsedCodes.length, missingText }));
      setSaveMsg({ type: 'success', text: t('modalManager.attendanceShiftRules.assignSuccess') });
      await fetchEmployees();
    } catch (error) {
      setSaveMsg({ type: 'error', text: (error as Error).message || t('modalManager.attendanceShiftRules.assignError') });
    } finally {
      setAssigning(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] bg-[var(--color-card)] text-sm text-[var(--color-text)] focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none';

  return (
    <div className="erp-modal-overlay" onClick={() => { if (!savingRules && !assigning) close(); }}>
      <div
        className="erp-modal-panel w-[96vw] max-w-3xl max-h-[92dvh] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="erp-modal-head">
          <h3 className="erp-modal-title">{t('modalManager.attendanceShiftRules.title')}</h3>
          <button className="erp-modal-close" onClick={() => { if (!savingRules && !assigning) close(); }} aria-label={t('ui.close')}>
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className="erp-modal-body space-y-4">
          {saveMsg && (
            <div className={`rounded-[var(--border-radius-base)] px-3 py-2 text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {saveMsg.text}
            </div>
          )}

          <div className="erp-filter-bar border border-[var(--color-border)] rounded-[var(--border-radius-base)]">
            <div className="w-full md:w-[360px]">
              <label className="erp-filter-label">{t('modalManager.attendanceShiftRules.selectShift')}</label>
              <SearchableSelect
                options={shiftOptions}
                value={selectedShiftId}
                onChange={(value) => setSelectedShiftId(value)}
                placeholder={t('modalManager.attendanceShiftRules.selectShiftPlaceholder')}
              />
            </div>
            <button className="erp-filter-apply" onClick={() => void refreshShifts()} disabled={loading}>
              <span className="material-icons-round text-sm">{loading ? 'sync' : 'refresh'}</span>
              {loading ? t('ui.loading') : t('topbar.refresh')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">
                {t('modalManager.attendanceShiftRules.shiftStart')}
              </label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">
                {t('modalManager.attendanceShiftRules.shiftEnd')}
              </label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">
                {t('modalManager.attendanceShiftRules.latestCheckIn')}
              </label>
              <input
                type="time"
                value={form.latestCheckInTime}
                onChange={(e) => setForm((p) => ({ ...p, latestCheckInTime: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">
                {t('modalManager.attendanceShiftRules.firstCheckOut')}
              </label>
              <input
                type="time"
                value={form.firstCheckOutTime}
                onChange={(e) => setForm((p) => ({ ...p, firstCheckOutTime: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">
                {t('modalManager.attendanceShiftRules.breakMinutes')}
              </label>
              <input
                type="number"
                min={0}
                value={form.breakMinutes}
                onChange={(e) => setForm((p) => ({ ...p, breakMinutes: Number(e.target.value) || 0 }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">
                {t('modalManager.attendanceShiftRules.lateGraceMinutes')}
              </label>
              <input
                type="number"
                min={0}
                value={form.lateGraceMinutes}
                onChange={(e) => setForm((p) => ({ ...p, lateGraceMinutes: Number(e.target.value) || 0 }))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.crossesMidnight}
                onChange={(e) => setForm((p) => ({ ...p, crossesMidnight: e.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-[var(--color-text)]">{t('modalManager.attendanceShiftRules.crossesMidnight')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-[var(--color-text)]">{t('modalManager.attendanceShiftRules.shiftActive')}</span>
            </label>
          </div>

          <div className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 bg-[var(--color-card)] space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-[var(--color-text-muted)]" style={{ fontSize: 16 }}>
                group_add
              </span>
              <h4 className="text-sm font-bold text-[var(--color-text)]">
                {t('modalManager.attendanceShiftRules.assignCodesTitle')}
              </h4>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t('modalManager.attendanceShiftRules.assignCodesHint')}
            </p>
            <label className="block text-xs font-bold text-[var(--color-text-muted)]">
              {t('modalManager.attendanceShiftRules.employeeCodes')}
            </label>
            <textarea
              className={`${inputClass} placeholder:text-[var(--color-text-muted)] resize-none font-mono`}
              rows={4}
              placeholder={`1001
1002
1003`}
              value={codesInput}
              onChange={(e) => setCodesInput(e.target.value)}
            />
            {assignmentSummary && <div className="text-xs font-semibold text-[var(--color-text-muted)]">{assignmentSummary}</div>}
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => void handleAssignCodes()} disabled={assigning || !selectedShiftId}>
                {assigning ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                {assigning ? t('modalManager.attendanceShiftRules.assigning') : t('modalManager.attendanceShiftRules.assignCodes')}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-4 border-t border-[var(--color-border)] mt-4">
          <button type="button" className="btn btn-secondary" onClick={() => close()}>
            {t('ui.close')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void handleSaveRules()} disabled={savingRules || !selectedShiftId}>
            {savingRules ? (
              <>
                <span className="material-icons-round animate-spin text-sm">sync</span>
                {t('modalManager.attendanceShiftRules.saving')}
              </>
            ) : (
              <>
                <span className="material-icons-round text-sm">save</span>
                {t('modalManager.attendanceShiftRules.saveRules')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

