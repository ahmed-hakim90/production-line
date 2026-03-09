import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  departmentsRef, jobPositionsRef, shiftsRef,
  penaltyRulesRef, lateRulesRef, allowanceTypesRef,
  HR_COLLECTIONS,
} from '../collections';
import type {
  FirestoreDepartment, FirestoreJobPosition, FirestoreShift,
  FirestorePenaltyRule, FirestoreLateRule, FirestoreAllowanceType,
  PenaltyType, ValueType, CalculationType,
} from '../types';
import { JOB_LEVEL_LABELS } from '../types';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';

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

export const Organization: React.FC = () => {
  const { can } = usePermission();
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const { openModal } = useGlobalModalManager();
  const canEdit = can('hrSettings.edit');

  const [tab, setTab] = useState<OrgTab>('departments');
  const [loading, setLoading] = useState(true);

  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [positions, setPositions] = useState<FirestoreJobPosition[]>([]);
  const [shifts, setShifts] = useState<FirestoreShift[]>([]);
  const [penalties, setPenalties] = useState<FirestorePenaltyRule[]>([]);
  const [lateRulesList, setLateRulesList] = useState<FirestoreLateRule[]>([]);
  const [allowances, setAllowances] = useState<FirestoreAllowanceType[]>([]);

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
    openModal(MODAL_KEYS.ORGANIZATION_CREATE, {
      tab,
      mode: 'create',
      departments,
      employees: _rawEmployees,
      onSaved: loadData,
    });
  };

  const openEditDept = (d: FirestoreDepartment) => openModal(MODAL_KEYS.ORGANIZATION_CREATE, { tab: 'departments', mode: 'edit', item: d, departments, employees: _rawEmployees, onSaved: loadData });
  const openEditPos = (p: FirestoreJobPosition) => openModal(MODAL_KEYS.ORGANIZATION_CREATE, { tab: 'positions', mode: 'edit', item: p, departments, employees: _rawEmployees, onSaved: loadData });
  const openEditShift = (s: FirestoreShift) => openModal(MODAL_KEYS.ORGANIZATION_CREATE, { tab: 'shifts', mode: 'edit', item: s, departments, employees: _rawEmployees, onSaved: loadData });
  const openEditPenalty = (p: FirestorePenaltyRule) => openModal(MODAL_KEYS.ORGANIZATION_CREATE, { tab: 'penalties', mode: 'edit', item: p, departments, employees: _rawEmployees, onSaved: loadData });
  const openEditLateRule = (r: FirestoreLateRule) => openModal(MODAL_KEYS.ORGANIZATION_CREATE, { tab: 'lateRules', mode: 'edit', item: r, departments, employees: _rawEmployees, onSaved: loadData });
  const openEditAllowance = (a: FirestoreAllowanceType) => openModal(MODAL_KEYS.ORGANIZATION_CREATE, { tab: 'allowances', mode: 'edit', item: a, departments, employees: _rawEmployees, onSaved: loadData });

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
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 bg-slate-200 rounded-[var(--border-radius-lg)] animate-pulse w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-200 rounded-[var(--border-radius-lg)] animate-pulse" />)}
        </div>
        <div className="h-64 bg-slate-200 rounded-[var(--border-radius-lg)] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">الهيكل التنظيمي</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">إدارة الأقسام والمناصب والورديات والجزاءات والبدلات</p>
        </div>
        {canEdit && (
          <Button variant="primary" onClick={openCreate} data-modal-key={MODAL_KEYS.ORGANIZATION_CREATE}>
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
          <div key={s.label} className="bg-[var(--color-card)] p-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] flex items-center gap-3">
            <div className={`w-10 h-10 ${s.color} rounded-[var(--border-radius-base)] flex items-center justify-center`}>
              <span className="material-icons-round text-xl">{s.icon}</span>
            </div>
            <div>
              <p className="text-[10px] text-[var(--color-text-muted)] font-medium">{s.label}</p>
              <p className="text-lg font-black">{s.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#f0f2f5] rounded-[var(--border-radius-lg)] p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-[var(--border-radius-base)] text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
              tab === t.key ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-[var(--color-text)] dark:hover:text-[var(--color-text-muted)]'
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
                <tr key={d.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors">
                  <td className="py-3 px-4 font-bold text-[var(--color-text)]">{d.name}</td>
                  <td className="py-3 px-4"><span className="bg-[#f0f2f5] text-[var(--color-text-muted)] px-2 py-0.5 rounded text-xs font-mono">{d.code}</span></td>
                  <td className="py-3 px-4 text-[var(--color-text-muted)]">{d.managerId ? getManagerName(d.managerId) : '—'}</td>
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
                <tr key={p.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors">
                  <td className="py-3 px-4 font-bold text-[var(--color-text)]">{p.title}</td>
                  <td className="py-3 px-4 text-[var(--color-text-muted)]">{getDeptName(p.departmentId)}</td>
                  <td className="py-3 px-4 text-center"><span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-bold">{JOB_LEVEL_LABELS[p.level]}</span></td>
                  <td className="py-3 px-4 text-center"><span className={`material-icons-round text-lg ${p.hasSystemAccessDefault ? 'text-emerald-500' : 'text-[var(--color-text-muted)]'}`}>{p.hasSystemAccessDefault ? 'check_circle' : 'cancel'}</span></td>
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
                <tr key={s.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors">
                  <td className="py-3 px-4 font-bold text-[var(--color-text)]">{s.name}</td>
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
                <tr key={p.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors">
                  <td className="py-3 px-4 font-bold text-[var(--color-text)]">{p.name}</td>
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
          <div className="mb-4 p-3 rounded-[var(--border-radius-base)] bg-amber-50 border border-amber-200">
            <p className="text-xs font-bold text-amber-700">
              قواعد التأخير بتحدد الخصم حسب عدد دقائق التأخير. كل قاعدة بتغطي نطاق معين من الدقائق.
            </p>
          </div>
          {lateRulesList.length === 0 ? <EmptyState icon="timer_off" label="لا يوجد قواعد تأخير" sub='اضغط "إضافة قاعدة" لإنشاء قاعدة تأخير' /> : (
            <DataTable headers={[{ label: 'من (دقيقة)', center: true }, { label: 'إلى (دقيقة)', center: true }, { label: 'طريقة الخصم', center: true }, { label: 'القيمة', center: true }]} canEdit={canEdit}>
              {lateRulesList.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors">
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
                <tr key={a.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors">
                  <td className="py-3 px-4 font-bold text-[var(--color-text)]">{a.name}</td>
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

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-3xl text-rose-500">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف هذا العنصر؟ لا يمكن التراجع عن هذا الإجراء.</p>
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

const EmptyState: React.FC<{ icon: string; label: string; sub: string }> = ({ icon, label, sub }) => (
  <div className="text-center py-12">
    <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-slate-600">{icon}</span>
    <p className="text-[var(--color-text-muted)] font-bold mt-3">{label}</p>
    <p className="text-xs text-[var(--color-text-muted)] mt-1">{sub}</p>
  </div>
);

const ActionCell: React.FC<{ onEdit: () => void; onDelete: () => void }> = ({ onEdit, onDelete }) => (
  <td className="py-3 px-4 text-center">
    <div className="flex items-center justify-center gap-1">
      <button onClick={onEdit} className="p-1.5 hover:bg-[#f0f2f5] rounded-[var(--border-radius-base)] transition-colors text-[var(--color-text-muted)] hover:text-primary">
        <span className="material-icons-round text-lg">edit</span>
      </button>
      <button onClick={onDelete} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-[var(--border-radius-base)] transition-colors text-[var(--color-text-muted)] hover:text-rose-500">
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
      <thead className="erp-thead">
        <tr>
          {headers.map((h, i) => {
            const label = typeof h === 'string' ? h : h.label;
            const center = typeof h === 'object' && h.center;
            return <th key={i} className={`erp-th ${center ? "text-center" : ""}`}>{label}</th>;
          })}
          {canEdit && <th className="erp-th text-center">إجراءات</th>}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

