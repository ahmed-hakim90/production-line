import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import type { FirestoreEmployee } from '../../../types';
import { EMPLOYMENT_TYPE_LABELS } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { employeeService } from '../employeeService';
import { attendanceLogService } from '../attendanceService';
import { leaveRequestService, leaveBalanceService } from '../leaveService';
import { loanService } from '../loanService';
import {
  employeeAllowanceService,
  employeeDeductionService,
  summarizeAllowances,
  summarizeDeductions,
} from '../employeeFinancialsService';
import { JOB_LEVEL_LABELS, type JobLevel } from '../types';
import { getDocs } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef, shiftsRef, allowanceTypesRef } from '../collections';
import type {
  FirestoreDepartment,
  FirestoreJobPosition,
  FirestoreShift,
  FirestoreVehicle,
  FirestoreAttendanceLog,
  FirestoreLeaveRequest,
  FirestoreLeaveBalance,
  FirestoreEmployeeLoan,
  FirestoreEmployeeAllowance,
  FirestoreEmployeeDeduction,
  FirestoreAllowanceType,
  DeductionCategory,
} from '../types';
import { vehicleService } from '../vehicleService';
import { LEAVE_TYPE_LABELS } from '../types';
import { formatNumber } from '../../../utils/calculations';

type ProfileTab = 'overview' | 'hierarchy' | 'attendance' | 'payroll' | 'financials' | 'leaves' | 'loans';

const TABS: { id: ProfileTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: 'dashboard' },
  { id: 'hierarchy', label: 'التسلسل الوظيفي', icon: 'account_tree' },
  { id: 'attendance', label: 'الحضور', icon: 'fingerprint' },
  { id: 'financials', label: 'البدلات والخصومات', icon: 'account_balance_wallet' },
  { id: 'payroll', label: 'الرواتب', icon: 'receipt_long' },
  { id: 'leaves', label: 'الإجازات', icon: 'beach_access' },
  { id: 'loans', label: 'السُلف', icon: 'payments' },
];

function formatTime(ts: any): string {
  if (!ts) return '—';
  const date = ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function formatDateAr(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'قيد المراجعة',
  approved: 'موافق',
  rejected: 'مرفوض',
};

const LOAN_STATUS_LABELS: Record<string, string> = {
  pending: 'قيد المراجعة',
  active: 'نشطة',
  closed: 'مغلقة',
};

// ─── Financials Tab Component ────────────────────────────────────────────────

interface FinancialsTabProps {
  employee: FirestoreEmployee;
  empAllowances: FirestoreEmployeeAllowance[];
  empDeductions: FirestoreEmployeeDeduction[];
  allowanceTypes: FirestoreAllowanceType[];
  loans: FirestoreEmployeeLoan[];
  canEdit: boolean;
  showAllowanceModal: boolean;
  setShowAllowanceModal: (v: boolean) => void;
  showDeductionModal: boolean;
  setShowDeductionModal: (v: boolean) => void;
  financialSaving: boolean;
  setFinancialSaving: (v: boolean) => void;
  onRefresh: () => Promise<void>;
}

const DEDUCTION_CATEGORIES: { value: DeductionCategory; label: string }[] = [
  { value: 'manual', label: 'يدوي' },
  { value: 'disciplinary', label: 'جزائي' },
  { value: 'transport', label: 'نقل' },
  { value: 'override', label: 'تجاوز افتراضي' },
  { value: 'other', label: 'أخرى' },
];

const FinancialsTab: React.FC<FinancialsTabProps> = ({
  employee,
  empAllowances,
  empDeductions,
  allowanceTypes,
  loans,
  canEdit,
  showAllowanceModal,
  setShowAllowanceModal,
  showDeductionModal,
  setShowDeductionModal,
  financialSaving,
  setFinancialSaving,
  onRefresh,
}) => {
  const uid = useAppStore((s) => s.uid);
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Allowance form state
  const [alType, setAlType] = useState('');
  const [alAmount, setAlAmount] = useState<number>(0);
  const [alRecurring, setAlRecurring] = useState(true);
  const [alMonth, setAlMonth] = useState(currentMonth);
  const [alError, setAlError] = useState('');
  const [alSuccess, setAlSuccess] = useState('');

  // Deduction form state
  const [dedName, setDedName] = useState('');
  const [dedAmount, setDedAmount] = useState<number>(0);
  const [dedRecurring, setDedRecurring] = useState(true);
  const [dedMonth, setDedMonth] = useState(currentMonth);
  const [dedReason, setDedReason] = useState('');
  const [dedCategory, setDedCategory] = useState<DeductionCategory>('manual');
  const [dedError, setDedError] = useState('');
  const [dedSuccess, setDedSuccess] = useState('');

  const handleAddAllowance = async () => {
    if (!alType || alAmount <= 0) {
      setAlError('يرجى اختيار النوع وإدخال المبلغ');
      return;
    }
    setAlError('');
    setAlSuccess('');
    setFinancialSaving(true);
    try {
      const typeObj = allowanceTypes.find((t) => t.id === alType);
      await employeeAllowanceService.create({
        employeeId: employee.id!,
        allowanceTypeId: alType,
        allowanceTypeName: typeObj?.name ?? alType,
        amount: alAmount,
        isRecurring: alRecurring,
        startMonth: alRecurring ? currentMonth : alMonth,
        endMonth: null,
        status: 'active',
        createdBy: uid,
      });
      setAlSuccess('تم حفظ البدل بنجاح');
      setAlType('');
      setAlAmount(0);
      setAlRecurring(true);
      setAlMonth(currentMonth);
      await onRefresh();
    } catch (err: any) {
      setAlError(err.message || 'حدث خطأ');
    } finally {
      setFinancialSaving(false);
    }
  };

  const handleAddDeduction = async () => {
    if (!dedName || dedAmount <= 0) {
      setDedError('يرجى إدخال اسم الخصم والمبلغ');
      return;
    }
    setDedError('');
    setDedSuccess('');
    setFinancialSaving(true);
    try {
      await employeeDeductionService.create({
        employeeId: employee.id!,
        deductionTypeId: dedName.replace(/\s+/g, '_').toLowerCase(),
        deductionTypeName: dedName,
        amount: dedAmount,
        isRecurring: dedRecurring,
        startMonth: dedRecurring ? currentMonth : dedMonth,
        endMonth: null,
        reason: dedReason,
        category: dedCategory,
        status: 'active',
        createdBy: uid,
      });
      setDedSuccess('تم حفظ الخصم بنجاح');
      setDedName('');
      setDedAmount(0);
      setDedRecurring(true);
      setDedMonth(currentMonth);
      setDedReason('');
      setDedCategory('manual');
      await onRefresh();
    } catch (err: any) {
      setDedError(err.message || 'حدث خطأ');
    } finally {
      setFinancialSaving(false);
    }
  };

  const handleStopAllowance = async (id: string) => {
    setFinancialSaving(true);
    try {
      await employeeAllowanceService.stop(id);
      await onRefresh();
    } finally {
      setFinancialSaving(false);
    }
  };

  const handleDeleteAllowance = async (id: string) => {
    setFinancialSaving(true);
    try {
      await employeeAllowanceService.delete(id);
      await onRefresh();
    } finally {
      setFinancialSaving(false);
    }
  };

  const handleStopDeduction = async (id: string) => {
    setFinancialSaving(true);
    try {
      await employeeDeductionService.stop(id);
      await onRefresh();
    } finally {
      setFinancialSaving(false);
    }
  };

  const handleDeleteDeduction = async (id: string) => {
    setFinancialSaving(true);
    try {
      await employeeDeductionService.delete(id);
      await onRefresh();
    } finally {
      setFinancialSaving(false);
    }
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm';
  const labelCls = 'block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1';

  return (
    <div className="space-y-6">
      {/* Allowances Section */}
      <Card
        title={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-emerald-500">add_circle</span>
              <span>البدلات المخصصة</span>
            </div>
            {canEdit && (
              <Button onClick={() => { setAlError(''); setAlSuccess(''); setShowAllowanceModal(true); }} disabled={financialSaving}>
                <span className="material-icons-round text-lg">add</span>
                إضافة بدل
              </Button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="p-3 font-bold">النوع</th>
                <th className="p-3 font-bold">المبلغ</th>
                <th className="p-3 font-bold">التكرار</th>
                <th className="p-3 font-bold">شهر البدء</th>
                <th className="p-3 font-bold">الحالة</th>
                {canEdit && <th className="p-3 font-bold">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {empAllowances.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-3 font-medium">{a.allowanceTypeName}</td>
                  <td className="p-3 font-bold text-emerald-600">{formatNumber(a.amount)} ج.م</td>
                  <td className="p-3">
                    <Badge variant={a.isRecurring ? 'info' : 'warning'}>
                      {a.isRecurring ? 'متكرر' : 'لمرة واحدة'}
                    </Badge>
                  </td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{a.startMonth}</td>
                  <td className="p-3">
                    <Badge variant={a.status === 'active' ? 'success' : 'neutral'}>
                      {a.status === 'active' ? 'نشط' : 'متوقف'}
                    </Badge>
                  </td>
                  {canEdit && (
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {a.status === 'active' && a.isRecurring && (
                          <button
                            onClick={() => a.id && handleStopAllowance(a.id)}
                            className="p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg"
                            title="إيقاف"
                            disabled={financialSaving}
                          >
                            <span className="material-icons-round text-lg">pause_circle</span>
                          </button>
                        )}
                        <button
                          onClick={() => a.id && handleDeleteAllowance(a.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"
                          title="حذف"
                          disabled={financialSaving}
                        >
                          <span className="material-icons-round text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {empAllowances.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="p-6 text-center text-slate-500">
                    لا توجد بدلات مخصصة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Deductions Section */}
      <Card
        title={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-rose-500">remove_circle</span>
              <span>الخصومات المخصصة</span>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDedError('');
                    setDedSuccess('');
                    setDedCategory('disciplinary');
                    setDedName('جزاء تأديبي');
                    setDedRecurring(false);
                    setShowDeductionModal(true);
                  }}
                  disabled={financialSaving}
                >
                  <span className="material-icons-round text-lg text-amber-500">gavel</span>
                  جزاء تأديبي
                </Button>
                <Button onClick={() => { setDedError(''); setDedSuccess(''); setShowDeductionModal(true); }} disabled={financialSaving}>
                  <span className="material-icons-round text-lg">add</span>
                  إضافة خصم
                </Button>
              </div>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="p-3 font-bold">النوع</th>
                <th className="p-3 font-bold">المبلغ</th>
                <th className="p-3 font-bold">التكرار</th>
                <th className="p-3 font-bold">التصنيف</th>
                <th className="p-3 font-bold">شهر البدء</th>
                <th className="p-3 font-bold">الحالة</th>
                <th className="p-3 font-bold">السبب</th>
                {canEdit && <th className="p-3 font-bold">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {empDeductions.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-3 font-medium">{d.deductionTypeName}</td>
                  <td className="p-3 font-bold text-rose-600">{formatNumber(d.amount)} ج.م</td>
                  <td className="p-3">
                    <Badge variant={d.isRecurring ? 'info' : 'warning'}>
                      {d.isRecurring ? 'متكرر' : 'لمرة واحدة'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="neutral">
                      {DEDUCTION_CATEGORIES.find((c) => c.value === d.category)?.label ?? d.category}
                    </Badge>
                  </td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{d.startMonth}</td>
                  <td className="p-3">
                    <Badge variant={d.status === 'active' ? 'success' : 'neutral'}>
                      {d.status === 'active' ? 'نشط' : 'متوقف'}
                    </Badge>
                  </td>
                  <td className="p-3 max-w-[150px] truncate text-slate-500">{d.reason || '—'}</td>
                  {canEdit && (
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {d.status === 'active' && d.isRecurring && (
                          <button
                            onClick={() => d.id && handleStopDeduction(d.id)}
                            className="p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg"
                            title="إيقاف"
                            disabled={financialSaving}
                          >
                            <span className="material-icons-round text-lg">pause_circle</span>
                          </button>
                        )}
                        <button
                          onClick={() => d.id && handleDeleteDeduction(d.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"
                          title="حذف"
                          disabled={financialSaving}
                        >
                          <span className="material-icons-round text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {empDeductions.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="p-6 text-center text-slate-500">
                    لا توجد خصومات مخصصة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Allowance Modal */}
      {showAllowanceModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowAllowanceModal(false); setAlError(''); setAlSuccess(''); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="material-icons-round text-emerald-500">add_circle</span>
                إضافة بدل للموظف
              </h3>
              <button onClick={() => { setShowAllowanceModal(false); setAlError(''); setAlSuccess(''); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>نوع البدل</label>
                <select value={alType} onChange={(e) => setAlType(e.target.value)} className={inputCls}>
                  <option value="">اختر النوع...</option>
                  {allowanceTypes.filter((t) => t.isActive).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>المبلغ (ج.م)</label>
                <input type="number" min={1} value={alAmount || ''} onChange={(e) => setAlAmount(e.target.valueAsNumber || 0)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>التكرار</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={alRecurring} onChange={() => setAlRecurring(true)} className="accent-primary" />
                    <span className="text-sm font-medium">متكرر شهرياً</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!alRecurring} onChange={() => setAlRecurring(false)} className="accent-primary" />
                    <span className="text-sm font-medium">لمرة واحدة</span>
                  </label>
                </div>
              </div>
              {!alRecurring && (
                <div>
                  <label className={labelCls}>الشهر</label>
                  <input type="month" value={alMonth} onChange={(e) => setAlMonth(e.target.value)} className={inputCls} />
                </div>
              )}
              {alSuccess && <p className="text-sm text-emerald-600 font-bold">{alSuccess}</p>}
              {alError && <p className="text-sm text-rose-600">{alError}</p>}
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleAddAllowance} disabled={financialSaving}>
                  {financialSaving ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
                <Button variant="outline" onClick={() => { setShowAllowanceModal(false); setAlError(''); setAlSuccess(''); }}>إلغاء</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Deduction Modal */}
      {showDeductionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowDeductionModal(false); setDedError(''); setDedSuccess(''); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="material-icons-round text-rose-500">remove_circle</span>
                إضافة خصم للموظف
              </h3>
              <button onClick={() => { setShowDeductionModal(false); setDedError(''); setDedSuccess(''); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>اسم الخصم</label>
                <input type="text" value={dedName} onChange={(e) => setDedName(e.target.value)} className={inputCls} placeholder="مثال: خصم سكن، جزاء تأديبي" />
              </div>
              <div>
                <label className={labelCls}>المبلغ (ج.م)</label>
                <input type="number" min={1} value={dedAmount || ''} onChange={(e) => setDedAmount(e.target.valueAsNumber || 0)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>التصنيف</label>
                <select value={dedCategory} onChange={(e) => setDedCategory(e.target.value as DeductionCategory)} className={inputCls}>
                  {DEDUCTION_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>التكرار</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={dedRecurring} onChange={() => setDedRecurring(true)} className="accent-primary" />
                    <span className="text-sm font-medium">متكرر شهرياً</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!dedRecurring} onChange={() => setDedRecurring(false)} className="accent-primary" />
                    <span className="text-sm font-medium">لمرة واحدة</span>
                  </label>
                </div>
              </div>
              {!dedRecurring && (
                <div>
                  <label className={labelCls}>الشهر</label>
                  <input type="month" value={dedMonth} onChange={(e) => setDedMonth(e.target.value)} className={inputCls} />
                </div>
              )}
              <div>
                <label className={labelCls}>السبب (اختياري)</label>
                <textarea value={dedReason} onChange={(e) => setDedReason(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="سبب الخصم" />
              </div>
              {dedSuccess && <p className="text-sm text-emerald-600 font-bold">{dedSuccess}</p>}
              {dedError && <p className="text-sm text-rose-600">{dedError}</p>}
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleAddDeduction} disabled={financialSaving}>
                  {financialSaving ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
                <Button variant="outline" onClick={() => { setShowDeductionModal(false); setDedError(''); setDedSuccess(''); }}>إلغاء</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main EmployeeProfile ───────────────────────────────────────────────────

export const EmployeeProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const updateEmployee = useAppStore((s) => s.updateEmployee);

  const [employee, setEmployee] = useState<FirestoreEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');

  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [jobPositions, setJobPositions] = useState<FirestoreJobPosition[]>([]);
  const [shifts, setShifts] = useState<FirestoreShift[]>([]);
  const [vehicles, setVehicles] = useState<FirestoreVehicle[]>([]);

  const [managerChain, setManagerChain] = useState<FirestoreEmployee[]>([]);
  const [directReports, setDirectReports] = useState<FirestoreEmployee[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<FirestoreAttendanceLog[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<FirestoreLeaveRequest[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<FirestoreLeaveBalance | null>(null);
  const [loans, setLoans] = useState<FirestoreEmployeeLoan[]>([]);

  const [empAllowances, setEmpAllowances] = useState<FirestoreEmployeeAllowance[]>([]);
  const [empDeductions, setEmpDeductions] = useState<FirestoreEmployeeDeduction[]>([]);
  const [allowanceTypes, setAllowanceTypes] = useState<FirestoreAllowanceType[]>([]);
  const [showAllowanceModal, setShowAllowanceModal] = useState(false);
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [financialSaving, setFinancialSaving] = useState(false);

  const [tabLoading, setTabLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  const getDepartmentName = useCallback(
    (departmentId: string) => departments.find((d) => d.id === departmentId)?.name ?? '—',
    [departments]
  );
  const getJobPositionTitle = useCallback(
    (jobPositionId: string) => jobPositions.find((p) => p.id === jobPositionId)?.title ?? '—',
    [jobPositions]
  );
  const getShiftName = useCallback(
    (shiftId: string) => shifts.find((s) => s.id === shiftId)?.name ?? '—',
    [shifts]
  );
  const getVehicleName = useCallback(
    (vehicleId: string) => {
      const v = vehicles.find((v) => v.id === vehicleId);
      return v ? `${v.name} — ${v.plateNumber}` : '—';
    },
    [vehicles]
  );

  // Fetch employee + ref data + financial data on mount
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [emp, deptSnap, posSnap, shiftSnap, vehiclesList, allowances, deductions, loansList, alTypeSnap] = await Promise.all([
          employeeService.getById(id),
          getDocs(departmentsRef()),
          getDocs(jobPositionsRef()),
          getDocs(shiftsRef()),
          vehicleService.getAll(),
          employeeAllowanceService.getByEmployee(id),
          employeeDeductionService.getByEmployee(id),
          loanService.getByEmployee(id),
          getDocs(allowanceTypesRef()),
        ]);
        if (cancelled) return;
        setEmployee(emp ?? null);
        setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment)));
        setJobPositions(posSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreJobPosition)));
        setShifts(shiftSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreShift)));
        setVehicles(vehiclesList);
        setEmpAllowances(allowances);
        setEmpDeductions(deductions);
        setLoans(loansList);
        setAllowanceTypes(alTypeSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreAllowanceType)));
      } catch (e) {
        console.error('EmployeeProfile load error:', e);
        if (!cancelled) setEmployee(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Tab-specific data
  useEffect(() => {
    if (!id || !employee) return;
    let cancelled = false;
    setTabLoading(true);
    (async () => {
      try {
        const tasks: Promise<unknown>[] = [];
        const results: { hierarchy?: FirestoreEmployee[]; directReports?: FirestoreEmployee[]; attendance?: FirestoreAttendanceLog[]; leaveReqs?: FirestoreLeaveRequest[]; balance?: FirestoreLeaveBalance | null; loansList?: FirestoreEmployeeLoan[] } = {};

        if (activeTab === 'hierarchy') {
          tasks.push(
            employeeService.getHierarchy(id).then((chain) => {
              if (!cancelled) results.hierarchy = chain;
            }),
            employeeService.getByManager(id).then((reports) => {
              if (!cancelled) results.directReports = reports;
            })
          );
        } else if (activeTab === 'attendance') {
          tasks.push(
            attendanceLogService.getByEmployee(id).then((logs) => {
              if (!cancelled) results.attendance = logs;
            })
          );
        } else if (activeTab === 'financials') {
          tasks.push(
            employeeAllowanceService.getByEmployee(id).then((list) => {
              if (!cancelled) setEmpAllowances(list);
            }),
            employeeDeductionService.getByEmployee(id).then((list) => {
              if (!cancelled) setEmpDeductions(list);
            }),
            getDocs(allowanceTypesRef()).then((snap) => {
              if (!cancelled) setAllowanceTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreAllowanceType)));
            }),
            loanService.getByEmployee(id).then((list) => {
              if (!cancelled) results.loansList = list;
            }),
          );
        } else if (activeTab === 'leaves') {
          tasks.push(
            leaveRequestService.getByEmployee(id).then((reqs) => {
              if (!cancelled) results.leaveReqs = reqs;
            }),
            leaveBalanceService.getOrCreate(id).then((bal) => {
              if (!cancelled) results.balance = bal;
            })
          );
        } else if (activeTab === 'loans') {
          tasks.push(
            loanService.getByEmployee(id).then((list) => {
              if (!cancelled) results.loansList = list;
            })
          );
        } else if (activeTab === 'overview') {
          tasks.push(
            employeeService.getHierarchy(id).then((chain) => {
              if (!cancelled) results.hierarchy = chain;
            }),
            employeeService.getByManager(id).then((dr) => {
              if (!cancelled) results.directReports = dr;
            })
          );
        }

        await Promise.all(tasks);
        if (cancelled) return;
        if (results.hierarchy != null) setManagerChain(results.hierarchy);
        if (results.directReports != null) setDirectReports(results.directReports);
        if (results.attendance != null) setAttendanceLogs(results.attendance);
        if (results.leaveReqs != null) setLeaveRequests(results.leaveReqs);
        if (results.balance !== undefined) setLeaveBalance(results.balance);
        if (results.loansList != null) setLoans(results.loansList);
      } catch (e) {
        console.error('EmployeeProfile tab data error:', e);
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, employee, activeTab]);

  const handleToggleStatus = useCallback(async () => {
    if (!employee?.id || toggling) return;
    setToggling(true);
    try {
      await updateEmployee(employee.id, { isActive: !employee.isActive });
      setEmployee((prev) => (prev ? { ...prev, isActive: !prev.isActive } : null));
    } catch (e) {
      console.error('Toggle status error:', e);
    } finally {
      setToggling(false);
    }
  }, [employee, toggling, updateEmployee]);

  const managerName = useMemo(() => {
    if (!employee?.managerId) return '—';
    const chain = managerChain.length ? managerChain : [];
    const immediate = chain[0];
    return immediate?.name ?? '—';
  }, [employee?.managerId, managerChain]);

  const attendanceSummary = useMemo(() => {
    let totalDays = attendanceLogs.length;
    let present = 0;
    let absent = 0;
    let late = 0;
    let totalHours = 0;
    attendanceLogs.forEach((log) => {
      if (log.isAbsent) absent++;
      else present++;
      if (log.lateMinutes > 0) late++;
      totalHours += log.totalHours ?? 0;
    });
    return { totalDays, present, absent, late, totalHours };
  }, [attendanceLogs]);

  const activeLoans = useMemo(() => loans.filter((l) => l.status === 'active'), [loans]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const salaryPreview = useMemo(() => {
    if (!employee) return null;
    const baseSalary = employee.baseSalary || 0;
    const activeAllowances = empAllowances.filter((a) => a.status === 'active');
    const activeDeductions = empDeductions.filter((d) => d.status === 'active');

    const monthlyAllowances = activeAllowances.filter((a) => {
      if (a.isRecurring) {
        if (a.startMonth > currentMonth) return false;
        if (a.endMonth && a.endMonth < currentMonth) return false;
        return true;
      }
      return a.startMonth === currentMonth;
    });
    const totalAllowances = monthlyAllowances.reduce((s, a) => s + a.amount, 0);

    const monthlyDeductions = activeDeductions.filter((d) => {
      if (d.isRecurring) {
        if (d.startMonth > currentMonth) return false;
        if (d.endMonth && d.endMonth < currentMonth) return false;
        return true;
      }
      return d.startMonth === currentMonth;
    });
    const totalCustomDeductions = monthlyDeductions.reduce((s, d) => s + d.amount, 0);

    const activeLoansNow = loans.filter((l) => l.status === 'active');
    const totalLoanInstallments = activeLoansNow.reduce((s, l) => s + l.installmentAmount, 0);

    const grossSalary = baseSalary + totalAllowances;
    const totalDeductions = totalCustomDeductions + totalLoanInstallments;
    const estimatedNet = Math.max(0, grossSalary - totalDeductions);

    return { baseSalary, totalAllowances, totalDeductions, totalCustomDeductions, totalLoanInstallments, estimatedNet };
  }, [employee, empAllowances, empDeductions, loans, currentMonth]);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto" dir="rtl">
        <div className="h-10 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse mb-6" />
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3 animate-pulse" />
              <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/4 animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center" dir="rtl">
        <Card>
          <span className="material-icons-round text-6xl text-slate-300 dark:text-slate-600">person_off</span>
          <h2 className="text-xl font-bold mt-4">الموظف غير موجود</h2>
          <p className="text-slate-500 mt-2">لم يتم العثور على الموظف المطلوب.</p>
          <Button className="mt-6" onClick={() => navigate('/employees')}>
            <span className="material-icons-round text-lg">arrow_back</span>
            العودة للقائمة
          </Button>
        </Card>
      </div>
    );
  }

  const levelLabel = JOB_LEVEL_LABELS[(employee.level as JobLevel) ?? 1] ?? String(employee.level);

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      {/* Back + Header */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate('/employees')}
          className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-primary font-medium mb-4"
        >
          <span className="material-icons-round">arrow_back</span>
          العودة للموظفين
        </button>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{employee.name}</h1>
            {employee.code && (
              <span className="font-mono text-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                {employee.code}
              </span>
            )}
            <Badge variant="neutral">{getDepartmentName(employee.departmentId)}</Badge>
            <Badge variant="info">{getJobPositionTitle(employee.jobPositionId)}</Badge>
            <Badge variant={employee.isActive ? 'success' : 'danger'}>
              {employee.isActive ? 'نشط' : 'غير نشط'}
            </Badge>
            <Badge variant="warning">{levelLabel}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {can('employees.edit') && (
              <>
                <Button
                  variant="outline"
                  onClick={() => navigate('/employees', { state: { editId: employee.id } })}
                >
                  <span className="material-icons-round text-lg">edit</span>
                  تعديل
                </Button>
                <Button
                  variant="outline"
                  onClick={handleToggleStatus}
                  disabled={toggling}
                >
                  <span className="material-icons-round text-lg">{employee.isActive ? 'toggle_on' : 'toggle_off'}</span>
                  {employee.isActive ? 'إلغاء التفعيل' : 'تفعيل'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Net Salary Preview */}
      {salaryPreview && (
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl shadow-blue-600/20 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="material-icons-round text-2xl opacity-90">calculate</span>
            <div>
              <h3 className="text-lg font-bold">صافي الراتب التقديري — {currentMonth}</h3>
              <p className="text-blue-200 text-xs">معاينة مباشرة (لا تُحفظ في قاعدة البيانات)</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-blue-200 text-xs font-medium mb-1">الراتب الأساسي</p>
              <p className="text-xl font-black">{formatNumber(salaryPreview.baseSalary)}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-blue-200 text-xs font-medium mb-1">+ البدلات</p>
              <p className="text-xl font-black text-emerald-300">+{formatNumber(salaryPreview.totalAllowances)}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
              <p className="text-blue-200 text-xs font-medium mb-1">– الخصومات</p>
              <p className="text-xl font-black text-rose-300">–{formatNumber(salaryPreview.totalDeductions)}</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3 backdrop-blur-sm border border-white/20">
              <p className="text-blue-100 text-xs font-medium mb-1">صافي تقديري</p>
              <p className="text-2xl font-black">{formatNumber(salaryPreview.estimatedNet)}</p>
            </div>
          </div>
          <div className="text-xs text-blue-200 space-y-1">
            <p>الإجمالي = {formatNumber(salaryPreview.baseSalary + salaryPreview.totalAllowances)} | الخصومات = خصومات مخصصة ({formatNumber(salaryPreview.totalCustomDeductions)}) + أقساط سلف ({formatNumber(salaryPreview.totalLoanInstallments)})</p>
            <p className="opacity-70">* لا تشمل: خصم الغياب، التأخير، التأمين، الضريبة — تُحسب في كشف الرواتب الفعلي</p>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="material-icons-round text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {tabLoading && (
        <div className="flex items-center gap-2 text-slate-500 mb-4">
          <span className="material-icons-round animate-spin">progress_activity</span>
          جاري التحميل...
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[
              { label: 'القسم', value: getDepartmentName(employee.departmentId) },
              { label: 'الوظيفة', value: getJobPositionTitle(employee.jobPositionId) },
              { label: 'المستوى', value: levelLabel },
              { label: 'نوع التوظيف', value: EMPLOYMENT_TYPE_LABELS[employee.employmentType] },
              { label: 'الراتب الأساسي', value: formatNumber(employee.baseSalary) + ' ج.م' },
              { label: 'الأجر بالساعة', value: formatNumber(employee.hourlyRate) + ' ج.م' },
              { label: 'الوردية', value: employee.shiftId ? getShiftName(employee.shiftId) : '—' },
              { label: 'المركبة', value: employee.vehicleId ? getVehicleName(employee.vehicleId) : '—' },
              { label: 'المدير', value: managerName },
              { label: 'الدخول للنظام', value: employee.hasSystemAccess ? 'نعم' : 'لا' },
            ].map((item) => (
              <Card key={item.label} className="!p-4">
                <p className="text-slate-500 text-xs font-medium mb-1">{item.label}</p>
                <p className="font-bold">{item.value}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'hierarchy' && (
        <Card title="التسلسل الوظيفي">
          <div className="space-y-0">
            {[...managerChain].reverse().map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2 border-r-2 border-slate-200 dark:border-slate-700 pr-4 ml-4">
                <span className="material-icons-round text-slate-400">person</span>
                <span className="cursor-pointer text-primary hover:underline" onClick={() => navigate(`/employees/${m.id}`)}>{m.name}</span>
                <Badge variant="neutral">{getDepartmentName(m.departmentId)}</Badge>
              </div>
            ))}
            <div className="flex items-center gap-3 py-3 pr-4 ml-4 border-r-2 border-primary bg-primary/5 rounded-lg my-2">
              <span className="material-icons-round text-primary">person</span>
              <span className="font-bold">{employee.name}</span>
              <Badge variant="info">الموظف الحالي</Badge>
            </div>
            {directReports.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2 border-r-2 border-slate-200 dark:border-slate-700 pr-4 ml-4">
                <span className="material-icons-round text-slate-400">person</span>
                <span className="cursor-pointer text-primary hover:underline" onClick={() => navigate(`/employees/${r.id}`)}>{r.name}</span>
                <Badge variant="neutral">{getDepartmentName(r.departmentId)}</Badge>
              </div>
            ))}
            {directReports.length === 0 && (
              <p className="text-slate-500 text-sm py-2 pr-4 ml-4">لا يوجد مرؤوسون مباشرون</p>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <Card title="ملخص الحضور">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <p className="text-slate-500 text-sm">إجمالي الأيام</p>
                <p className="text-xl font-bold">{formatNumber(attendanceSummary.totalDays)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm">حاضر</p>
                <p className="text-xl font-bold text-emerald-600">{formatNumber(attendanceSummary.present)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm">غائب</p>
                <p className="text-xl font-bold text-rose-600">{formatNumber(attendanceSummary.absent)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm">متأخر</p>
                <p className="text-xl font-bold text-amber-600">{formatNumber(attendanceSummary.late)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm">إجمالي الساعات</p>
                <p className="text-xl font-bold">{attendanceSummary.totalHours.toFixed(1)}</p>
              </div>
            </div>
          </Card>
          <Card title="سجلات الحضور">
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="p-3 font-bold">التاريخ</th>
                    <th className="p-3 font-bold">دخول</th>
                    <th className="p-3 font-bold">خروج</th>
                    <th className="p-3 font-bold">الساعات</th>
                    <th className="p-3 font-bold">تأخر (د)</th>
                    <th className="p-3 font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceLogs.map((log) => {
                    const status = log.isAbsent ? 'غائب' : log.lateMinutes > 0 ? 'متأخر' : 'حاضر';
                    return (
                      <tr key={log.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-3">{formatDateAr(log.date)}</td>
                        <td className="p-3">{formatTime(log.checkIn)}</td>
                        <td className="p-3">{formatTime(log.checkOut)}</td>
                        <td className="p-3">{(log.totalHours ?? 0).toFixed(1)}</td>
                        <td className="p-3">{log.lateMinutes ?? 0}</td>
                        <td className="p-3">
                          <Badge variant={log.isAbsent ? 'danger' : log.lateMinutes ? 'warning' : 'success'}>
                            {status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {attendanceLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        لا توجد سجلات حضور
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'financials' && (
        <FinancialsTab
          employee={employee}
          empAllowances={empAllowances}
          empDeductions={empDeductions}
          allowanceTypes={allowanceTypes}
          loans={loans}
          canEdit={can('employees.edit')}
          showAllowanceModal={showAllowanceModal}
          setShowAllowanceModal={setShowAllowanceModal}
          showDeductionModal={showDeductionModal}
          setShowDeductionModal={setShowDeductionModal}
          financialSaving={financialSaving}
          onRefresh={async () => {
            if (!id) return;
            const [a, d] = await Promise.all([
              employeeAllowanceService.getByEmployee(id),
              employeeDeductionService.getByEmployee(id),
            ]);
            setEmpAllowances(a);
            setEmpDeductions(d);
          }}
          setFinancialSaving={setFinancialSaving}
        />
      )}

      {activeTab === 'payroll' && (
        <Card title="الرواتب">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-slate-500 text-sm">الراتب الأساسي</p>
              <p className="text-xl font-bold">{formatNumber(employee.baseSalary)} ج.م</p>
            </div>
            <div>
              <p className="text-slate-500 text-sm">نوع التوظيف</p>
              <p className="text-xl font-bold">{EMPLOYMENT_TYPE_LABELS[employee.employmentType]}</p>
            </div>
            <div>
              <p className="text-slate-500 text-sm">الأجر بالساعة</p>
              <p className="text-xl font-bold">{formatNumber(employee.hourlyRate)} ج.م</p>
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-2">
            يمكنك مراجعة كشف الرواتب التفصيلي من صفحة الرواتب.
          </p>
          <Button variant="outline" onClick={() => navigate('/payroll')}>
            <span className="material-icons-round text-lg">receipt_long</span>
            صفحة الرواتب
          </Button>
        </Card>
      )}

      {activeTab === 'leaves' && (
        <div className="space-y-6">
          <Card title="رصيد الإجازات">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-slate-500 text-sm">سنوية</p>
                <p className="text-xl font-bold">{leaveBalance ? formatNumber(leaveBalance.annualBalance) : '—'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm">مرضية</p>
                <p className="text-xl font-bold">{leaveBalance ? formatNumber(leaveBalance.sickBalance) : '—'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm">طارئة</p>
                <p className="text-xl font-bold">{leaveBalance ? formatNumber(leaveBalance.emergencyBalance) : '—'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm">بدون راتب (مأخوذ)</p>
                <p className="text-xl font-bold">{leaveBalance ? formatNumber(leaveBalance.unpaidTaken) : '—'}</p>
              </div>
            </div>
          </Card>
          <Card title="طلبات الإجازة">
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="p-3 font-bold">النوع</th>
                    <th className="p-3 font-bold">من</th>
                    <th className="p-3 font-bold">إلى</th>
                    <th className="p-3 font-bold">الأيام</th>
                    <th className="p-3 font-bold">الحالة</th>
                    <th className="p-3 font-bold">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveRequests.map((req) => (
                    <tr key={req.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="p-3">{LEAVE_TYPE_LABELS[req.leaveType]}</td>
                      <td className="p-3">{formatDateAr(req.startDate)}</td>
                      <td className="p-3">{formatDateAr(req.endDate)}</td>
                      <td className="p-3">{formatNumber(req.totalDays)}</td>
                      <td className="p-3">
                        <Badge variant={req.finalStatus === 'approved' ? 'success' : req.finalStatus === 'rejected' ? 'danger' : 'warning'}>
                          {APPROVAL_STATUS_LABELS[req.finalStatus] ?? req.finalStatus}
                        </Badge>
                      </td>
                      <td className="p-3 max-w-[200px] truncate">{req.reason || '—'}</td>
                    </tr>
                  ))}
                  {leaveRequests.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        لا توجد طلبات إجازة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'loans' && (
        <div className="space-y-6">
          {activeLoans.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="material-icons-round text-blue-500 text-2xl mb-1 block">receipt_long</span>
                <p className="text-xs text-slate-400 font-bold mb-1">إجمالي السلف</p>
                <p className="text-xl font-black">{loans.length}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="material-icons-round text-emerald-500 text-2xl mb-1 block">trending_up</span>
                <p className="text-xs text-slate-400 font-bold mb-1">نشطة</p>
                <p className="text-xl font-black text-emerald-600">{activeLoans.length}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="material-icons-round text-amber-500 text-2xl mb-1 block">account_balance</span>
                <p className="text-xs text-slate-400 font-bold mb-1">المتبقي</p>
                <p className="text-xl font-black text-amber-600">
                  {formatNumber(activeLoans.reduce((s, l) => s + l.installmentAmount * l.remainingInstallments, 0))} ج.م
                </p>
              </div>
            </div>
          )}
          <Card title="السُلف">
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="p-3 font-bold">النوع</th>
                    <th className="p-3 font-bold">المبلغ</th>
                    <th className="p-3 font-bold">القسط</th>
                    <th className="p-3 font-bold">الأقساط</th>
                    <th className="p-3 font-bold">الشهر</th>
                    <th className="p-3 font-bold">الحالة</th>
                    <th className="p-3 font-bold">الصرف</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr key={loan.id} className={`border-t border-slate-100 dark:border-slate-800 ${loan.disbursed ? 'bg-emerald-50/30 dark:bg-emerald-900/5' : ''}`}>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 text-xs font-bold">
                          <span className="material-icons-round text-sm text-primary">
                            {(loan.loanType || 'installment') === 'monthly_advance' ? 'today' : 'calendar_month'}
                          </span>
                          {(loan.loanType || 'installment') === 'monthly_advance' ? 'شهرية' : 'مقسطة'}
                        </span>
                      </td>
                      <td className="p-3 font-bold">{formatNumber(loan.loanAmount)} ج.م</td>
                      <td className="p-3">{formatNumber(loan.installmentAmount)} ج.م</td>
                      <td className="p-3">
                        {loan.remainingInstallments} / {loan.totalInstallments}
                      </td>
                      <td className="p-3 font-mono text-xs" dir="ltr">{loan.month || loan.startMonth}</td>
                      <td className="p-3">
                        <Badge variant={loan.status === 'active' ? 'success' : loan.status === 'pending' ? 'warning' : 'neutral'}>
                          {LOAN_STATUS_LABELS[loan.status] ?? loan.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {loan.disbursed ? (
                          <Badge variant="success">تم الصرف</Badge>
                        ) : (
                          <Badge variant="warning">لم يُصرف</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                  {loans.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500">
                        لا توجد سُلف
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
