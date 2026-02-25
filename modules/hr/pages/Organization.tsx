import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  departmentsRef, jobPositionsRef, shiftsRef,
  penaltyRulesRef, lateRulesRef, allowanceTypesRef,
  HR_COLLECTIONS,
} from '../collections';
import type {
  FirestoreDepartment, FirestoreJobPosition, FirestoreShift,
  FirestorePenaltyRule, FirestoreLateRule, FirestoreAllowanceType,
  JobLevel, PenaltyType, ValueType, CalculationType,
} from '../types';
import { JOB_LEVEL_LABELS } from '../types';

type OrgTab = 'departments' | 'positions' | 'shifts' | 'penalties' | 'lateRules' | 'allowances';

const TABS: { key: OrgTab; label: string; icon: string }[] = [
  { key: 'departments', label: 'الأقسام', icon: 'business' },
  { key: 'positions', label: 'المناصب', icon: 'work' },
  { key: 'shifts', label: 'الورديات', icon: 'schedule' },
  { key: 'penalties', label: 'الجزاءات', icon: 'gavel' },
  { key: 'lateRules', label: 'قواعد التأخير', icon: 'timer_off' },
  { key: 'allowances', label: 'البدلات', icon: 'card_giftcard' },
];

const PENALTY_TYPE_LABELS: Record<PenaltyType, string> = { late: 'تأخير', absence: 'غياب', disciplinary: 'تأديبي' };
const VALUE_TYPE_LABELS: Record<ValueType, string> = { fixed: 'مبلغ ثابت', percentage: 'نسبة مئوية' };
const CALC_TYPE_LABELS: Record<CalculationType, string> = { fixed: 'مبلغ ثابت', percentage: 'نسبة من الراتب' };

const emptyDept: Omit<FirestoreDepartment, 'id' | 'createdAt'> = { name: '', code: '', managerId: '', isActive: true };
const emptyPos: Omit<FirestoreJobPosition, 'id' | 'createdAt'> = { title: '', departmentId: '', level: 1 as JobLevel, hasSystemAccessDefault: false, isActive: true };
const emptyShift: Omit<FirestoreShift, 'id'> = { name: '', startTime: '08:00', endTime: '16:00', breakMinutes: 60, lateGraceMinutes: 15, crossesMidnight: false, isActive: true };
const emptyPenalty: Omit<FirestorePenaltyRule, 'id'> = { name: '', type: 'disciplinary', valueType: 'fixed', value: 0, isActive: true };
const emptyLateRule: Omit<FirestoreLateRule, 'id'> = { minutesFrom: 0, minutesTo: 15, penaltyType: 'fixed', penaltyValue: 0 };
const emptyAllowance: Omit<FirestoreAllowanceType, 'id'> = { name: '', calculationType: 'fixed', value: 0, isActive: true };

const inputClass = 'w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium focus:border-primary focus:ring-2 focus:ring-primary/20';
const selectClass = 'w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium';

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void; label: string; color?: string }> = ({ value, onChange, label, color = 'bg-emerald-500' }) => (
  <div className="flex items-center gap-3">
    <label className="text-sm font-bold text-slate-600 dark:text-slate-400">{label}</label>
    <button type="button" onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full transition-colors relative ${value ? color : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${value ? 'left-5' : 'left-0.5'}`} />
    </button>
  </div>
);

export const Organization: React.FC = () => {
  const { can } = usePermission();
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const canEdit = can('hrSettings.edit');

  const [tab, setTab] = useState<OrgTab>('departments');
  const [loading, setLoading] = useState(true);

  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [positions, setPositions] = useState<FirestoreJobPosition[]>([]);
  const [shifts, setShifts] = useState<FirestoreShift[]>([]);
  const [penalties, setPenalties] = useState<FirestorePenaltyRule[]>([]);
  const [lateRulesList, setLateRulesList] = useState<FirestoreLateRule[]>([]);
  const [allowances, setAllowances] = useState<FirestoreAllowanceType[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deptForm, setDeptForm] = useState(emptyDept);
  const [posForm, setPosForm] = useState(emptyPos);
  const [shiftForm, setShiftForm] = useState(emptyShift);
  const [penaltyForm, setPenaltyForm] = useState(emptyPenalty);
  const [lateRuleForm, setLateRuleForm] = useState(emptyLateRule);
  const [allowanceForm, setAllowanceForm] = useState(emptyAllowance);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dSnap, pSnap, sSnap, penSnap, lrSnap, alSnap] = await Promise.all([
        getDocs(departmentsRef()),
        getDocs(jobPositionsRef()),
        getDocs(shiftsRef()),
        getDocs(penaltyRulesRef()),
        getDocs(lateRulesRef()),
        getDocs(allowanceTypesRef()),
      ]);
      setDepartments(dSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment)));
      setPositions(pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreJobPosition)));
      setShifts(sSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreShift)));
      setPenalties(penSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestorePenaltyRule)));
      setLateRulesList(lrSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreLateRule)).sort((a, b) => a.minutesFrom - b.minutesFrom));
      setAllowances(alSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreAllowanceType)));
    } catch (e) {
      console.error('Organization loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name ?? '—';
  const getManagerName = (id: string) => _rawEmployees.find((e) => e.id === id)?.name ?? '—';

  const deptEmployeeCount = useMemo(() => {
    const map: Record<string, number> = {};
    _rawEmployees.forEach((e) => { if (e.departmentId) map[e.departmentId] = (map[e.departmentId] || 0) + 1; });
    return map;
  }, [_rawEmployees]);

  const posCountByDept = useMemo(() => {
    const map: Record<string, number> = {};
    positions.forEach((p) => { if (p.departmentId) map[p.departmentId] = (map[p.departmentId] || 0) + 1; });
    return map;
  }, [positions]);

  const openCreate = () => {
    setEditId(null);
    setSaveMsg(null);
    if (tab === 'departments') setDeptForm({ ...emptyDept });
    else if (tab === 'positions') setPosForm({ ...emptyPos });
    else if (tab === 'shifts') setShiftForm({ ...emptyShift });
    else if (tab === 'penalties') setPenaltyForm({ ...emptyPenalty });
    else if (tab === 'lateRules') setLateRuleForm({ ...emptyLateRule });
    else if (tab === 'allowances') setAllowanceForm({ ...emptyAllowance });
    setShowModal(true);
  };

  const openEditDept = (d: FirestoreDepartment) => { setEditId(d.id!); setSaveMsg(null); setDeptForm({ name: d.name, code: d.code, managerId: d.managerId || '', isActive: d.isActive }); setTab('departments'); setShowModal(true); };
  const openEditPos = (p: FirestoreJobPosition) => { setEditId(p.id!); setSaveMsg(null); setPosForm({ title: p.title, departmentId: p.departmentId, level: p.level, hasSystemAccessDefault: p.hasSystemAccessDefault, isActive: p.isActive }); setTab('positions'); setShowModal(true); };
  const openEditShift = (s: FirestoreShift) => { setEditId(s.id!); setSaveMsg(null); setShiftForm({ name: s.name, startTime: s.startTime, endTime: s.endTime, breakMinutes: s.breakMinutes, lateGraceMinutes: s.lateGraceMinutes, crossesMidnight: s.crossesMidnight, isActive: s.isActive }); setTab('shifts'); setShowModal(true); };
  const openEditPenalty = (p: FirestorePenaltyRule) => { setEditId(p.id!); setSaveMsg(null); setPenaltyForm({ name: p.name, type: p.type, valueType: p.valueType, value: p.value, isActive: p.isActive }); setTab('penalties'); setShowModal(true); };
  const openEditLateRule = (r: FirestoreLateRule) => { setEditId(r.id!); setSaveMsg(null); setLateRuleForm({ minutesFrom: r.minutesFrom, minutesTo: r.minutesTo, penaltyType: r.penaltyType, penaltyValue: r.penaltyValue }); setTab('lateRules'); setShowModal(true); };
  const openEditAllowance = (a: FirestoreAllowanceType) => { setEditId(a.id!); setSaveMsg(null); setAllowanceForm({ name: a.name, calculationType: a.calculationType, value: a.value, isActive: a.isActive }); setTab('allowances'); setShowModal(true); };

  const getCollectionName = (): string => {
    const map: Record<OrgTab, string> = {
      departments: HR_COLLECTIONS.DEPARTMENTS,
      positions: HR_COLLECTIONS.JOB_POSITIONS,
      shifts: HR_COLLECTIONS.SHIFTS,
      penalties: HR_COLLECTIONS.PENALTY_RULES,
      lateRules: HR_COLLECTIONS.LATE_RULES,
      allowances: HR_COLLECTIONS.ALLOWANCE_TYPES,
    };
    return map[tab];
  };

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
      await loadData();
      setSaveMsg({ type: 'success', text: editId ? 'تم حفظ التعديلات بنجاح' : 'تمت الإضافة بنجاح' });
    } catch (e) {
      console.error('Organization save error:', e);
      setSaveMsg({ type: 'error', text: 'تعذر الحفظ. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteDoc(doc(db, getCollectionName(), deleteConfirmId));
      setDeleteConfirmId(null);
      await loadData();
    } catch (e) {
      console.error('Organization delete error:', e);
    }
  };

  const ADD_LABELS: Record<OrgTab, string> = {
    departments: 'إضافة قسم', positions: 'إضافة منصب', shifts: 'إضافة وردية',
    penalties: 'إضافة جزاء', lateRules: 'إضافة قاعدة', allowances: 'إضافة بدل',
  };
  const MODAL_LABELS: Record<OrgTab, string> = {
    departments: 'قسم', positions: 'منصب', shifts: 'وردية',
    penalties: 'جزاء', lateRules: 'قاعدة تأخير', allowances: 'بدل',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white">الهيكل التنظيمي</h1>
          <p className="text-sm text-slate-500 mt-1">إدارة الأقسام والمناصب والورديات والجزاءات والبدلات</p>
        </div>
        {canEdit && (
          <Button variant="primary" onClick={openCreate}>
            <span className="material-icons-round text-lg">add</span>
            {ADD_LABELS[tab]}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'الأقسام', count: departments.filter((d) => d.isActive).length, icon: 'business', color: 'text-blue-500 bg-blue-500/10' },
          { label: 'المناصب', count: positions.filter((p) => p.isActive).length, icon: 'work', color: 'text-emerald-500 bg-emerald-500/10' },
          { label: 'الورديات', count: shifts.filter((s) => s.isActive).length, icon: 'schedule', color: 'text-violet-500 bg-violet-500/10' },
          { label: 'الجزاءات', count: penalties.filter((p) => p.isActive).length, icon: 'gavel', color: 'text-rose-500 bg-rose-500/10' },
          { label: 'قواعد التأخير', count: lateRulesList.length, icon: 'timer_off', color: 'text-amber-500 bg-amber-500/10' },
          { label: 'البدلات', count: allowances.filter((a) => a.isActive).length, icon: 'card_giftcard', color: 'text-teal-500 bg-teal-500/10' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <div className={`w-10 h-10 ${s.color} rounded-lg flex items-center justify-center`}>
              <span className="material-icons-round text-xl">{s.icon}</span>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-medium">{s.label}</p>
              <p className="text-lg font-black">{s.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
              tab === t.key ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>
            <span className="material-icons-round text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Departments Tab ── */}
      {tab === 'departments' && (
        <Card>
          {departments.length === 0 ? <EmptyState icon="business" label="لا يوجد أقسام" sub='اضغط "إضافة قسم" للبدء' /> : (
            <DataTable headers={['القسم', 'الرمز', 'مدير القسم', { label: 'الموظفين', center: true }, { label: 'المناصب', center: true }, { label: 'الحالة', center: true }]} canEdit={canEdit}>
              {departments.map((d) => (
                <tr key={d.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-white">{d.name}</td>
                  <td className="py-3 px-4"><span className="bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded text-xs font-mono">{d.code}</span></td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{d.managerId ? getManagerName(d.managerId) : '—'}</td>
                  <td className="py-3 px-4 text-center font-bold">{deptEmployeeCount[d.id!] || 0}</td>
                  <td className="py-3 px-4 text-center font-bold">{posCountByDept[d.id!] || 0}</td>
                  <td className="py-3 px-4 text-center"><Badge variant={d.isActive ? 'success' : 'neutral'}>{d.isActive ? 'نشط' : 'معطل'}</Badge></td>
                  {canEdit && <ActionCell onEdit={() => openEditDept(d)} onDelete={() => setDeleteConfirmId(d.id!)} />}
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}

      {/* ── Positions Tab ── */}
      {tab === 'positions' && (
        <Card>
          {positions.length === 0 ? <EmptyState icon="work" label="لا يوجد مناصب" sub='اضغط "إضافة منصب" للبدء' /> : (
            <DataTable headers={['المنصب', 'القسم', { label: 'المستوى', center: true }, { label: 'دخول نظام', center: true }, { label: 'الحالة', center: true }]} canEdit={canEdit}>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-white">{p.title}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{getDeptName(p.departmentId)}</td>
                  <td className="py-3 px-4 text-center"><span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-bold">{JOB_LEVEL_LABELS[p.level]}</span></td>
                  <td className="py-3 px-4 text-center"><span className={`material-icons-round text-lg ${p.hasSystemAccessDefault ? 'text-emerald-500' : 'text-slate-300'}`}>{p.hasSystemAccessDefault ? 'check_circle' : 'cancel'}</span></td>
                  <td className="py-3 px-4 text-center"><Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'نشط' : 'معطل'}</Badge></td>
                  {canEdit && <ActionCell onEdit={() => openEditPos(p)} onDelete={() => setDeleteConfirmId(p.id!)} />}
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}

      {/* ── Shifts Tab ── */}
      {tab === 'shifts' && (
        <Card>
          {shifts.length === 0 ? <EmptyState icon="schedule" label="لا يوجد ورديات" sub='اضغط "إضافة وردية" للبدء' /> : (
            <DataTable headers={['الوردية', { label: 'من', center: true }, { label: 'إلى', center: true }, { label: 'استراحة', center: true }, { label: 'سماح تأخير', center: true }, { label: 'الحالة', center: true }]} canEdit={canEdit}>
              {shifts.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-white">{s.name}</td>
                  <td className="py-3 px-4 text-center font-mono">{s.startTime}</td>
                  <td className="py-3 px-4 text-center font-mono">{s.endTime}</td>
                  <td className="py-3 px-4 text-center">{s.breakMinutes} ط¯</td>
                  <td className="py-3 px-4 text-center">{s.lateGraceMinutes} ط¯</td>
                  <td className="py-3 px-4 text-center"><Badge variant={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'نشطة' : 'معطلة'}</Badge></td>
                  {canEdit && <ActionCell onEdit={() => openEditShift(s)} onDelete={() => setDeleteConfirmId(s.id!)} />}
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}

      {/* ── Penalties Tab ── */}
      {tab === 'penalties' && (
        <Card>
          {penalties.length === 0 ? <EmptyState icon="gavel" label="لا يوجد جزاءات" sub='اضغط "إضافة جزاء" لإنشاء قاعدة جزاء' /> : (
            <DataTable headers={['الجزاء', { label: 'النوع', center: true }, { label: 'طريقة الحساب', center: true }, { label: 'القيمة', center: true }, { label: 'الحالة', center: true }]} canEdit={canEdit}>
              {penalties.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-white">{p.name}</td>
                  <td className="py-3 px-4 text-center"><Badge variant={p.type === 'disciplinary' ? 'danger' : p.type === 'absence' ? 'warning' : 'info'}>{PENALTY_TYPE_LABELS[p.type]}</Badge></td>
                  <td className="py-3 px-4 text-center text-sm">{VALUE_TYPE_LABELS[p.valueType]}</td>
                  <td className="py-3 px-4 text-center font-bold">{p.value}{p.valueType === 'percentage' ? '%' : ' ط¬.ظ…'}</td>
                  <td className="py-3 px-4 text-center"><Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'نشط' : 'معطل'}</Badge></td>
                  {canEdit && <ActionCell onEdit={() => openEditPenalty(p)} onDelete={() => setDeleteConfirmId(p.id!)} />}
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}

      {/* ── Late Rules Tab ── */}
      {tab === 'lateRules' && (
        <Card>
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
              قواعد التأخير بتحدد الخصم حسب عدد دقائق التأخير. كل قاعدة بتغطي نطاق معين من الدقائق.
            </p>
          </div>
          {lateRulesList.length === 0 ? <EmptyState icon="timer_off" label="لا يوجد قواعد تأخير" sub='اضغط "إضافة قاعدة" لإنشاء قاعدة تأخير' /> : (
            <DataTable headers={[{ label: 'من (دقيقة)', center: true }, { label: 'إلى (دقيقة)', center: true }, { label: 'طريقة الخصم', center: true }, { label: 'القيمة', center: true }]} canEdit={canEdit}>
              {lateRulesList.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-4 text-center font-mono font-bold">{r.minutesFrom}</td>
                  <td className="py-3 px-4 text-center font-mono font-bold">{r.minutesTo}</td>
                  <td className="py-3 px-4 text-center text-sm">{VALUE_TYPE_LABELS[r.penaltyType]}</td>
                  <td className="py-3 px-4 text-center font-bold text-rose-600">{r.penaltyValue}{r.penaltyType === 'percentage' ? '%' : ' ط¬.ظ…'}</td>
                  {canEdit && <ActionCell onEdit={() => openEditLateRule(r)} onDelete={() => setDeleteConfirmId(r.id!)} />}
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}

      {/* ── Allowances Tab ── */}
      {tab === 'allowances' && (
        <Card>
          {allowances.length === 0 ? <EmptyState icon="card_giftcard" label="لا يوجد بدلات" sub='اضغط "إضافة بدل" لإنشاء نوع بدل' /> : (
            <DataTable headers={['البدل', { label: 'طريقة الحساب', center: true }, { label: 'القيمة', center: true }, { label: 'الحالة', center: true }]} canEdit={canEdit}>
              {allowances.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-800 dark:text-white">{a.name}</td>
                  <td className="py-3 px-4 text-center text-sm">{CALC_TYPE_LABELS[a.calculationType]}</td>
                  <td className="py-3 px-4 text-center font-bold text-emerald-600">{a.value}{a.calculationType === 'percentage' ? '%' : ' ط¬.ظ…'}</td>
                  <td className="py-3 px-4 text-center"><Badge variant={a.isActive ? 'success' : 'neutral'}>{a.isActive ? 'نشط' : 'معطل'}</Badge></td>
                  {canEdit && <ActionCell onEdit={() => openEditAllowance(a)} onDelete={() => setDeleteConfirmId(a.id!)} />}
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}

      {/* ── Create/Edit Modal ── */}
      {showModal && canEdit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); setSaveMsg(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editId ? 'تعديل' : 'إضافة'} {MODAL_LABELS[tab]}</h3>
              <button onClick={() => { setShowModal(false); setSaveMsg(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {saveMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}>
                  <span className="material-icons-round text-base">{saveMsg.type === 'success' ? 'check_circle' : 'error'}</span>
                  <p className="flex-1">{saveMsg.text}</p>
                  <button onClick={() => setSaveMsg(null)} className="text-current/70 hover:text-current transition-colors">
                    <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
              )}

              {tab === 'departments' && (
                <>
                  <Field label="اسم القسم *"><input className={inputClass} value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} placeholder="مثال: قسم التجميع" autoFocus /></Field>
                  <Field label="رمز القسم"><input className={inputClass} value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} placeholder="ASM" /></Field>
                  <Field label="مدير القسم">
                    <select className={selectClass} value={deptForm.managerId} onChange={(e) => setDeptForm({ ...deptForm, managerId: e.target.value })}>
                      <option value="">— بدون مدير —</option>
                      {_rawEmployees.filter((e) => e.isActive !== false).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </Field>
                  <Toggle value={deptForm.isActive} onChange={(v) => setDeptForm({ ...deptForm, isActive: v })} label="نشط" />
                </>
              )}
              {tab === 'positions' && (
                <>
                  <Field label="اسم المنصب *"><input className={inputClass} value={posForm.title} onChange={(e) => setPosForm({ ...posForm, title: e.target.value })} placeholder="مثال: فني تجميع" autoFocus /></Field>
                  <Field label="القسم التابع">
                    <select className={selectClass} value={posForm.departmentId} onChange={(e) => setPosForm({ ...posForm, departmentId: e.target.value })}>
                      <option value="">— كل الأقسام —</option>
                      {departments.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </Field>
                  <Field label="المستوى الوظيفي">
                    <select className={selectClass} value={posForm.level} onChange={(e) => setPosForm({ ...posForm, level: Number(e.target.value) as JobLevel })}>
                      {(Object.entries(JOB_LEVEL_LABELS) as [string, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <div className="flex items-center justify-between">
                    <Toggle value={posForm.hasSystemAccessDefault} onChange={(v) => setPosForm({ ...posForm, hasSystemAccessDefault: v })} label="دخول نظام افتراضي" />
                    <Toggle value={posForm.isActive} onChange={(v) => setPosForm({ ...posForm, isActive: v })} label="نشط" />
                  </div>
                </>
              )}
              {tab === 'shifts' && (
                <>
                  <Field label="اسم الوردية *"><input className={inputClass} value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} placeholder="الوردية الصباحية" autoFocus /></Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="وقت البداية"><input type="time" className={inputClass} value={shiftForm.startTime} onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })} /></Field>
                    <Field label="وقت النهاية"><input type="time" className={inputClass} value={shiftForm.endTime} onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="استراحة (دقيقة)"><input type="number" min={0} className={inputClass} value={shiftForm.breakMinutes} onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: Number(e.target.value) || 0 })} /></Field>
                    <Field label="سماح تأخير (دقيقة)"><input type="number" min={0} className={inputClass} value={shiftForm.lateGraceMinutes} onChange={(e) => setShiftForm({ ...shiftForm, lateGraceMinutes: Number(e.target.value) || 0 })} /></Field>
                  </div>
                  <div className="flex items-center justify-between">
                    <Toggle value={shiftForm.crossesMidnight} onChange={(v) => setShiftForm({ ...shiftForm, crossesMidnight: v })} label="تعبر منتصف الليل" color="bg-amber-500" />
                    <Toggle value={shiftForm.isActive} onChange={(v) => setShiftForm({ ...shiftForm, isActive: v })} label="نشطة" />
                  </div>
                </>
              )}
              {tab === 'penalties' && (
                <>
                  <Field label="اسم الجزاء *"><input className={inputClass} value={penaltyForm.name} onChange={(e) => setPenaltyForm({ ...penaltyForm, name: e.target.value })} placeholder="مثال: جزاء غياب بدون إذن" autoFocus /></Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="نوع الجزاء">
                      <select className={selectClass} value={penaltyForm.type} onChange={(e) => setPenaltyForm({ ...penaltyForm, type: e.target.value as PenaltyType })}>
                        {Object.entries(PENALTY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </Field>
                    <Field label="طريقة الحساب">
                      <select className={selectClass} value={penaltyForm.valueType} onChange={(e) => setPenaltyForm({ ...penaltyForm, valueType: e.target.value as ValueType })}>
                        {Object.entries(VALUE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label={penaltyForm.valueType === 'percentage' ? 'النسبة (%)' : 'المبلغ (ج.م)'}>
                    <input type="number" min={0} step={penaltyForm.valueType === 'percentage' ? 0.5 : 1} className={inputClass}
                      value={penaltyForm.value} onChange={(e) => setPenaltyForm({ ...penaltyForm, value: Number(e.target.value) || 0 })} />
                  </Field>
                  <Toggle value={penaltyForm.isActive} onChange={(v) => setPenaltyForm({ ...penaltyForm, isActive: v })} label="نشط" />
                </>
              )}
              {tab === 'lateRules' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="من (دقيقة)"><input type="number" min={0} className={inputClass} value={lateRuleForm.minutesFrom} onChange={(e) => setLateRuleForm({ ...lateRuleForm, minutesFrom: Number(e.target.value) || 0 })} autoFocus /></Field>
                    <Field label="إلى (دقيقة)"><input type="number" min={1} className={inputClass} value={lateRuleForm.minutesTo} onChange={(e) => setLateRuleForm({ ...lateRuleForm, minutesTo: Number(e.target.value) || 0 })} /></Field>
                  </div>
                  <Field label="طريقة الخصم">
                    <select className={selectClass} value={lateRuleForm.penaltyType} onChange={(e) => setLateRuleForm({ ...lateRuleForm, penaltyType: e.target.value as ValueType })}>
                      {Object.entries(VALUE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label={lateRuleForm.penaltyType === 'percentage' ? 'النسبة (%)' : 'المبلغ (ج.م)'}>
                    <input type="number" min={0} step={lateRuleForm.penaltyType === 'percentage' ? 0.5 : 1} className={inputClass}
                      value={lateRuleForm.penaltyValue} onChange={(e) => setLateRuleForm({ ...lateRuleForm, penaltyValue: Number(e.target.value) || 0 })} />
                  </Field>
                  <p className="text-xs text-slate-400">مثال: من 16 إلى 30 دقيقة → خصم 50 ج.م</p>
                </>
              )}
              {tab === 'allowances' && (
                <>
                  <Field label="اسم البدل *"><input className={inputClass} value={allowanceForm.name} onChange={(e) => setAllowanceForm({ ...allowanceForm, name: e.target.value })} placeholder="مثال: بدل مواصلات" autoFocus /></Field>
                  <Field label="طريقة الحساب">
                    <select className={selectClass} value={allowanceForm.calculationType} onChange={(e) => setAllowanceForm({ ...allowanceForm, calculationType: e.target.value as CalculationType })}>
                      {Object.entries(CALC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label={allowanceForm.calculationType === 'percentage' ? 'النسبة من الراتب (%)' : 'المبلغ (ج.م)'}>
                    <input type="number" min={0} step={allowanceForm.calculationType === 'percentage' ? 0.5 : 1} className={inputClass}
                      value={allowanceForm.value} onChange={(e) => setAllowanceForm({ ...allowanceForm, value: Number(e.target.value) || 0 })} />
                  </Field>
                  <Toggle value={allowanceForm.isActive} onChange={(v) => setAllowanceForm({ ...allowanceForm, isActive: v })} label="نشط" />
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowModal(false); setSaveMsg(null); }}>إلغاء</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                {editId ? 'حفظ التعديلات' : 'إضافة'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-3xl text-rose-500">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف هذا العنصر؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <Button variant="danger" onClick={handleDelete}>حذف</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Shared Sub-components ──────────────────────────────────────────────────

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-2">
    <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">{label}</label>
    {children}
  </div>
);

const EmptyState: React.FC<{ icon: string; label: string; sub: string }> = ({ icon, label, sub }) => (
  <div className="text-center py-12">
    <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600">{icon}</span>
    <p className="text-slate-500 font-bold mt-3">{label}</p>
    <p className="text-xs text-slate-400 mt-1">{sub}</p>
  </div>
);

const ActionCell: React.FC<{ onEdit: () => void; onDelete: () => void }> = ({ onEdit, onDelete }) => (
  <td className="py-3 px-4 text-center">
    <div className="flex items-center justify-center gap-1">
      <button onClick={onEdit} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-primary">
        <span className="material-icons-round text-lg">edit</span>
      </button>
      <button onClick={onDelete} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors text-slate-400 hover:text-rose-500">
        <span className="material-icons-round text-lg">delete</span>
      </button>
    </div>
  </td>
);

const DataTable: React.FC<{
  headers: (string | { label: string; center?: boolean })[];
  canEdit: boolean;
  children: React.ReactNode;
}> = ({ headers, canEdit, children }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
          {headers.map((h, i) => {
            const label = typeof h === 'string' ? h : h.label;
            const center = typeof h === 'object' && h.center;
            return <th key={i} className={`py-3 px-4 font-bold ${center ? 'text-center' : 'text-right'}`}>{label}</th>;
          })}
          {canEdit && <th className="text-center py-3 px-4 font-bold">إجراءات</th>}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

