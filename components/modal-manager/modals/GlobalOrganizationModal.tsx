import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { db } from '../../../services/firebase';
import { Button, Badge } from '../../UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import {
  departmentsRef,
  jobPositionsRef,
  shiftsRef,
  penaltyRulesRef,
  lateRulesRef,
  allowanceTypesRef,
  HR_COLLECTIONS,
} from '../../../modules/hr/collections';
import type {
  FirestoreDepartment,
  FirestoreJobPosition,
  FirestoreShift,
  FirestorePenaltyRule,
  FirestoreLateRule,
  FirestoreAllowanceType,
  JobLevel,
  PenaltyType,
  ValueType,
  CalculationType,
} from '../../../modules/hr/types';
import { JOB_LEVEL_LABELS } from '../../../modules/hr/types';
import { useTranslation } from 'react-i18next';

type OrgTab = 'departments' | 'positions' | 'shifts' | 'penalties' | 'lateRules' | 'allowances';

type EmployeeLite = { id?: string; name?: string; isActive?: boolean };

type ModalPayload = {
  tab: OrgTab;
  mode?: 'create' | 'edit';
  item?: unknown;
  departments?: FirestoreDepartment[];
  employees?: EmployeeLite[];
  onSaved?: () => Promise<void> | void;
};

const MODAL_LABEL_KEYS: Record<OrgTab, string> = {
  departments: 'modalManager.organization.modalLabel.department',
  positions: 'modalManager.organization.modalLabel.position',
  shifts: 'modalManager.organization.modalLabel.shift',
  penalties: 'modalManager.organization.modalLabel.penalty',
  lateRules: 'modalManager.organization.modalLabel.lateRule',
  allowances: 'modalManager.organization.modalLabel.allowance',
};

const emptyDept: Omit<FirestoreDepartment, 'id' | 'createdAt'> = { name: '', code: '', managerId: '', isActive: true };
const emptyPos: Omit<FirestoreJobPosition, 'id' | 'createdAt'> = { title: '', departmentId: '', level: 1 as JobLevel, hasSystemAccessDefault: false, isActive: true };
const emptyShift: Omit<FirestoreShift, 'id'> = {
  name: '',
  startTime: '08:00',
  endTime: '16:00',
  latestCheckInTime: '11:59',
  firstCheckOutTime: '12:00',
  breakMinutes: 60,
  lateGraceMinutes: 15,
  crossesMidnight: false,
  isActive: true,
};
const emptyPenalty: Omit<FirestorePenaltyRule, 'id'> = { name: '', type: 'disciplinary', valueType: 'fixed', value: 0, isActive: true };
const emptyLateRule: Omit<FirestoreLateRule, 'id'> = { minutesFrom: 0, minutesTo: 15, penaltyType: 'fixed', penaltyValue: 0 };
const emptyAllowance: Omit<FirestoreAllowanceType, 'id'> = { name: '', calculationType: 'fixed', value: 0, isActive: true };

const inputClass = 'w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium focus:border-primary focus:ring-2 focus:ring-primary/20';
const selectClass = 'w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium';

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void; label: string; color?: string }> = ({ value, onChange, label, color = 'bg-emerald-500' }) => (
  <div className="flex items-center gap-3">
    <label className="text-sm font-bold text-[var(--color-text-muted)]">{label}</label>
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full transition-colors relative ${value ? color : 'bg-slate-300 dark:bg-slate-600'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-[var(--color-card)] rounded-full shadow transition-all ${value ? 'left-5' : 'left-0.5'}`} />
    </button>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-2">
    <label className="block text-sm font-bold text-[var(--color-text-muted)]">{label}</label>
    {children}
  </div>
);

export const GlobalOrganizationModal: React.FC = () => {
  const { t } = useTranslation();
  const penaltyTypeLabels: Record<PenaltyType, string> = {
    late: t('modalManager.organization.penaltyTypeLate'),
    absence: t('modalManager.organization.penaltyTypeAbsence'),
    disciplinary: t('modalManager.organization.penaltyTypeDisciplinary'),
  };
  const valueTypeLabels: Record<ValueType, string> = {
    fixed: t('modalManager.organization.valueTypeFixed'),
    percentage: t('modalManager.organization.valueTypePercentage'),
  };
  const calcTypeLabels: Record<CalculationType, string> = {
    fixed: t('modalManager.organization.calcTypeFixed'),
    percentage: t('modalManager.organization.calcTypeSalaryPercentage'),
  };
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.ORGANIZATION_CREATE);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deptForm, setDeptForm] = useState(emptyDept);
  const [posForm, setPosForm] = useState(emptyPos);
  const [shiftForm, setShiftForm] = useState(emptyShift);
  const [penaltyForm, setPenaltyForm] = useState(emptyPenalty);
  const [lateRuleForm, setLateRuleForm] = useState(emptyLateRule);
  const [allowanceForm, setAllowanceForm] = useState(emptyAllowance);

  const modalPayload = payload as ModalPayload | undefined;
  const tab = modalPayload?.tab ?? 'departments';
  const departments = modalPayload?.departments ?? [];
  const employees = modalPayload?.employees ?? [];
  const isEdit = (modalPayload?.mode ?? 'create') === 'edit';

  useEffect(() => {
    if (!isOpen) return;
    setSaveMsg(null);
    const item = modalPayload?.item;
    if (!isEdit || !item) {
      setEditId(null);
      setDeptForm({ ...emptyDept });
      setPosForm({ ...emptyPos });
      setShiftForm({ ...emptyShift });
      setPenaltyForm({ ...emptyPenalty });
      setLateRuleForm({ ...emptyLateRule });
      setAllowanceForm({ ...emptyAllowance });
      return;
    }

    if (tab === 'departments') {
      const d = item as FirestoreDepartment;
      setEditId(d.id || null);
      setDeptForm({ name: d.name, code: d.code, managerId: d.managerId || '', isActive: d.isActive });
    } else if (tab === 'positions') {
      const p = item as FirestoreJobPosition;
      setEditId(p.id || null);
      setPosForm({ title: p.title, departmentId: p.departmentId, level: p.level, hasSystemAccessDefault: p.hasSystemAccessDefault, isActive: p.isActive });
    } else if (tab === 'shifts') {
      const s = item as FirestoreShift;
      setEditId(s.id || null);
      setShiftForm({
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        latestCheckInTime: s.latestCheckInTime || '11:59',
        firstCheckOutTime: s.firstCheckOutTime || s.endTime || '12:00',
        breakMinutes: s.breakMinutes,
        lateGraceMinutes: s.lateGraceMinutes,
        crossesMidnight: s.crossesMidnight,
        isActive: s.isActive,
      });
    } else if (tab === 'penalties') {
      const p = item as FirestorePenaltyRule;
      setEditId(p.id || null);
      setPenaltyForm({ name: p.name, type: p.type, valueType: p.valueType, value: p.value, isActive: p.isActive });
    } else if (tab === 'lateRules') {
      const r = item as FirestoreLateRule;
      setEditId(r.id || null);
      setLateRuleForm({ minutesFrom: r.minutesFrom, minutesTo: r.minutesTo, penaltyType: r.penaltyType, penaltyValue: r.penaltyValue });
    } else if (tab === 'allowances') {
      const a = item as FirestoreAllowanceType;
      setEditId(a.id || null);
      setAllowanceForm({ name: a.name, calculationType: a.calculationType, value: a.value, isActive: a.isActive });
    }
  }, [isOpen, modalPayload, isEdit, tab]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.isActive !== false),
    [employees],
  );

  if (!isOpen || !modalPayload) return null;

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      if (tab === 'departments') {
        if (!deptForm.name.trim()) return;
        const data = { ...deptForm, name: deptForm.name.trim(), code: deptForm.code.trim() || deptForm.name.trim().substring(0, 3).toUpperCase() };
        if (editId) await updateDoc(doc(db, HR_COLLECTIONS.DEPARTMENTS, editId), data);
        else await addDoc(departmentsRef(), { ...data, createdAt: serverTimestamp() });
      } else if (tab === 'positions') {
        if (!posForm.title.trim()) return;
        const data = { ...posForm, title: posForm.title.trim() };
        if (editId) await updateDoc(doc(db, HR_COLLECTIONS.JOB_POSITIONS, editId), data);
        else await addDoc(jobPositionsRef(), { ...data, createdAt: serverTimestamp() });
      } else if (tab === 'shifts') {
        if (!shiftForm.name.trim()) return;
        const data = { ...shiftForm, name: shiftForm.name.trim() };
        if (editId) await updateDoc(doc(db, HR_COLLECTIONS.SHIFTS, editId), data);
        else await addDoc(shiftsRef(), data);
      } else if (tab === 'penalties') {
        if (!penaltyForm.name.trim()) return;
        const data = { ...penaltyForm, name: penaltyForm.name.trim() };
        if (editId) await updateDoc(doc(db, HR_COLLECTIONS.PENALTY_RULES, editId), data);
        else await addDoc(penaltyRulesRef(), data);
      } else if (tab === 'lateRules') {
        if (lateRuleForm.minutesFrom < 0 || lateRuleForm.minutesTo <= lateRuleForm.minutesFrom) return;
        if (editId) await updateDoc(doc(db, HR_COLLECTIONS.LATE_RULES, editId), { ...lateRuleForm });
        else await addDoc(lateRulesRef(), { ...lateRuleForm });
      } else if (tab === 'allowances') {
        if (!allowanceForm.name.trim()) return;
        const data = { ...allowanceForm, name: allowanceForm.name.trim() };
        if (editId) await updateDoc(doc(db, HR_COLLECTIONS.ALLOWANCE_TYPES, editId), data);
        else await addDoc(allowanceTypesRef(), data);
      }
      await modalPayload.onSaved?.();
      setSaveMsg({ type: 'success', text: editId ? t('modalManager.organization.saveEditSuccess') : t('modalManager.organization.saveCreateSuccess') });
    } catch (e) {
      console.error('GlobalOrganizationModal save error:', e);
      setSaveMsg({ type: 'error', text: t('modalManager.organization.saveError') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) close(); }}>
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-lg border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-lg font-bold">{isEdit ? t('modalManager.organization.editPrefix') : t('modalManager.organization.addPrefix')} {t(MODAL_LABEL_KEYS[tab])}</h3>
          <button onClick={() => { if (!saving) close(); }} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {saveMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {saveMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <p className="flex-1">{saveMsg.text}</p>
              <button onClick={() => setSaveMsg(null)} className="text-current/70 hover:text-current transition-colors">
                <X size={16} />
              </button>
            </div>
          )}

          {tab === 'departments' && (
            <>
              <Field label={t('modalManager.organization.departmentNameRequired')}><input className={inputClass} value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} placeholder={t('modalManager.organization.departmentNamePlaceholder')} autoFocus /></Field>
              <Field label={t('modalManager.organization.departmentCode')}><input className={inputClass} value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} placeholder="ASM" /></Field>
              <Field label={t('modalManager.organization.departmentManager')}>
                <select className={selectClass} value={deptForm.managerId} onChange={(e) => setDeptForm({ ...deptForm, managerId: e.target.value })}>
                  <option value="">{t('modalManager.organization.noManager')}</option>
                  {activeEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </Field>
              <Toggle value={deptForm.isActive} onChange={(v) => setDeptForm({ ...deptForm, isActive: v })} label={t('modalManager.organization.active')} />
            </>
          )}
          {tab === 'positions' && (
            <>
              <Field label={t('modalManager.organization.positionNameRequired')}><input className={inputClass} value={posForm.title} onChange={(e) => setPosForm({ ...posForm, title: e.target.value })} placeholder={t('modalManager.organization.positionNamePlaceholder')} autoFocus /></Field>
              <Field label={t('modalManager.organization.parentDepartment')}>
                <select className={selectClass} value={posForm.departmentId} onChange={(e) => setPosForm({ ...posForm, departmentId: e.target.value })}>
                  <option value="">{t('modalManager.organization.allDepartments')}</option>
                  {departments.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label={t('modalManager.organization.jobLevel')}>
                <select className={selectClass} value={posForm.level} onChange={(e) => setPosForm({ ...posForm, level: Number(e.target.value) as JobLevel })}>
                  {(Object.entries(JOB_LEVEL_LABELS) as [string, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <div className="flex items-center justify-between">
                <Toggle value={posForm.hasSystemAccessDefault} onChange={(v) => setPosForm({ ...posForm, hasSystemAccessDefault: v })} label={t('modalManager.organization.defaultSystemAccess')} />
                <Toggle value={posForm.isActive} onChange={(v) => setPosForm({ ...posForm, isActive: v })} label={t('modalManager.organization.active')} />
              </div>
            </>
          )}
          {tab === 'shifts' && (
            <>
              <Field label={t('modalManager.organization.shiftNameRequired')}><input className={inputClass} value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} placeholder={t('modalManager.organization.shiftNamePlaceholder')} autoFocus /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('modalManager.organization.startTime')}><input type="time" className={inputClass} value={shiftForm.startTime} onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })} /></Field>
                <Field label={t('modalManager.organization.endTime')}><input type="time" className={inputClass} value={shiftForm.endTime} onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('modalManager.organization.latestCheckInTime')}><input type="time" className={inputClass} value={shiftForm.latestCheckInTime || ''} onChange={(e) => setShiftForm({ ...shiftForm, latestCheckInTime: e.target.value })} /></Field>
                <Field label={t('modalManager.organization.firstCheckOutTime')}><input type="time" className={inputClass} value={shiftForm.firstCheckOutTime || ''} onChange={(e) => setShiftForm({ ...shiftForm, firstCheckOutTime: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('modalManager.organization.breakMinutes')}><input type="number" min={0} className={inputClass} value={shiftForm.breakMinutes} onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: Number(e.target.value) || 0 })} /></Field>
                <Field label={t('modalManager.organization.lateGraceMinutes')}><input type="number" min={0} className={inputClass} value={shiftForm.lateGraceMinutes} onChange={(e) => setShiftForm({ ...shiftForm, lateGraceMinutes: Number(e.target.value) || 0 })} /></Field>
              </div>
              <div className="flex items-center justify-between">
                <Toggle value={shiftForm.crossesMidnight} onChange={(v) => setShiftForm({ ...shiftForm, crossesMidnight: v })} label={t('modalManager.organization.crossesMidnight')} color="bg-amber-500" />
                <Toggle value={shiftForm.isActive} onChange={(v) => setShiftForm({ ...shiftForm, isActive: v })} label={t('modalManager.organization.shiftActive')} />
              </div>
            </>
          )}
          {tab === 'penalties' && (
            <>
              <Field label={t('modalManager.organization.penaltyNameRequired')}><input className={inputClass} value={penaltyForm.name} onChange={(e) => setPenaltyForm({ ...penaltyForm, name: e.target.value })} placeholder={t('modalManager.organization.penaltyNamePlaceholder')} autoFocus /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('modalManager.organization.penaltyType')}>
                  <select className={selectClass} value={penaltyForm.type} onChange={(e) => setPenaltyForm({ ...penaltyForm, type: e.target.value as PenaltyType })}>
                    {Object.entries(penaltyTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label={t('modalManager.organization.calculationMethod')}>
                  <select className={selectClass} value={penaltyForm.valueType} onChange={(e) => setPenaltyForm({ ...penaltyForm, valueType: e.target.value as ValueType })}>
                    {Object.entries(valueTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
              </div>
              <Field label={penaltyForm.valueType === 'percentage' ? t('modalManager.organization.percentage') : t('modalManager.organization.amountEgp')}>
                <input type="number" min={0} step={penaltyForm.valueType === 'percentage' ? 0.5 : 1} className={inputClass} value={penaltyForm.value} onChange={(e) => setPenaltyForm({ ...penaltyForm, value: Number(e.target.value) || 0 })} />
              </Field>
              <Toggle value={penaltyForm.isActive} onChange={(v) => setPenaltyForm({ ...penaltyForm, isActive: v })} label={t('modalManager.organization.active')} />
            </>
          )}
          {tab === 'lateRules' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('modalManager.organization.fromMinutes')}><input type="number" min={0} className={inputClass} value={lateRuleForm.minutesFrom} onChange={(e) => setLateRuleForm({ ...lateRuleForm, minutesFrom: Number(e.target.value) || 0 })} autoFocus /></Field>
                <Field label={t('modalManager.organization.toMinutes')}><input type="number" min={1} className={inputClass} value={lateRuleForm.minutesTo} onChange={(e) => setLateRuleForm({ ...lateRuleForm, minutesTo: Number(e.target.value) || 0 })} /></Field>
              </div>
              <Field label={t('modalManager.organization.deductionMethod')}>
                <select className={selectClass} value={lateRuleForm.penaltyType} onChange={(e) => setLateRuleForm({ ...lateRuleForm, penaltyType: e.target.value as ValueType })}>
                  {Object.entries(valueTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label={lateRuleForm.penaltyType === 'percentage' ? t('modalManager.organization.percentage') : t('modalManager.organization.amountEgp')}>
                <input type="number" min={0} step={lateRuleForm.penaltyType === 'percentage' ? 0.5 : 1} className={inputClass} value={lateRuleForm.penaltyValue} onChange={(e) => setLateRuleForm({ ...lateRuleForm, penaltyValue: Number(e.target.value) || 0 })} />
              </Field>
              <p className="text-xs text-slate-400">{t('modalManager.organization.lateRuleExample')}</p>
            </>
          )}
          {tab === 'allowances' && (
            <>
              <Field label={t('modalManager.organization.allowanceNameRequired')}><input className={inputClass} value={allowanceForm.name} onChange={(e) => setAllowanceForm({ ...allowanceForm, name: e.target.value })} placeholder={t('modalManager.organization.allowanceNamePlaceholder')} autoFocus /></Field>
              <Field label={t('modalManager.organization.calculationMethod')}>
                <select className={selectClass} value={allowanceForm.calculationType} onChange={(e) => setAllowanceForm({ ...allowanceForm, calculationType: e.target.value as CalculationType })}>
                  {Object.entries(calcTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label={allowanceForm.calculationType === 'percentage' ? t('modalManager.organization.salaryPercentage') : t('modalManager.organization.amountEgp')}>
                <input type="number" min={0} step={allowanceForm.calculationType === 'percentage' ? 0.5 : 1} className={inputClass} value={allowanceForm.value} onChange={(e) => setAllowanceForm({ ...allowanceForm, value: Number(e.target.value) || 0 })} />
              </Field>
              <Toggle value={allowanceForm.isActive} onChange={(v) => setAllowanceForm({ ...allowanceForm, isActive: v })} label={t('modalManager.organization.active')} />
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between">
          <div className="text-xs text-[var(--color-text-muted)]">
            <Badge variant="neutral">{t(MODAL_LABEL_KEYS[tab])}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => { if (!saving) close(); }}>{t('ui.close')}</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? t('modalManager.organization.saveChanges') : t('modalManager.organization.add')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

