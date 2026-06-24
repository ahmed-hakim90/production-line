import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
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
import type { FirestoreEmployee } from '../../../types';
import { JOB_LEVEL_LABELS } from '../types';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { buildDepartmentPositionHierarchy, getDirectReportCounts, wouldCreateManagerCycle } from '../utils/organizationHierarchy';

type OrgTab = 'departments' | 'positions' | 'employees' | 'shifts' | 'penalties' | 'lateRules' | 'allowances';

type EmployeeHierarchyForm = {
  departmentId: string;
  jobPositionId: string;
  managerId: string;
  level: number;
};

const TABS: { key: OrgTab; label: string; icon: string }[] = [
  { key: 'departments', label: 'الأقسام', icon: 'business' },
  { key: 'positions', label: 'المناصب', icon: 'work' },
  { key: 'employees', label: 'التسلسل الوظيفي', icon: 'account_tree' },
  { key: 'shifts', label: 'الورديات', icon: 'schedule' },
  { key: 'penalties', label: 'الجزاءات', icon: 'gavel' },
  { key: 'lateRules', label: 'قواعد التأخير', icon: 'timer_off' },
  { key: 'allowances', label: 'البدلات', icon: 'card_giftcard' },
];

const PENALTY_TYPE_LABELS: Record<PenaltyType, string> = { late: 'تأخير', absence: 'غياب', disciplinary: 'تأديبي' };
const VALUE_TYPE_LABELS: Record<ValueType, string> = { fixed: 'مبلغ ثابت', percentage: 'نسبة مئوية' };
const CALC_TYPE_LABELS: Record<CalculationType, string> = { fixed: 'مبلغ ثابت', percentage: 'نسبة من الراتب' };

const getPositionClassification = (level?: number) => {
  if ((level ?? 1) >= 4) return 'إدارة عليا';
  if ((level ?? 1) >= 3) return 'إداري';
  if ((level ?? 1) >= 2) return 'إشرافي';
  return 'تشغيلي';
};

export const Organization: React.FC = () => {
  const { can } = usePermission();
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const updateEmployee = useAppStore((s) => s.updateEmployee);
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
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [employeeForm, setEmployeeForm] = useState<EmployeeHierarchyForm>({ departmentId: '', jobPositionId: '', managerId: '', level: 1 });
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [employeeSaveMsg, setEmployeeSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
  const getPositionTitle = (id: string) => positions.find((p) => p.id === id)?.title ?? '—';

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

  const activeDepartments = useMemo(() => departments.filter((d) => d.isActive), [departments]);
  const activePositions = useMemo(() => positions.filter((p) => p.isActive), [positions]);
  const activeEmployees = useMemo(
    () => [..._rawEmployees].filter((e) => e.id && e.isActive !== false).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [_rawEmployees],
  );
  const departmentPositionHierarchy = useMemo(
    () => buildDepartmentPositionHierarchy(activeDepartments, activePositions, activeEmployees),
    [activeDepartments, activePositions, activeEmployees],
  );
  const selectedEmployee = useMemo(
    () => _rawEmployees.find((e) => e.id === selectedEmployeeId) ?? null,
    [_rawEmployees, selectedEmployeeId],
  );
  const directReportCounts = useMemo(() => getDirectReportCounts(_rawEmployees), [_rawEmployees]);
  const employeeHierarchySummary = useMemo(() => {
    const active = _rawEmployees.filter((e) => e.isActive !== false);
    return {
      withoutDepartment: active.filter((e) => !e.departmentId).length,
      withoutPosition: active.filter((e) => !e.jobPositionId).length,
      withoutManager: active.filter((e) => !e.managerId && (e.level ?? 1) < 4).length,
      departmentsWithoutManager: departments.filter((d) => d.isActive && !d.managerId).length,
    };
  }, [_rawEmployees, departments]);
  const filteredDepartmentPositionHierarchy = useMemo(() => {
    const term = employeeSearch.trim().toLowerCase();
    if (!term) return departmentPositionHierarchy;

    return departmentPositionHierarchy
      .map((group) => {
        const departmentMatches = [
          group.department.name,
          group.department.code,
          getManagerName(group.managerId),
        ].some((value) => String(value || '').toLowerCase().includes(term));

        const positionsForDisplay = group.positions
          .map((positionGroup) => {
            const positionMatches = [
              positionGroup.position.title,
              JOB_LEVEL_LABELS[positionGroup.position.level],
              getPositionClassification(positionGroup.position.level),
            ].some((value) => String(value || '').toLowerCase().includes(term));
            const employeesForDisplay = departmentMatches || positionMatches
              ? positionGroup.employees
              : positionGroup.employees.filter((employee) =>
                [employee.name, employee.code, getManagerName(employee.managerId || '')]
                  .some((value) => String(value || '').toLowerCase().includes(term)),
              );

            return positionMatches || employeesForDisplay.length > 0
              ? { ...positionGroup, employees: employeesForDisplay }
              : null;
          })
          .filter((positionGroup): positionGroup is NonNullable<typeof positionGroup> => Boolean(positionGroup));

        const employeesWithoutPosition = departmentMatches
          ? group.employeesWithoutPosition
          : group.employeesWithoutPosition.filter((employee) =>
            [employee.name, employee.code, getManagerName(employee.managerId || '')]
              .some((value) => String(value || '').toLowerCase().includes(term)),
          );

        if (!departmentMatches && positionsForDisplay.length === 0 && employeesWithoutPosition.length === 0) return null;
        return {
          ...group,
          positions: departmentMatches ? group.positions : positionsForDisplay,
          employeesWithoutPosition,
        };
      })
      .filter((group): group is NonNullable<typeof group> => Boolean(group));
  }, [departmentPositionHierarchy, employeeSearch, getManagerName]);
  const positionOptionsForEmployee = useMemo(
    () => activePositions.filter((p) => !employeeForm.departmentId || p.departmentId === employeeForm.departmentId),
    [activePositions, employeeForm.departmentId],
  );
  const managerOptionsForEmployee = useMemo(() => {
    if (!selectedEmployeeId) return [];
    return activeEmployees.filter((employee) => {
      if (!employee.id || employee.id === selectedEmployeeId) return false;
      if (wouldCreateManagerCycle(_rawEmployees, selectedEmployeeId, employee.id)) return false;
      return (employee.level ?? 1) > (employeeForm.level ?? selectedEmployee?.level ?? 1);
    });
  }, [activeEmployees, _rawEmployees, selectedEmployeeId, employeeForm.level, selectedEmployee?.level]);
  const selectedPosition = useMemo(
    () => positions.find((p) => p.id === employeeForm.jobPositionId),
    [positions, employeeForm.jobPositionId],
  );
  const employeeValidationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!selectedEmployeeId) errors.push('اختر موظفًا لتعديل تسلسله');
    if (!employeeForm.departmentId) errors.push('القسم مطلوب');
    if (employeeForm.jobPositionId && selectedPosition && selectedPosition.departmentId !== employeeForm.departmentId) {
      errors.push('المنصب المختار لا يتبع القسم المحدد');
    }
    if (employeeForm.managerId && wouldCreateManagerCycle(_rawEmployees, selectedEmployeeId, employeeForm.managerId)) {
      errors.push('لا يمكن اختيار مدير يؤدي إلى حلقة في التسلسل الوظيفي');
    }
    return errors;
  }, [employeeForm.departmentId, employeeForm.jobPositionId, employeeForm.managerId, _rawEmployees, selectedEmployeeId, selectedPosition]);

  useEffect(() => {
    if (selectedEmployeeId || activeEmployees.length === 0) return;
    setSelectedEmployeeId(activeEmployees[0].id || '');
  }, [activeEmployees, selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployee) return;
    setEmployeeForm({
      departmentId: selectedEmployee.departmentId || '',
      jobPositionId: selectedEmployee.jobPositionId || '',
      managerId: selectedEmployee.managerId || '',
      level: selectedEmployee.level || 1,
    });
    setEmployeeSaveMsg(null);
  }, [selectedEmployee]);

  const selectEmployee = (employee: FirestoreEmployee) => {
    if (!employee.id) return;
    setSelectedEmployeeId(employee.id);
  };

  const openCreate = () => {
    if (tab === 'employees') return;
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
    const map: Record<Exclude<OrgTab, 'employees'>, string> = {
      departments: HR_COLLECTIONS.DEPARTMENTS,
      positions: HR_COLLECTIONS.JOB_POSITIONS,
      shifts: HR_COLLECTIONS.SHIFTS,
      penalties: HR_COLLECTIONS.PENALTY_RULES,
      lateRules: HR_COLLECTIONS.LATE_RULES,
      allowances: HR_COLLECTIONS.ALLOWANCE_TYPES,
    };
    return map[tab as Exclude<OrgTab, 'employees'>];
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
    departments: 'إضافة قسم', positions: 'إضافة منصب', employees: 'تعديل من صفحة الموظفين', shifts: 'إضافة وردية',
    penalties: 'إضافة جزاء', lateRules: 'إضافة قاعدة', allowances: 'إضافة بدل',
  };

  const updateEmployeeDepartment = (departmentId: string) => {
    const nextPositionId = positions.find((p) => p.id === employeeForm.jobPositionId)?.departmentId === departmentId
      ? employeeForm.jobPositionId
      : '';
    setEmployeeForm((prev) => ({ ...prev, departmentId, jobPositionId: nextPositionId }));
  };

  const updateEmployeePosition = (jobPositionId: string) => {
    const position = positions.find((p) => p.id === jobPositionId);
    setEmployeeForm((prev) => ({
      ...prev,
      jobPositionId,
      level: position?.level ?? prev.level,
    }));
  };

  const saveEmployeeHierarchy = async () => {
    if (!selectedEmployee?.id || employeeValidationErrors.length > 0) return;
    setSavingEmployee(true);
    setEmployeeSaveMsg(null);
    try {
      await updateEmployee(selectedEmployee.id, {
        departmentId: employeeForm.departmentId,
        jobPositionId: employeeForm.jobPositionId,
        managerId: employeeForm.managerId,
        level: employeeForm.level,
      });
      setEmployeeSaveMsg({ type: 'success', text: 'تم حفظ التسلسل الوظيفي للموظف' });
    } catch (e) {
      console.error('Organization saveEmployeeHierarchy error:', e);
      setEmployeeSaveMsg({ type: 'error', text: 'تعذر حفظ التسلسل الوظيفي. تحقق من الصلاحيات وحاول مرة أخرى.' });
    } finally {
      setSavingEmployee(false);
    }
  };

  if (loading) {
    return <PageContentSkeleton variant="list" showFilters tableRows={6} />;
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
          <Button variant="primary" onClick={openCreate} data-modal-key={MODAL_KEYS.ORGANIZATION_CREATE} disabled={tab === 'employees'}>
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
          { label: 'موظفون بلا مدير', count: employeeHierarchySummary.withoutManager, icon: 'account_tree', color: 'text-orange-500 bg-orange-500/10' },
          { label: 'الورديات', count: shifts.filter((s) => s.isActive).length, icon: 'schedule', color: 'text-violet-500 bg-violet-500/10' },
          { label: 'الجزاءات', count: penalties.filter((p) => p.isActive).length, icon: 'gavel', color: 'text-rose-500 bg-rose-500/10' },
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
                  <td className="py-3 px-4 text-center"><Badge variant={d.isActive ? 'success' : 'neutral'}>{d.isActive ? 'نشط' : 'غير نشط'}</Badge></td>
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
            <DataTable headers={['المنصب', 'القسم', { label: 'المستوى', center: true }, { label: 'دخول النظام', center: true }, { label: 'الحالة', center: true }]} canEdit={canEdit}>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors">
                  <td className="py-3 px-4 font-bold text-[var(--color-text)]">{p.title}</td>
                  <td className="py-3 px-4 text-[var(--color-text-muted)]">{getDeptName(p.departmentId)}</td>
                  <td className="py-3 px-4 text-center"><span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-bold">{JOB_LEVEL_LABELS[p.level]}</span></td>
                  <td className="py-3 px-4 text-center"><span className={`material-icons-round text-lg ${p.hasSystemAccessDefault ? 'text-emerald-500' : 'text-[var(--color-text-muted)]'}`}>{p.hasSystemAccessDefault ? 'check_circle' : 'cancel'}</span></td>
                  <td className="py-3 px-4 text-center"><Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'نشط' : 'غير نشط'}</Badge></td>
                  {canEdit && <ActionCell onEdit={() => openEditPos(p)} onDelete={() => setDeleteConfirmId(p.id!)} />}
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      )}

      {/* ── Employee Hierarchy Tab ── */}
      {tab === 'employees' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <HealthCard label="بلا قسم" count={employeeHierarchySummary.withoutDepartment} icon="business" tone="amber" />
            <HealthCard label="بلا منصب" count={employeeHierarchySummary.withoutPosition} icon="work_off" tone="rose" />
            <HealthCard label="بلا مدير" count={employeeHierarchySummary.withoutManager} icon="account_tree" tone="orange" />
            <HealthCard label="أقسام بلا مدير" count={employeeHierarchySummary.departmentsWithoutManager} icon="manage_accounts" tone="blue" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-4">
            <Card>
              <div className="space-y-3">
                <div>
                  <h2 className="font-black text-[var(--color-text)]">الأقسام والمناصب</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">استعرض كل قسم، مديره، المناصب التابعة له، والموظفين المعينين على كل منصب.</p>
                </div>
                <input
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="بحث بالقسم أو المنصب أو الموظف..."
                  className="w-full px-3 py-2.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[#f8f9fa] text-sm outline-none focus:border-primary"
                />
                <div className="max-h-[620px] overflow-y-auto space-y-3 pe-1">
                  {filteredDepartmentPositionHierarchy.length === 0 ? (
                    <EmptyState icon="account_tree" label="لا توجد نتائج" sub="غيّر كلمات البحث أو أضف أقسامًا ومناصب من الإعدادات" />
                  ) : filteredDepartmentPositionHierarchy.map((group) => (
                    <section key={group.department.id} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
                      <div className="p-3 bg-[#f8f9fa] border-b border-[var(--color-border)]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-black text-sm text-[var(--color-text)] truncate">{group.department.name}</h3>
                            <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate">مدير القسم: {group.managerId ? getManagerName(group.managerId) : 'غير محدد'}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={group.managerId ? 'info' : 'warning'}>{group.employeeCount} موظف</Badge>
                            {canEdit && (
                              <button type="button" onClick={() => openEditDept(group.department)} className="p-1.5 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] hover:text-primary hover:bg-white">
                                <span className="material-icons-round text-lg">edit</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-3 space-y-3">
                        {group.positions.length === 0 && group.employeesWithoutPosition.length === 0 ? (
                          <p className="text-xs text-[var(--color-text-muted)] text-center py-3">لا توجد مناصب أو موظفون في هذا القسم بعد.</p>
                        ) : group.positions.map(({ position, employees }) => (
                          <div key={position.id} className="rounded-[var(--border-radius-base)] border border-[var(--color-border)] p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-bold text-sm text-[var(--color-text)] truncate">{position.title}</p>
                                <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                                  المستوى: {JOB_LEVEL_LABELS[position.level]} · التصنيف: {getPositionClassification(position.level)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant={position.level >= 3 ? 'info' : 'neutral'}>{employees.length} موظف</Badge>
                                {canEdit && (
                                  <button type="button" onClick={() => openEditPos(position)} className="p-1.5 rounded-[var(--border-radius-base)] text-[var(--color-text-muted)] hover:text-primary hover:bg-[#f8f9fa]">
                                    <span className="material-icons-round text-lg">edit</span>
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {employees.length === 0 ? (
                                <span className="text-[11px] text-[var(--color-text-muted)]">لا يوجد موظفون على هذا المنصب</span>
                              ) : employees.map((employee) => (
                                <button
                                  key={employee.id}
                                  type="button"
                                  onClick={() => selectEmployee(employee)}
                                  className={`px-2.5 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${
                                    selectedEmployeeId === employee.id ? 'border-primary bg-primary/10 text-primary' : 'border-[var(--color-border)] text-[var(--color-text)] hover:bg-[#f8f9fa]'
                                  }`}
                                >
                                  {employee.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}

                        {group.employeesWithoutPosition.length > 0 && (
                          <div className="rounded-[var(--border-radius-base)] border border-amber-200 bg-amber-50 p-3">
                            <p className="font-bold text-sm text-amber-800">موظفون بلا منصب داخل القسم</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {group.employeesWithoutPosition.map((employee) => (
                                <button
                                  key={employee.id}
                                  type="button"
                                  onClick={() => selectEmployee(employee)}
                                  className={`px-2.5 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${
                                    selectedEmployeeId === employee.id ? 'border-primary bg-primary/10 text-primary' : 'border-amber-200 bg-white text-amber-800 hover:bg-amber-100'
                                  }`}
                                >
                                  {employee.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              {!selectedEmployee ? (
                <EmptyState icon="account_tree" label="اختر موظفًا" sub="سيظهر نموذج تعديل التسلسل الوظيفي هنا" />
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black text-[var(--color-text)]">{selectedEmployee.name}</h2>
                      <p className="text-sm text-[var(--color-text-muted)] mt-1">الكود: {selectedEmployee.code || '—'} · التقارير المباشرة: {directReportCounts[selectedEmployee.id!] || 0}</p>
                    </div>
                    <Badge variant={selectedEmployee.isActive !== false ? 'success' : 'neutral'}>{selectedEmployee.isActive !== false ? 'نشط' : 'غير نشط'}</Badge>
                  </div>

                  <div className="rounded-[var(--border-radius-lg)] border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                    يتم تحديد الوظيفة من القسم والمنصب والمستوى الوظيفي هنا. الصلاحيات تظل بوابات اعتماد فقط ولا تغير مكان الموظف في التسلسل.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="القسم">
                      <select
                        value={employeeForm.departmentId}
                        onChange={(e) => updateEmployeeDepartment(e.target.value)}
                        disabled={!canEdit || savingEmployee}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium bg-[var(--color-card)]"
                      >
                        <option value="">اختر القسم</option>
                        {activeDepartments.map((department) => (
                          <option key={department.id} value={department.id}>{department.name}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="المنصب / المسمى الوظيفي">
                      <select
                        value={employeeForm.jobPositionId}
                        onChange={(e) => updateEmployeePosition(e.target.value)}
                        disabled={!canEdit || savingEmployee}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium bg-[var(--color-card)]"
                      >
                        <option value="">بدون منصب</option>
                        {positionOptionsForEmployee.map((position) => (
                          <option key={position.id} value={position.id}>{position.title} - {JOB_LEVEL_LABELS[position.level]}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="المستوى الوظيفي">
                      <select
                        value={employeeForm.level}
                        onChange={(e) => setEmployeeForm((prev) => ({ ...prev, level: Number(e.target.value) }))}
                        disabled={!canEdit || savingEmployee || Boolean(employeeForm.jobPositionId)}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium bg-[var(--color-card)] disabled:opacity-60"
                      >
                        {Object.entries(JOB_LEVEL_LABELS).map(([level, label]) => (
                          <option key={level} value={level}>{label}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="المدير المباشر">
                      <select
                        value={employeeForm.managerId}
                        onChange={(e) => setEmployeeForm((prev) => ({ ...prev, managerId: e.target.value }))}
                        disabled={!canEdit || savingEmployee}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium bg-[var(--color-card)]"
                      >
                        <option value="">بدون مدير مباشر</option>
                        {managerOptionsForEmployee.map((manager) => (
                          <option key={manager.id} value={manager.id}>{manager.name} - {getPositionTitle(manager.jobPositionId)}</option>
                        ))}
                      </select>
                    </FormField>
                  </div>

                  {employeeValidationErrors.length > 0 && (
                    <div className="rounded-[var(--border-radius-lg)] border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700 space-y-1">
                      {employeeValidationErrors.map((error) => <p key={error}>{error}</p>)}
                    </div>
                  )}

                  {employeeSaveMsg && (
                    <div className={`rounded-[var(--border-radius-lg)] border p-3 text-sm font-bold ${
                      employeeSaveMsg.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}>
                      {employeeSaveMsg.text}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3">
                    <Button variant="primary" onClick={saveEmployeeHierarchy} disabled={!canEdit || savingEmployee || employeeValidationErrors.length > 0}>
                      {savingEmployee ? 'جاري الحفظ...' : 'حفظ التسلسل الوظيفي'}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
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
                  <td className="py-3 px-4 text-center">{s.breakMinutes} د</td>
                  <td className="py-3 px-4 text-center">{s.lateGraceMinutes} د</td>
                  <td className="py-3 px-4 text-center"><Badge variant={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'نشط' : 'غير نشطة'}</Badge></td>
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
                  <td className="py-3 px-4 text-center font-bold">{p.value}{p.valueType === 'percentage' ? '%' : ' ج.م'}</td>
                  <td className="py-3 px-4 text-center"><Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'نشط' : 'غير نشط'}</Badge></td>
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
              قواعد التأخير بتحدد الخصم حسب عدد دقائق التأخير. كل قاعدة تغطي نطاقاً معيناً من الدقائق.
            </p>
          </div>
          {lateRulesList.length === 0 ? <EmptyState icon="timer_off" label="لا يوجد قواعد تأخير" sub='اضغط "إضافة قاعدة" لإنشاء قاعدة تأخير' /> : (
            <DataTable headers={[{ label: 'من (دقيقة)', center: true }, { label: 'إلى (دقيقة)', center: true }, { label: 'طريقة الخصم', center: true }, { label: 'القيمة', center: true }]} canEdit={canEdit}>
              {lateRulesList.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors">
                  <td className="py-3 px-4 text-center font-mono font-bold">{r.minutesFrom}</td>
                  <td className="py-3 px-4 text-center font-mono font-bold">{r.minutesTo}</td>
                  <td className="py-3 px-4 text-center text-sm">{VALUE_TYPE_LABELS[r.penaltyType]}</td>
                  <td className="py-3 px-4 text-center font-bold text-rose-600">{r.penaltyValue}{r.penaltyType === 'percentage' ? '%' : ' ج.م'}</td>
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
                  <td className="py-3 px-4 text-center font-bold text-emerald-600">{a.value}{a.calculationType === 'percentage' ? '%' : ' ج.م'}</td>
                  <td className="py-3 px-4 text-center"><Badge variant={a.isActive ? 'success' : 'neutral'}>{a.isActive ? 'نشط' : 'غير نشط'}</Badge></td>
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

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-2">
    <label className="block text-sm font-bold text-[var(--color-text)]">{label}</label>
    {children}
  </div>
);

const HealthCard: React.FC<{ label: string; count: number; icon: string; tone: 'amber' | 'rose' | 'orange' | 'blue' }> = ({ label, count, icon, tone }) => {
  const toneClass = {
    amber: 'text-amber-600 bg-amber-500/10',
    rose: 'text-rose-600 bg-rose-500/10',
    orange: 'text-orange-600 bg-orange-500/10',
    blue: 'text-blue-600 bg-blue-500/10',
  }[tone];

  return (
    <div className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] flex items-center gap-3">
      <div className={`w-11 h-11 ${toneClass} rounded-[var(--border-radius-base)] flex items-center justify-center`}>
        <span className="material-icons-round text-xl">{icon}</span>
      </div>
      <div>
        <p className="text-xs text-[var(--color-text-muted)] font-bold">{label}</p>
        <p className="text-2xl font-black">{count}</p>
      </div>
    </div>
  );
};

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
    <table className="erp-table w-full text-sm">
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

