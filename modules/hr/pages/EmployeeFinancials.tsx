import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Badge, SearchableSelect } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { getDocs } from 'firebase/firestore';
import { employeeService } from '../employeeService';
import { employeeAllowanceService, employeeDeductionService } from '../employeeFinancialsService';
import { loanService } from '../loanService';
import { leaveRequestService, leaveBalanceService } from '../leaveService';
import { allowanceTypesRef } from '../collections';
import { exportHRData } from '@/utils/exportExcel';
import { formatCurrency } from '@/utils/calculations';
import type { FirestoreEmployee } from '@/types';
import type {
  FirestoreEmployeeAllowance,
  FirestoreEmployeeDeduction,
  FirestoreAllowanceType,
  FirestoreEmployeeLoan,
  FirestoreLeaveRequest,
  DeductionCategory,
  LeaveType,
} from '../types';
import { LEAVE_TYPE_LABELS } from '../types';

type ActiveTab = 'allowances' | 'deductions' | 'loans' | 'leaves' | 'penalties';

const TAB_CONFIG: { key: ActiveTab; label: string; icon: string }[] = [
  { key: 'allowances', label: 'البدلات', icon: 'card_giftcard' },
  { key: 'deductions', label: 'الاستقطاعات', icon: 'remove_circle' },
  { key: 'loans', label: 'السُلف', icon: 'payments' },
  { key: 'leaves', label: 'الإجازات', icon: 'beach_access' },
  { key: 'penalties', label: 'الجزاءات', icon: 'gavel' },
];

const DEDUCTION_CATEGORIES: Record<DeductionCategory, string> = {
  manual: 'يدوي',
  disciplinary: 'تأديبي',
  transport: '8 88',
  override: 'استثنائي',
  other: 'أخرى',
};

function getMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const inputCls = 'w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';
const labelCls = 'block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1';

// ─── Multi-Employee Selector ────────────────────────────────────────────────

interface EmployeePickerProps {
  employees: FirestoreEmployee[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

const EmployeePicker: React.FC<EmployeePickerProps> = ({ employees, selected, onChange }) => {
  const [search, setSearch] = useState('');
  const active = employees.filter((e) => e.isActive);
  const filtered = search
    ? active.filter((e) => e.name.includes(search) || (e.code ?? '').includes(search))
    : active;

  const toggleAll = () => {
    if (selected.length === filtered.length) {
      onChange([]);
    } else {
      onChange(filtered.map((e) => e.id!));
    }
  };

  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="p-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <span className="material-icons-round text-slate-400 text-lg">search</span>
        <input
          type="text"
          className="flex-1 bg-transparent text-sm outline-none placeholder-slate-400"
          placeholder="بحث بالاسم أو الكود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs font-bold text-primary hover:underline shrink-0"
        >
          {selected.length === filtered.length ? 'إلغاء الكل' : 'تحديد الكل'}
        </button>
        <Badge variant="info">{selected.length} محدد</Badge>
      </div>
      <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.map((e) => (
          <label
            key={e.id}
            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
              selected.includes(e.id!) ? 'bg-primary/5' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(e.id!)}
              onChange={() => toggle(e.id!)}
              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary shrink-0"
            />
            <span className="text-sm font-bold flex-1">{e.name}</span>
            {e.code && <span className="text-xs font-mono text-slate-400">{e.code}</span>}
            <span className="text-xs text-slate-400">{formatCurrency(e.baseSalary)}</span>
          </label>
        ))}
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">لا توجد نتائج</div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

export const EmployeeFinancials: React.FC = () => {
  const uid = useAppStore((s) => s.uid);
  const [activeTab, setActiveTab] = useState<ActiveTab>('allowances');
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [allowances, setAllowances] = useState<FirestoreEmployeeAllowance[]>([]);
  const [deductions, setDeductions] = useState<FirestoreEmployeeDeduction[]>([]);
  const [loans, setLoans] = useState<FirestoreEmployeeLoan[]>([]);
  const [leaves, setLeaves] = useState<FirestoreLeaveRequest[]>([]);
  const [allowanceTypes, setAllowanceTypes] = useState<FirestoreAllowanceType[]>([]);
  const [filterEmpId, setFilterEmpId] = useState('');
  const [filterMonth, setFilterMonth] = useState(getMonthKey());

  // ─── Bulk Form States ───────────────────────────────────────────────
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkSuccess, setBulkSuccess] = useState('');

  // Allowance bulk fields
  const [bAlTypeId, setBAlTypeId] = useState('');
  const [bAlAmount, setBAlAmount] = useState(0);
  const [bAlRecurring, setBAlRecurring] = useState(false);
  // Per-employee overrides
  const [perEmpAmounts, setPerEmpAmounts] = useState<Record<string, number>>({});

  // Deduction bulk fields
  const [bDedName, setBDedName] = useState('');
  const [bDedAmount, setBDedAmount] = useState(0);
  const [bDedCategory, setBDedCategory] = useState<DeductionCategory>('manual');
  const [bDedReason, setBDedReason] = useState('');
  const [bDedRecurring, setBDedRecurring] = useState(false);

  // Loan bulk fields
  const [bLoanAmount, setBLoanAmount] = useState(0);
  const [bLoanInstallment, setBLoanInstallment] = useState(0);

  // Leave bulk fields
  const [bLeaveType, setBLeaveType] = useState<LeaveType>('annual');
  const [bLeaveStart, setBLeaveStart] = useState('');
  const [bLeaveEnd, setBLeaveEnd] = useState('');
  const [bLeaveReason, setBLeaveReason] = useState('');

  // Penalty bulk fields
  const [bPenName, setBPenName] = useState('جزاء تأديبي');
  const [bPenAmount, setBPenAmount] = useState(0);
  const [bPenReason, setBPenReason] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, allTypes] = await Promise.all([
        employeeService.getAll(),
        getDocs(allowanceTypesRef()).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as FirestoreAllowanceType)),
      ]);
      setEmployees(emps);
      setAllowanceTypes(allTypes.filter((a) => a.isActive));

      const month = filterMonth || getMonthKey();
      const [allAllowances, allDeductions, allLoans, allLeaves] = await Promise.all([
        employeeAllowanceService.getActiveForMonth(month),
        employeeDeductionService.getActiveForMonth(month),
        loanService.getAll(),
        leaveRequestService.getAll(),
      ]);
      setAllowances(allAllowances);
      setDeductions(allDeductions);
      setLoans(allLoans);
      setLeaves(allLeaves);
    } catch (err) {
      console.error('Failed to load financials:', err);
    } finally {
      setLoading(false);
    }
  }, [filterMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const empOptions = useMemo(() =>
    employees.filter((e) => e.isActive).map((e) => ({
      value: e.id!,
      label: `${e.code ? e.code + ' — ' : ''}${e.name}`,
    })),
    [employees],
  );

  const empNameMap = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach((e) => { if (e.id) m.set(e.id, e.name); });
    return m;
  }, [employees]);

  const getEmpName = useCallback((id: string) => empNameMap.get(id) || id, [empNameMap]);

  // ─── Filtered data for display ──────────────────────────────────────
  const filteredAllowances = useMemo(() => {
    if (!filterEmpId) return allowances;
    return allowances.filter((a) => a.employeeId === filterEmpId);
  }, [allowances, filterEmpId]);

  const filteredDeductions = useMemo(() => {
    let d = deductions;
    if (activeTab === 'penalties') {
      d = d.filter((x) => x.category === 'disciplinary');
    } else {
      d = d.filter((x) => x.category !== 'disciplinary');
    }
    if (!filterEmpId) return d;
    return d.filter((x) => x.employeeId === filterEmpId);
  }, [deductions, filterEmpId, activeTab]);

  const filteredLoans = useMemo(() => {
    if (!filterEmpId) return loans;
    return loans.filter((l) => l.employeeId === filterEmpId);
  }, [loans, filterEmpId]);

  const filteredLeaves = useMemo(() => {
    if (!filterEmpId) return leaves;
    return leaves.filter((l) => l.employeeId === filterEmpId);
  }, [leaves, filterEmpId]);

  const selectedAllowType = useMemo(
    () => allowanceTypes.find((a) => a.id === bAlTypeId) || null,
    [allowanceTypes, bAlTypeId],
  );

  // ─── Reset form when tab or form visibility changes ─────────────────
  const openBulkForm = () => {
    setShowBulkForm(true);
    setSelectedEmps([]);
    setBulkError('');
    setBulkSuccess('');
    setPerEmpAmounts({});
    setBAlTypeId(''); setBAlAmount(0); setBAlRecurring(false);
    setBDedName(''); setBDedAmount(0); setBDedCategory('manual'); setBDedReason(''); setBDedRecurring(false);
    setBLoanAmount(0); setBLoanInstallment(0);
    setBLeaveType('annual'); setBLeaveStart(''); setBLeaveEnd(''); setBLeaveReason('');
    setBPenName('جزاء تأديبي'); setBPenAmount(0); setBPenReason('');
  };

  // ─── Resolve amount per employee for allowances ─────────────────────
  const getResolvedAmount = (empId: string): number => {
    if (perEmpAmounts[empId] !== undefined && perEmpAmounts[empId] > 0) return perEmpAmounts[empId];
    if (activeTab === 'allowances' && selectedAllowType?.calculationType === 'percentage') {
      const emp = employees.find((e) => e.id === empId);
      return Math.round(((emp?.baseSalary || 0) * selectedAllowType.value) / 100 * 100) / 100;
    }
    if (activeTab === 'allowances') return bAlAmount;
    if (activeTab === 'deductions') return bDedAmount;
    if (activeTab === 'penalties') return bPenAmount;
    if (activeTab === 'loans') return bLoanAmount;
    return 0;
  };

  // ─── Bulk Save Handlers ─────────────────────────────────────────────

  const handleBulkSave = async () => {
    if (selectedEmps.length === 0) { setBulkError('يرجى تحديد موظف واحد على الأقل'); return; }
    setBulkError('');
    setBulkSuccess('');
    setBulkSaving(true);

    try {
      const month = filterMonth || getMonthKey();
      let savedCount = 0;

      if (activeTab === 'allowances') {
        if (!bAlTypeId) { setBulkError('يرجى اختيار نوع البدل'); setBulkSaving(false); return; }
        const typeName = allowanceTypes.find((t) => t.id === bAlTypeId)?.name ?? '';
        for (const empId of selectedEmps) {
          const amt = getResolvedAmount(empId);
          if (amt <= 0) continue;
          try {
            await employeeAllowanceService.create({
              employeeId: empId,
              allowanceTypeId: bAlTypeId,
              allowanceTypeName: typeName,
              amount: amt,
              isRecurring: bAlRecurring,
              startMonth: month,
              endMonth: null,
              status: 'active',
              createdBy: uid || '',
            });
            savedCount++;
          } catch { /* duplicate or error — skip */ }
        }
      } else if (activeTab === 'deductions') {
        if (!bDedName.trim() || bDedAmount <= 0) { setBulkError('يرجى إدخال اسم الخصم والمبلغ'); setBulkSaving(false); return; }
        for (const empId of selectedEmps) {
          const amt = perEmpAmounts[empId] > 0 ? perEmpAmounts[empId] : bDedAmount;
          try {
            await employeeDeductionService.create({
              employeeId: empId,
              deductionTypeId: `manual_${Date.now()}_${empId}`,
              deductionTypeName: bDedName.trim(),
              amount: amt,
              isRecurring: bDedRecurring,
              startMonth: month,
              endMonth: null,
              reason: bDedReason.trim() || '—',
              category: bDedCategory,
              status: 'active',
              createdBy: uid || '',
            });
            savedCount++;
          } catch { /* skip */ }
        }
      } else if (activeTab === 'loans') {
        if (bLoanAmount <= 0 || bLoanInstallment <= 0) { setBulkError('يرجى إدخال مبلغ السلفة وقيمة القسط'); setBulkSaving(false); return; }
        const installments = Math.max(1, Math.round(bLoanAmount / bLoanInstallment));
        for (const empId of selectedEmps) {
          const emp = employees.find((e) => e.id === empId);
          const amt = perEmpAmounts[empId] > 0 ? perEmpAmounts[empId] : bLoanAmount;
          const instAmt = perEmpAmounts[empId] > 0 ? Math.round(perEmpAmounts[empId] / installments) : bLoanInstallment;
          try {
            await loanService.create({
              employeeId: empId,
              employeeName: emp?.name ?? '',
              employeeCode: emp?.code ?? '',
              loanType: installments > 1 ? 'installment' : 'monthly_advance',
              loanAmount: amt,
              installmentAmount: instAmt,
              totalInstallments: installments,
              remainingInstallments: installments,
              startMonth: month,
              status: 'pending',
              approvalChain: [],
              finalStatus: 'pending',
              reason: '—',
              disbursed: false,
              createdBy: uid || '',
            });
            savedCount++;
          } catch { /* skip */ }
        }
      } else if (activeTab === 'leaves') {
        if (!bLeaveStart || !bLeaveEnd) { setBulkError('يرجى تحديد تاريخ البداية والنهاية'); setBulkSaving(false); return; }
        const totalDays = Math.max(1, Math.ceil((new Date(bLeaveEnd).getTime() - new Date(bLeaveStart).getTime()) / (1000 * 60 * 60 * 24)) + 1);
        for (const empId of selectedEmps) {
          try {
            await leaveRequestService.create({
              employeeId: empId,
              leaveType: bLeaveType,
              startDate: bLeaveStart,
              endDate: bLeaveEnd,
              totalDays,
              affectsSalary: bLeaveType !== 'unpaid',
              status: 'pending',
              approvalChain: [],
              finalStatus: 'pending',
              reason: bLeaveReason.trim() || '—',
              createdBy: uid || '',
            });
            savedCount++;
          } catch { /* skip */ }
        }
      } else if (activeTab === 'penalties') {
        if (!bPenName.trim() || bPenAmount <= 0) { setBulkError('يرجى إدخال اسم الجزاء والمبلغ'); setBulkSaving(false); return; }
        for (const empId of selectedEmps) {
          const amt = perEmpAmounts[empId] > 0 ? perEmpAmounts[empId] : bPenAmount;
          try {
            await employeeDeductionService.create({
              employeeId: empId,
              deductionTypeId: `penalty_${Date.now()}_${empId}`,
              deductionTypeName: bPenName.trim(),
              amount: amt,
              isRecurring: false,
              startMonth: month,
              endMonth: null,
              reason: bPenReason.trim() || '—',
              category: 'disciplinary',
              status: 'active',
              createdBy: uid || '',
            });
            savedCount++;
          } catch { /* skip */ }
        }
      }

      setBulkSuccess(`تم حفظ ${savedCount} إدخال بنجاح`);
      setSelectedEmps([]);
      setPerEmpAmounts({});
      await fetchData();
    } catch (err: any) {
      setBulkError(err?.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setBulkSaving(false);
    }
  };

  // ─── Delete / Stop handlers ─────────────────────────────────────────

  const handleStopAllowance = async (id: string) => {
    if (!confirm('إيقاف هذا البدل؟')) return;
    await employeeAllowanceService.stop(id);
    await fetchData();
  };
  const handleDeleteAllowance = async (id: string) => {
    if (!confirm('حذف هذا البدل نهائيًا؟')) return;
    await employeeAllowanceService.delete(id);
    await fetchData();
  };
  const handleStopDeduction = async (id: string) => {
    if (!confirm('إيقاف هذا الاستقطاع؟')) return;
    await employeeDeductionService.stop(id);
    await fetchData();
  };
  const handleDeleteDeduction = async (id: string) => {
    if (!confirm('حذف هذا الاستقطاع نهائيًا؟')) return;
    await employeeDeductionService.delete(id);
    await fetchData();
  };

  // ─── Export ─────────────────────────────────────────────────────────

  const handleExport = () => {
    if (activeTab === 'allowances') {
      const rows = filteredAllowances.map((a) => ({
        'الموظف': getEmpName(a.employeeId), 'نوع البدل': a.allowanceTypeName, 'المبلغ': a.amount,
        'متكرر': a.isRecurring ? 'نعم' : 'لا', 'من شهر': a.startMonth, 'الحالة': a.status === 'active' ? 'نشط' : 'متوقف',
      }));
      exportHRData(rows, 'بدلات الموظفين', `بدلات-${filterMonth}`);
    } else if (activeTab === 'deductions' || activeTab === 'penalties') {
      const rows = filteredDeductions.map((d) => ({
        'الموظف': getEmpName(d.employeeId), 'الاستقطاع': d.deductionTypeName, 'المبلغ': d.amount,
        'الفئة': DEDUCTION_CATEGORIES[d.category] || d.category, 'السبب': d.reason,
        'متكرر': d.isRecurring ? 'نعم' : 'لا', 'من شهر': d.startMonth, 'الحالة': d.status === 'active' ? 'نشط' : 'متوقف',
      }));
      exportHRData(rows, activeTab === 'penalties' ? 'جزاءات' : 'استقطاعات', `${activeTab}-${filterMonth}`);
    } else if (activeTab === 'loans') {
      const rows = filteredLoans.map((l) => ({
        'الموظف': getEmpName(l.employeeId), 'المبلغ': l.loanAmount, 'القسط': l.installmentAmount,
        'الأقساط': `${l.remainingInstallments}/${l.totalInstallments}`, 'الحالة': l.status,
      }));
      exportHRData(rows, 'سُلف', `سلف-${filterMonth}`);
    } else if (activeTab === 'leaves') {
      const rows = filteredLeaves.map((l) => ({
        'الموظف': getEmpName(l.employeeId), 'النوع': LEAVE_TYPE_LABELS[l.leaveType], 'من': l.startDate,
        'إلى': l.endDate, 'الأيام': l.totalDays, 'الحالة': l.finalStatus,
      }));
      exportHRData(rows, 'إجازات', `اجازات-${filterMonth}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-200 dark:bg-slate-700 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const dataCount = activeTab === 'allowances' ? filteredAllowances.length
    : activeTab === 'loans' ? filteredLoans.length
    : activeTab === 'leaves' ? filteredLeaves.length
    : filteredDeductions.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <span className="material-icons-round text-primary">account_balance_wallet</span>
            بدلات واستقطاعات الموظفين
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            إدارة البدلات والاستقطاعات والسلف والإجازات والجزاءات — شهر {filterMonth}
          </p>
        </div>
        <div className="flex gap-2">
          {dataCount > 0 && can('export') && (
            <Button variant="outline" onClick={handleExport}>
              <span className="material-icons-round text-sm">download</span>
              تصدير Excel
            </Button>
          )}
        </div>
      </div>

      {/* Tabs + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setShowBulkForm(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <span className="material-icons-round text-sm">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input type="month" className={inputCls + ' !w-auto'} value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
          <SearchableSelect
            options={[{ value: '', label: 'كل الموظفين' }, ...empOptions]}
            value={filterEmpId}
            onChange={setFilterEmpId}
            placeholder="فلتر بالموظف..."
            className="sm:w-56"
          />
          <Button variant="primary" onClick={openBulkForm}>
            <span className="material-icons-round text-sm">group_add</span>
            إضافة جماعية
          </Button>
        </div>
      </div>

      {/* ════════════════ Bulk Form ════════════════ */}
      {showBulkForm && (
        <Card title={
          <div className="flex items-center justify-between w-full">
            <span className="flex items-center gap-2">
              <span className="material-icons-round text-primary">group_add</span>
              إضافة جماعية — {TAB_CONFIG.find((t) => t.key === activeTab)?.label}
            </span>
            <button onClick={() => setShowBulkForm(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
              <span className="material-icons-round">close</span>
            </button>
          </div>
        }>
          {/* Step 1: Common fields */}
          <div className="mb-6">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-primary text-white rounded-full text-xs font-black flex items-center justify-center">1</span>
              البيانات المشتركة
            </h4>

            {activeTab === 'allowances' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>نوع البدل *</label>
                  <select className={inputCls} value={bAlTypeId} onChange={(e) => {
                    setBAlTypeId(e.target.value);
                    const t = allowanceTypes.find((a) => a.id === e.target.value);
                    if (t?.calculationType === 'fixed') setBAlAmount(t.value);
                  }}>
                    <option value="">— اختر —</option>
                    {allowanceTypes.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.calculationType === 'fixed' ? `${a.value} ط¬.ظ…` : `${a.value}%`})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{selectedAllowType?.calculationType === 'percentage' ? 'نسبة (يُحسب تلقائياً)' : 'المبلغ (ج.م) *'}</label>
                  <input type="number" min={0} className={inputCls} value={bAlAmount || ''} onChange={(e) => setBAlAmount(Number(e.target.value))} readOnly={selectedAllowType?.calculationType === 'percentage'} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={bAlRecurring} onChange={(e) => setBAlRecurring(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">متكرر شهرياً</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'deductions' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>اسم الاستقطاع *</label>
                  <input className={inputCls} value={bDedName} onChange={(e) => setBDedName(e.target.value)} placeholder="مثال: خصم سكن" />
                </div>
                <div>
                  <label className={labelCls}>المبلغ (ج.م) *</label>
                  <input type="number" min={0} className={inputCls} value={bDedAmount || ''} onChange={(e) => setBDedAmount(Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>الفئة</label>
                  <select className={inputCls} value={bDedCategory} onChange={(e) => setBDedCategory(e.target.value as DeductionCategory)}>
                    {Object.entries(DEDUCTION_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={bDedRecurring} onChange={(e) => setBDedRecurring(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">متكرر شهرياً</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'loans' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>مبلغ السلفة (ج.م) *</label>
                  <input type="number" min={0} className={inputCls} value={bLoanAmount || ''} onChange={(e) => setBLoanAmount(Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>قيمة القسط (ج.م) *</label>
                  <input type="number" min={0} className={inputCls} value={bLoanInstallment || ''} onChange={(e) => setBLoanInstallment(Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>عدد الأقساط</label>
                  <input type="text" readOnly className={inputCls + ' !bg-slate-100 dark:!bg-slate-900'} value={bLoanAmount > 0 && bLoanInstallment > 0 ? Math.max(1, Math.round(bLoanAmount / bLoanInstallment)) : '—'} />
                </div>
              </div>
            )}

            {activeTab === 'leaves' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>نوع الإجازة *</label>
                  <select className={inputCls} value={bLeaveType} onChange={(e) => setBLeaveType(e.target.value as LeaveType)}>
                    {(Object.entries(LEAVE_TYPE_LABELS) as [LeaveType, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>تاريخ البداية *</label>
                  <input type="date" className={inputCls} value={bLeaveStart} onChange={(e) => setBLeaveStart(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>تاريخ النهاية *</label>
                  <input type="date" className={inputCls} value={bLeaveEnd} onChange={(e) => setBLeaveEnd(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>السبب</label>
                  <input className={inputCls} value={bLeaveReason} onChange={(e) => setBLeaveReason(e.target.value)} placeholder="اختياري" />
                </div>
              </div>
            )}

            {activeTab === 'penalties' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>اسم الجزاء *</label>
                  <input className={inputCls} value={bPenName} onChange={(e) => setBPenName(e.target.value)} placeholder="مثال: جزاء تأديبي" />
                </div>
                <div>
                  <label className={labelCls}>المبلغ (ج.م) *</label>
                  <input type="number" min={0} className={inputCls} value={bPenAmount || ''} onChange={(e) => setBPenAmount(Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>السبب</label>
                  <input className={inputCls} value={bPenReason} onChange={(e) => setBPenReason(e.target.value)} placeholder="سبب الجزاء" />
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Employee selection */}
          <div className="mb-6">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-primary text-white rounded-full text-xs font-black flex items-center justify-center">2</span>
              اختيار الموظفين
            </h4>
            <EmployeePicker employees={employees} selected={selectedEmps} onChange={setSelectedEmps} />
          </div>

          {/* Step 3: Preview table */}
          {selectedEmps.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 bg-primary text-white rounded-full text-xs font-black flex items-center justify-center">3</span>
                معاينة وتخصيص ({selectedEmps.length} موظف)
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="text-right py-3 px-3 font-bold text-xs text-slate-500">الموظف</th>
                      <th className="text-right py-3 px-3 font-bold text-xs text-slate-500">الكود</th>
                      <th className="text-right py-3 px-3 font-bold text-xs text-slate-500">الراتب</th>
                      {activeTab !== 'leaves' && (
                        <th className="text-right py-3 px-3 font-bold text-xs text-slate-500">المبلغ (تخصيص)</th>
                      )}
                      <th className="text-center py-3 px-3 font-bold text-xs text-slate-500">إزالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEmps.map((empId) => {
                      const emp = employees.find((e) => e.id === empId);
                      if (!emp) return null;
                      return (
                        <tr key={empId} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-2.5 px-3 font-bold">{emp.name}</td>
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-400">{emp.code || '—'}</td>
                          <td className="py-2.5 px-3 text-slate-600">{formatCurrency(emp.baseSalary)}</td>
                          {activeTab !== 'leaves' && (
                            <td className="py-2.5 px-3">
                              <input
                                type="number"
                                min={0}
                                className="w-28 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-800 outline-none focus:ring-1 focus:ring-primary/30"
                                placeholder={String(getResolvedAmount(empId))}
                                value={perEmpAmounts[empId] ?? ''}
                                onChange={(e) => setPerEmpAmounts((prev) => ({ ...prev, [empId]: Number(e.target.value) }))}
                              />
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => setSelectedEmps((prev) => prev.filter((x) => x !== empId))}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded"
                            >
                              <span className="material-icons-round text-lg">close</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Messages */}
          {bulkError && (
            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-sm text-rose-700 dark:text-rose-400 font-medium flex items-center gap-2">
              <span className="material-icons-round text-sm">error</span>
              {bulkError}
            </div>
          )}
          {bulkSuccess && (
            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-2">
              <span className="material-icons-round text-sm">check_circle</span>
              {bulkSuccess}
            </div>
          )}

          {/* Save */}
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handleBulkSave} disabled={bulkSaving || selectedEmps.length === 0}>
              {bulkSaving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              حفظ الكل ({selectedEmps.length} موظف)
            </Button>
            <Button variant="outline" onClick={() => setShowBulkForm(false)}>إلغاء</Button>
          </div>
        </Card>
      )}

      {/* ════════════════ Data Tables ════════════════ */}

      {/* Allowances Table */}
      {activeTab === 'allowances' && (
        <Card>
          {filteredAllowances.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">card_giftcard</span>
              <p className="text-sm font-bold text-slate-500">لا توجد بدلات</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                    <th className="text-right py-3 px-3">الموظف</th>
                    <th className="text-right py-3 px-3">نوع البدل</th>
                    <th className="text-right py-3 px-3">المبلغ</th>
                    <th className="text-right py-3 px-3">النوع</th>
                    <th className="text-right py-3 px-3">8&8 </th>
                    <th className="text-right py-3 px-3">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllowances.map((a) => (
                    <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-3 font-bold">{getEmpName(a.employeeId)}</td>
                      <td className="py-3 px-3">{a.allowanceTypeName}</td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-600">+{formatCurrency(a.amount)}</td>
                      <td className="py-3 px-3"><Badge variant={a.isRecurring ? 'info' : 'neutral'}>{a.isRecurring ? 'متكرر' : 'مرة واحدة'}</Badge></td>
                      <td className="py-3 px-3 font-mono text-xs">{a.startMonth}</td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1">
                          {a.isRecurring && <button onClick={() => handleStopAllowance(a.id!)} className="p-1 text-amber-500 hover:text-amber-700 rounded" title="إيقاف"><span className="material-icons-round text-lg">pause_circle</span></button>}
                          <button onClick={() => handleDeleteAllowance(a.id!)} className="p-1 text-slate-400 hover:text-rose-500 rounded" title="حذف"><span className="material-icons-round text-lg">delete</span></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Deductions Table */}
      {activeTab === 'deductions' && (
        <Card>
          {filteredDeductions.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">money_off</span>
              <p className="text-sm font-bold text-slate-500">لا توجد استقطاعات</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                    <th className="text-right py-3 px-3">الموظف</th>
                    <th className="text-right py-3 px-3">الاستقطاع</th>
                    <th className="text-right py-3 px-3">المبلغ</th>
                    <th className="text-right py-3 px-3">الفئة</th>
                    <th className="text-right py-3 px-3">النوع</th>
                    <th className="text-right py-3 px-3">السبب</th>
                    <th className="text-right py-3 px-3">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeductions.map((d) => (
                    <tr key={d.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-3 font-bold">{getEmpName(d.employeeId)}</td>
                      <td className="py-3 px-3">{d.deductionTypeName}</td>
                      <td className="py-3 px-3 font-mono font-bold text-rose-600">-{formatCurrency(d.amount)}</td>
                      <td className="py-3 px-3"><Badge variant="neutral">{DEDUCTION_CATEGORIES[d.category] || d.category}</Badge></td>
                      <td className="py-3 px-3"><Badge variant={d.isRecurring ? 'info' : 'neutral'}>{d.isRecurring ? 'متكرر' : 'مرة واحدة'}</Badge></td>
                      <td className="py-3 px-3 text-xs text-slate-500 max-w-[200px] truncate">{d.reason || '—'}</td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1">
                          {d.isRecurring && <button onClick={() => handleStopDeduction(d.id!)} className="p-1 text-amber-500 hover:text-amber-700 rounded" title="إيقاف"><span className="material-icons-round text-lg">pause_circle</span></button>}
                          <button onClick={() => handleDeleteDeduction(d.id!)} className="p-1 text-slate-400 hover:text-rose-500 rounded" title="حذف"><span className="material-icons-round text-lg">delete</span></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Loans Table */}
      {activeTab === 'loans' && (
        <Card>
          {filteredLoans.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">payments</span>
              <p className="text-sm font-bold text-slate-500">لا توجد سُلف</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                    <th className="text-right py-3 px-3">الموظف</th>
                    <th className="text-right py-3 px-3">النوع</th>
                    <th className="text-right py-3 px-3">المبلغ</th>
                    <th className="text-right py-3 px-3">القسط</th>
                    <th className="text-right py-3 px-3">الأقساط</th>
                    <th className="text-right py-3 px-3">الشهر</th>
                    <th className="text-right py-3 px-3">الحالة</th>
                    <th className="text-right py-3 px-3">الصرف</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLoans.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-3 font-bold">{getEmpName(l.employeeId)}</td>
                      <td className="py-3 px-3 text-xs">{l.loanType === 'monthly_advance' ? 'شهرية' : 'مقسطة'}</td>
                      <td className="py-3 px-3 font-mono font-bold text-amber-600">{formatCurrency(l.loanAmount)}</td>
                      <td className="py-3 px-3">{formatCurrency(l.installmentAmount)}</td>
                      <td className="py-3 px-3">{l.remainingInstallments}/{l.totalInstallments}</td>
                      <td className="py-3 px-3 font-mono text-xs">{l.month || l.startMonth}</td>
                      <td className="py-3 px-3">
                        <Badge variant={l.status === 'active' ? 'success' : l.status === 'pending' ? 'warning' : 'neutral'}>
                          {l.status === 'active' ? 'نشطة' : l.status === 'pending' ? 'قيد المراجعة' : 'مغلقة'}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant={l.disbursed ? 'success' : 'warning'}>{l.disbursed ? 'تم الصرف' : 'لم يُصرف'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Leaves Table */}
      {activeTab === 'leaves' && (
        <Card>
          {filteredLeaves.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">beach_access</span>
              <p className="text-sm font-bold text-slate-500">لا توجد إجازات</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                    <th className="text-right py-3 px-3">الموظف</th>
                    <th className="text-right py-3 px-3">النوع</th>
                    <th className="text-right py-3 px-3">8&8 </th>
                    <th className="text-right py-3 px-3">إلى</th>
                    <th className="text-right py-3 px-3">الأيام</th>
                    <th className="text-right py-3 px-3">الحالة</th>
                    <th className="text-right py-3 px-3">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaves.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-3 font-bold">{getEmpName(l.employeeId)}</td>
                      <td className="py-3 px-3">{LEAVE_TYPE_LABELS[l.leaveType]}</td>
                      <td className="py-3 px-3 font-mono text-xs">{l.startDate}</td>
                      <td className="py-3 px-3 font-mono text-xs">{l.endDate}</td>
                      <td className="py-3 px-3 font-bold">{l.totalDays}</td>
                      <td className="py-3 px-3">
                        <Badge variant={l.finalStatus === 'approved' ? 'success' : l.finalStatus === 'rejected' ? 'danger' : 'warning'}>
                          {l.finalStatus === 'approved' ? 'موافق' : l.finalStatus === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500 max-w-[200px] truncate">{l.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Penalties Table */}
      {activeTab === 'penalties' && (
        <Card>
          {filteredDeductions.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">gavel</span>
              <p className="text-sm font-bold text-slate-500">لا توجد جزاءات تأديبية</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                    <th className="text-right py-3 px-3">الموظف</th>
                    <th className="text-right py-3 px-3">الجزاء</th>
                    <th className="text-right py-3 px-3">المبلغ</th>
                    <th className="text-right py-3 px-3">الشهر</th>
                    <th className="text-right py-3 px-3">السبب</th>
                    <th className="text-right py-3 px-3">الحالة</th>
                    <th className="text-right py-3 px-3">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeductions.map((d) => (
                    <tr key={d.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-3 font-bold">{getEmpName(d.employeeId)}</td>
                      <td className="py-3 px-3">{d.deductionTypeName}</td>
                      <td className="py-3 px-3 font-mono font-bold text-rose-600">-{formatCurrency(d.amount)}</td>
                      <td className="py-3 px-3 font-mono text-xs">{d.startMonth}</td>
                      <td className="py-3 px-3 text-xs text-slate-500 max-w-[200px] truncate">{d.reason || '—'}</td>
                      <td className="py-3 px-3"><Badge variant={d.status === 'active' ? 'success' : 'neutral'}>{d.status === 'active' ? 'نشط' : 'متوقف'}</Badge></td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1">
                          <button onClick={() => handleDeleteDeduction(d.id!)} className="p-1 text-slate-400 hover:text-rose-500 rounded" title="حذف"><span className="material-icons-round text-lg">delete</span></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

