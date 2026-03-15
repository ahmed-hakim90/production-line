import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, KPIBox, LoadingSkeleton, Badge, Button, SearchableSelect } from '../components/UI';
import { getDocs } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useAppStore } from '@/store/useAppStore';
import { employeeService } from '../employeeService';
import { attendanceProcessingService } from '@/modules/attendance/services/attendanceProcessingService';
import { leaveRequestService } from '../leaveService';
import { loanService } from '../loanService';
import { departmentsRef, allowanceTypesRef } from '../collections';
import { employeeAllowanceService, employeeDeductionService } from '../employeeFinancialsService';
import { getPayrollMonth } from '../payroll';
import { formatNumber, formatCurrency } from '@/utils/calculations';
import type { FirestoreEmployee } from '@/types';
import type {
  FirestoreLeaveRequest,
  FirestoreEmployeeLoan,
  FirestoreDepartment,
  FirestoreAllowanceType,
} from '../types';
import type { AttendanceRecord } from '@/modules/attendance/types';
import { LEAVE_TYPE_LABELS, LOAN_TYPE_LABELS } from '../types';

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function getMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  approved: 'مُعتمد',
  rejected: 'مرفوض',
  active: 'نشط',
  closed: 'مُقفل',
};

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  active: 'success',
  closed: 'neutral',
};

export const HRDashboard: React.FC = () => {
  const navigate = useNavigate();
  const uid = useAppStore((s) => s.uid);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<FirestoreLeaveRequest[]>([]);
  const [loans, setLoans] = useState<FirestoreEmployeeLoan[]>([]);
  const [allowanceTypes, setAllowanceTypes] = useState<FirestoreAllowanceType[]>([]);
  const [payrollStatus, setPayrollStatus] = useState<string | null>(null);

  // Quick Action state
  const [qaOpen, setQaOpen] = useState<'' | 'loan' | 'leave' | 'allowance' | 'penalty'>('');
  const [qaEmpId, setQaEmpId] = useState('');
  const [qaEmpIds, setQaEmpIds] = useState<string[]>([]);
  const [qaSaving, setQaSaving] = useState(false);
  const [qaLoanAmount, setQaLoanAmount] = useState(0);
  const [qaLoanInstallment, setQaLoanInstallment] = useState(0);
  const [qaLoanMonths, setQaLoanMonths] = useState(1);
  const [qaLoanType, setQaLoanType] = useState<'monthly_advance' | 'installment'>('monthly_advance');
  const [qaLoanPickMethod, setQaLoanPickMethod] = useState<'search' | 'codes'>('search');
  const [qaLoanCodeInput, setQaLoanCodeInput] = useState('');
  const [qaLoanImportMsg, setQaLoanImportMsg] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [qaLeaveType, setQaLeaveType] = useState<'annual' | 'sick' | 'unpaid' | 'emergency'>('annual');
  const [qaLeaveStart, setQaLeaveStart] = useState('');
  const [qaLeaveEnd, setQaLeaveEnd] = useState('');
  const [qaLeaveReason, setQaLeaveReason] = useState('');
  const [qaLeavePickMethod, setQaLeavePickMethod] = useState<'search' | 'codes'>('search');
  const [qaLeaveCodeInput, setQaLeaveCodeInput] = useState('');
  const [qaLeaveImportMsg, setQaLeaveImportMsg] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [qaAllowTypeId, setQaAllowTypeId] = useState('');
  const [qaAllowAmount, setQaAllowAmount] = useState(0);
  const [qaAllowRecurring, setQaAllowRecurring] = useState(false);
  const [qaAllowCodeInput, setQaAllowCodeInput] = useState('');
  const [qaAllowImportMsg, setQaAllowImportMsg] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [qaAllowPickMethod, setQaAllowPickMethod] = useState<'search' | 'codes'>('search');
  const [qaPenaltyName, setQaPenaltyName] = useState('');
  const [qaPenaltyAmount, setQaPenaltyAmount] = useState(0);
  const [qaPenaltyReason, setQaPenaltyReason] = useState('');
  const [qaPenaltyCategory, setQaPenaltyCategory] = useState<'disciplinary' | 'manual' | 'other'>('disciplinary');
  const [qaPenaltyPickMethod, setQaPenaltyPickMethod] = useState<'search' | 'codes'>('search');
  const [qaPenaltyCodeInput, setQaPenaltyCodeInput] = useState('');
  const [qaPenaltyImportMsg, setQaPenaltyImportMsg] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  // Staging — items waiting to be saved (batch)
  type QaStagedItem = {
    type: 'loan' | 'leave' | 'allowance' | 'penalty';
    empId: string; empName: string; empCode: string;
    detail: string; amount: number;
    // Loan-specific
    loanType?: 'monthly_advance' | 'installment';
    loanAmount?: number; installmentAmount?: number; totalInstallments?: number;
    // Leave-specific
    leaveType?: string; startDate?: string; endDate?: string; totalDays?: number; reason?: string;
    // Allowance-specific
    allowanceTypeId?: string; allowanceTypeName?: string; isRecurring?: boolean;
    // Penalty-specific
    penaltyName?: string; penaltyCategory?: string; penaltyReason?: string;
  };
  const [qaStaged, setQaStaged] = useState<QaStagedItem[]>([]);
  const [qaSaveProgress, setQaSaveProgress] = useState({ done: 0, total: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = getToday();
    const monthStart = getMonthStart();
    try {
      const [emps, depts, att, lvs, lns, allTypes, pm] = await Promise.all([
        employeeService.getAll(),
        getDocs(departmentsRef()).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as FirestoreDepartment)),
        attendanceProcessingService.getRecordsByDateRange(monthStart, today),
        leaveRequestService.getAll(),
        loanService.getAll(),
        getDocs(allowanceTypesRef()).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as FirestoreAllowanceType)),
        getPayrollMonth(getMonthKey()).catch(() => null),
      ]);
      setEmployees(emps);
      setDepartments(depts);
      setAttendance(att);
      setLeaves(lvs);
      setLoans(lns);
      setAllowanceTypes(allTypes.filter((a) => a.isActive));
      setPayrollStatus(pm?.status ?? null);
    } catch (err) {
      console.error('HR Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const empOptions = useMemo(() =>
    employees.filter((e) => e.isActive).map((e) => ({
      value: e.id!,
      label: `${e.code ? e.code + ' — ' : ''}${e.name}`,
    })),
    [employees],
  );

  const getEmpObj = useCallback((id: string) => employees.find((e) => e.id === id), [employees]);

  const resetQa = () => {
    setQaEmpId(''); setQaEmpIds([]);
    setQaLoanAmount(0); setQaLoanInstallment(0); setQaLoanMonths(1); setQaLoanType('monthly_advance');
    setQaLoanPickMethod('search'); setQaLoanCodeInput(''); setQaLoanImportMsg(null);
    setQaLeaveType('annual'); setQaLeaveStart(''); setQaLeaveEnd(''); setQaLeaveReason('');
    setQaLeavePickMethod('search'); setQaLeaveCodeInput(''); setQaLeaveImportMsg(null);
    setQaAllowTypeId(''); setQaAllowAmount(0); setQaAllowRecurring(false);
    setQaAllowCodeInput(''); setQaAllowImportMsg(null);
    setQaAllowPickMethod('search');
    setQaPenaltyPickMethod('search'); setQaPenaltyCodeInput(''); setQaPenaltyImportMsg(null);
    setQaPenaltyName(''); setQaPenaltyAmount(0); setQaPenaltyReason(''); setQaPenaltyCategory('disciplinary');
  };

  const addEmpToList = (id: string) => {
    if (id && !qaEmpIds.includes(id)) setQaEmpIds((prev) => [...prev, id]);
  };
  const removeEmpFromList = (id: string) => {
    setQaEmpIds((prev) => prev.filter((x) => x !== id));
  };

  // Stage handlers — add to local table without saving
  const stageQaLoan = () => {
    const targetEmpIds = qaEmpIds.length > 0
      ? qaEmpIds
      : (qaEmpId ? [qaEmpId] : []);
    if (targetEmpIds.length === 0 || qaLoanAmount <= 0) return;
    const finalMonths = qaLoanType === 'monthly_advance' ? 1 : qaLoanMonths;
    const finalInstallment = qaLoanType === 'monthly_advance' ? qaLoanAmount : qaLoanInstallment;
    const stagedItems = targetEmpIds.map((id) => {
      const emp = getEmpObj(id);
      return {
        type: 'loan' as const,
        empId: id,
        empName: emp?.name || '',
        empCode: (emp as any)?.code || '',
        detail: qaLoanType === 'monthly_advance' ? 'سلفة شهرية' : `سلفة مقسطة (${finalMonths} شهر)`,
        amount: qaLoanAmount,
        loanType: qaLoanType,
        loanAmount: qaLoanAmount,
        installmentAmount: finalInstallment,
        totalInstallments: finalMonths,
      };
    });
    setQaStaged((prev) => [...prev, ...stagedItems]);
    setQaEmpId(''); setQaEmpIds([]); setQaLoanAmount(0); setQaLoanInstallment(0); setQaLoanMonths(1);
    setQaLoanCodeInput(''); setQaLoanImportMsg(null);
  };

  const stageQaLeave = () => {
    const targetEmpIds = qaEmpIds.length > 0
      ? qaEmpIds
      : (qaEmpId ? [qaEmpId] : []);
    if (targetEmpIds.length === 0 || !qaLeaveStart || !qaLeaveEnd) return;
    const days = Math.max(1, Math.ceil((new Date(qaLeaveEnd).getTime() - new Date(qaLeaveStart).getTime()) / 86400000) + 1);
    const stagedItems = targetEmpIds.map((id) => {
      const emp = getEmpObj(id);
      return {
        type: 'leave' as const,
        empId: id,
        empName: emp?.name || '',
        empCode: (emp as any)?.code || '',
        detail: `${LEAVE_TYPE_LABELS[qaLeaveType]} (${days} يوم)`,
        amount: 0,
        leaveType: qaLeaveType,
        startDate: qaLeaveStart,
        endDate: qaLeaveEnd,
        totalDays: days,
        reason: qaLeaveReason.trim() || '—',
      };
    });
    setQaStaged((prev) => [...prev, ...stagedItems]);
    setQaEmpId(''); setQaEmpIds([]); setQaLeaveStart(''); setQaLeaveEnd(''); setQaLeaveReason('');
    setQaLeaveCodeInput(''); setQaLeaveImportMsg(null);
  };

  const selectedQaAllowType = useMemo(
    () => allowanceTypes.find((a) => a.id === qaAllowTypeId) || null,
    [allowanceTypes, qaAllowTypeId],
  );

  const resolveAllowAmountForEmp = useCallback((empId: string) => {
    if (!selectedQaAllowType) return qaAllowAmount;
    if (selectedQaAllowType.calculationType === 'percentage') {
      const emp = employees.find((e) => e.id === empId);
      return Math.round(((emp?.baseSalary || 0) * selectedQaAllowType.value) / 100 * 100) / 100;
    }
    return qaAllowAmount;
  }, [selectedQaAllowType, qaAllowAmount, employees]);

  const stageQaAllowance = () => {
    if (qaEmpIds.length === 0 || !qaAllowTypeId) return;
    const allowType = allowanceTypes.find((a) => a.id === qaAllowTypeId);
    for (const eid of qaEmpIds) {
      const amount = resolveAllowAmountForEmp(eid);
      if (amount <= 0) continue;
      const emp = getEmpObj(eid);
      setQaStaged((prev) => [...prev, {
        type: 'allowance', empId: eid, empName: emp?.name || '', empCode: (emp as any)?.code || '',
        detail: `بدل: ${allowType?.name || ''}`, amount,
        allowanceTypeId: qaAllowTypeId, allowanceTypeName: allowType?.name || '',
        isRecurring: qaAllowRecurring,
      }]);
    }
    setQaEmpIds([]); setQaAllowTypeId(''); setQaAllowAmount(0); setQaAllowRecurring(false);
  };

  const normalizeEmpCode = useCallback((value: string) =>
    String(value || '')
      .replace(/[\u200E\u200F]/g, '')
      .trim()
      .toUpperCase(),
  [], []);

  const splitImportedCodes = useCallback((raw: string) =>
    Array.from(new Set(
      raw
        .split(/[\n\r,;|\t ]+/)
        .map((code) => normalizeEmpCode(code))
        .filter(Boolean),
    )),
  [normalizeEmpCode]);

  const importEmployeesByCodes = useCallback((
    codes: string[],
    setImportMsg: React.Dispatch<React.SetStateAction<{ type: 'success' | 'warning' | 'error'; text: string } | null>>,
  ) => {
    const activeByCode = new Map<string, string>();
    for (const emp of employees) {
      const empCode = normalizeEmpCode(String((emp as any)?.code || ''));
      if (!emp.id || !emp.isActive || !empCode) continue;
      if (!activeByCode.has(empCode)) activeByCode.set(empCode, emp.id);
    }

    const matchedIds: string[] = [];
    const missingCodes: string[] = [];
    for (const code of codes) {
      const empId = activeByCode.get(code);
      if (empId) matchedIds.push(empId);
      else missingCodes.push(code);
    }

    if (matchedIds.length === 0) {
      setImportMsg({
        type: 'error',
        text: 'لم يتم العثور على موظفين نشطين بالأكواد المرفوعة.',
      });
      return;
    }

    let addedCount = 0;
    let alreadySelectedCount = 0;
    setQaEmpIds((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      for (const id of matchedIds) {
        if (seen.has(id)) {
          alreadySelectedCount += 1;
          continue;
        }
        seen.add(id);
        next.push(id);
        addedCount += 1;
      }
      return next;
    });

    const statusType: 'success' | 'warning' = missingCodes.length > 0 || alreadySelectedCount > 0 ? 'warning' : 'success';
    const statusText = [
      `تمت إضافة ${addedCount} موظف`,
      alreadySelectedCount > 0 ? `(${alreadySelectedCount} موجودين مسبقًا)` : '',
      missingCodes.length > 0 ? `- لم يتم العثور على ${missingCodes.length} كود` : '',
    ].filter(Boolean).join(' ');

    setImportMsg({ type: statusType, text: statusText });
  }, [employees, normalizeEmpCode]);

  const extractCodesFromFile = useCallback(async (file: File): Promise<string[]> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
        header: 1,
        raw: false,
        defval: '',
      });
      if (!rows || rows.length === 0) return [];
      const firstRow = (rows[0] || []).map((v) => normalizeEmpCode(String(v || '')));
      const possibleHeaders = new Set(['CODE', 'EMPLOYEECODE', 'EMPLOYEE_CODE', 'EMPLOYEE CODE', 'EMPCODE', 'كود', 'كودالموظف', 'الكود']);
      let codeColIdx = firstRow.findIndex((cell) => possibleHeaders.has(cell.replace(/\s+/g, '')));
      let startIndex = 0;
      if (codeColIdx >= 0) startIndex = 1;
      else codeColIdx = 0;
      const mergedCodes = rows
        .slice(startIndex)
        .map((row) => String((row || [])[codeColIdx] || ''))
        .join('\n');
      return splitImportedCodes(mergedCodes);
    }
    const text = await file.text();
    return splitImportedCodes(text);
  }, [normalizeEmpCode, splitImportedCodes]);

  const handleQaLeaveCodesImport = useCallback(() => {
    const codes = splitImportedCodes(qaLeaveCodeInput);
    if (codes.length === 0) {
      setQaLeaveImportMsg({ type: 'error', text: 'أدخل كود موظف واحد على الأقل قبل الاستيراد.' });
      return;
    }
    importEmployeesByCodes(codes, setQaLeaveImportMsg);
    setQaLeaveCodeInput('');
  }, [importEmployeesByCodes, qaLeaveCodeInput, splitImportedCodes]);

  const handleQaLoanCodesImport = useCallback(() => {
    const codes = splitImportedCodes(qaLoanCodeInput);
    if (codes.length === 0) {
      setQaLoanImportMsg({ type: 'error', text: 'أدخل كود موظف واحد على الأقل قبل الاستيراد.' });
      return;
    }
    importEmployeesByCodes(codes, setQaLoanImportMsg);
    setQaLoanCodeInput('');
  }, [importEmployeesByCodes, qaLoanCodeInput, splitImportedCodes]);

  const handleQaLoanFileImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const codes = await extractCodesFromFile(file);
      if (codes.length === 0) {
        setQaLoanImportMsg({ type: 'error', text: 'تعذّر استخراج أكواد موظفين من الملف.' });
      } else {
        importEmployeesByCodes(codes, setQaLoanImportMsg);
      }
    } catch (error) {
      console.error('Failed to import loan codes', error);
      setQaLoanImportMsg({ type: 'error', text: 'حدث خطأ أثناء قراءة الملف.' });
    } finally {
      event.target.value = '';
    }
  }, [extractCodesFromFile, importEmployeesByCodes]);

  const handleQaLeaveFileImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const codes = await extractCodesFromFile(file);
      if (codes.length === 0) {
        setQaLeaveImportMsg({ type: 'error', text: 'تعذّر استخراج أكواد موظفين من الملف.' });
      } else {
        importEmployeesByCodes(codes, setQaLeaveImportMsg);
      }
    } catch (error) {
      console.error('Failed to import leave codes', error);
      setQaLeaveImportMsg({ type: 'error', text: 'حدث خطأ أثناء قراءة الملف.' });
    } finally {
      event.target.value = '';
    }
  }, [extractCodesFromFile, importEmployeesByCodes]);

  const handleQaAllowCodesImport = useCallback(() => {
    const codes = splitImportedCodes(qaAllowCodeInput);
    if (codes.length === 0) {
      setQaAllowImportMsg({ type: 'error', text: 'أدخل كود موظف واحد على الأقل قبل الاستيراد.' });
      return;
    }
    importEmployeesByCodes(codes, setQaAllowImportMsg);
    setQaAllowCodeInput('');
  }, [importEmployeesByCodes, qaAllowCodeInput, splitImportedCodes]);

  const handleQaAllowFileImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const codes = await extractCodesFromFile(file);

      if (codes.length === 0) {
        setQaAllowImportMsg({ type: 'error', text: 'تعذّر استخراج أكواد موظفين من الملف.' });
      } else {
        importEmployeesByCodes(codes, setQaAllowImportMsg);
      }
    } catch (error) {
      console.error('Failed to import allowance codes', error);
      setQaAllowImportMsg({ type: 'error', text: 'حدث خطأ أثناء قراءة الملف.' });
    } finally {
      event.target.value = '';
    }
  }, [extractCodesFromFile, importEmployeesByCodes]);

  const stageQaPenalty = () => {
    const targetEmpIds = qaEmpIds.length > 0
      ? qaEmpIds
      : (qaEmpId ? [qaEmpId] : []);
    if (targetEmpIds.length === 0 || !qaPenaltyName.trim() || qaPenaltyAmount <= 0) return;

    const stagedItems = targetEmpIds.map((id) => {
      const emp = getEmpObj(id);
      return {
        type: 'penalty' as const,
        empId: id,
        empName: emp?.name || '',
        empCode: (emp as any)?.code || '',
        detail: `جزاء: ${qaPenaltyName.trim()}`,
        amount: qaPenaltyAmount,
        penaltyName: qaPenaltyName.trim(),
        penaltyCategory: qaPenaltyCategory,
        penaltyReason: qaPenaltyReason.trim() || '—',
      };
    });
    setQaStaged((prev) => [...prev, ...stagedItems]);
    setQaEmpId(''); setQaEmpIds([]); setQaPenaltyName(''); setQaPenaltyAmount(0); setQaPenaltyReason('');
    setQaPenaltyCodeInput(''); setQaPenaltyImportMsg(null);
  };

  const handleQaPenaltyCodesImport = useCallback(() => {
    const codes = splitImportedCodes(qaPenaltyCodeInput);
    if (codes.length === 0) {
      setQaPenaltyImportMsg({ type: 'error', text: 'أدخل كود موظف واحد على الأقل قبل الاستيراد.' });
      return;
    }
    importEmployeesByCodes(codes, setQaPenaltyImportMsg);
    setQaPenaltyCodeInput('');
  }, [importEmployeesByCodes, qaPenaltyCodeInput, splitImportedCodes]);

  const handleQaPenaltyFileImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const codes = await extractCodesFromFile(file);
      if (codes.length === 0) {
        setQaPenaltyImportMsg({ type: 'error', text: 'تعذّر استخراج أكواد موظفين من الملف.' });
      } else {
        importEmployeesByCodes(codes, setQaPenaltyImportMsg);
      }
    } catch (error) {
      console.error('Failed to import penalty codes', error);
      setQaPenaltyImportMsg({ type: 'error', text: 'حدث خطأ أثناء قراءة الملف.' });
    } finally {
      event.target.value = '';
    }
  }, [extractCodesFromFile, importEmployeesByCodes]);

  const removeStagedItem = (index: number) => {
    setQaStaged((prev) => prev.filter((_, i) => i !== index));
  };

  // Batch save — saves all staged items at once
  const handleSaveAllStaged = async () => {
    if (qaStaged.length === 0) return;
    setQaSaving(true);
    setQaSaveProgress({ done: 0, total: qaStaged.length });
    let done = 0;

    for (const item of qaStaged) {
      try {
        if (item.type === 'loan') {
          await loanService.create({
            employeeId: item.empId, employeeName: item.empName, employeeCode: item.empCode,
            loanType: item.loanType!, loanAmount: item.loanAmount!,
            installmentAmount: item.installmentAmount!, totalInstallments: item.totalInstallments!,
            remainingInstallments: item.totalInstallments!,
            startMonth: getMonthKey(),
            month: item.loanType === 'monthly_advance' ? getMonthKey() : undefined,
            status: 'active', approvalChain: [], finalStatus: 'approved',
            reason: '—', disbursed: false, createdBy: uid || '',
          });
        } else if (item.type === 'leave') {
          await leaveRequestService.create({
            employeeId: item.empId, leaveType: item.leaveType as any,
            startDate: item.startDate!, endDate: item.endDate!, totalDays: item.totalDays!,
            affectsSalary: item.leaveType !== 'unpaid',
            status: 'pending', approvalChain: [], finalStatus: 'pending',
            reason: item.reason || '—', createdBy: uid || '',
          });
        } else if (item.type === 'allowance') {
          await employeeAllowanceService.create({
            employeeId: item.empId, allowanceTypeId: item.allowanceTypeId!,
            allowanceTypeName: item.allowanceTypeName!, amount: item.amount,
            isRecurring: item.isRecurring ?? false,
            startMonth: getMonthKey(), endMonth: null,
            status: 'active', createdBy: uid || '',
          });
        } else if (item.type === 'penalty') {
          await employeeDeductionService.create({
            employeeId: item.empId, deductionTypeId: `penalty_${Date.now()}_${done}`,
            deductionTypeName: item.penaltyName!, amount: item.amount,
            isRecurring: false, startMonth: getMonthKey(), endMonth: null,
            reason: item.penaltyReason || '—', category: item.penaltyCategory as any || 'disciplinary',
            status: 'active', createdBy: uid || '',
          });
        }
      } catch (err) { console.error('Save error:', err); }
      done++;
      setQaSaveProgress({ done, total: qaStaged.length });
    }

    await fetchData();
    setQaSaving(false);
    setQaStaged([]);
    setQaOpen('');
    resetQa();
  };

  // ── Computed data ──────────────────────────────────────────────────────────

  const empKpis = useMemo(() => {
    const active = employees.filter((e) => e.isActive);
    const inactive = employees.filter((e) => !e.isActive);
    const byType: Record<string, number> = {};
    active.forEach((e) => { byType[e.employmentType] = (byType[e.employmentType] || 0) + 1; });
    const totalSalary = active.reduce((s, e) => s + (e.baseSalary || 0), 0);
    return { total: employees.length, active: active.length, inactive: inactive.length, byType, totalSalary };
  }, [employees]);

  const deptBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    departments.forEach((d) => map.set(d.id!, { name: d.name, count: 0 }));
    employees.filter((e) => e.isActive).forEach((e) => {
      const entry = map.get(e.departmentId);
      if (entry) entry.count += 1;
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [employees, departments]);

  const attKpis = useMemo(() => {
    const today = getToday();
    const todayLogs = attendance.filter((a) => a.date === today);
    const present = todayLogs.filter((a) => a.status !== 'absent').length;
    const absent = todayLogs.filter((a) => a.status === 'absent').length;
    const late = todayLogs.filter((a) => a.lateMinutes > 0).length;

    const monthLogs = attendance;
    const totalLateMins = monthLogs.reduce((s, a) => s + (a.lateMinutes || 0), 0);
    const workingLogs = monthLogs.filter((a) => a.status !== 'absent');
    const avgHours = workingLogs.length > 0
      ? workingLogs.reduce((s, a) => s + ((a.workedMinutes || 0) / 60), 0) / workingLogs.length
      : 0;
    const totalAbsences = monthLogs.filter((a) => a.status === 'absent').length;

    return { todayPresent: present, todayAbsent: absent, todayLate: late, totalLateMins, avgHours, totalAbsences };
  }, [attendance]);

  const leaveKpis = useMemo(() => {
    const month = getMonthKey();
    const pending = leaves.filter((l) => l.finalStatus === 'pending').length;
    const approvedThisMonth = leaves.filter((l) => l.finalStatus === 'approved' && l.startDate.startsWith(month)).length;
    const totalDaysThisMonth = leaves
      .filter((l) => l.finalStatus === 'approved' && l.startDate.startsWith(month))
      .reduce((s, l) => s + (l.totalDays || 0), 0);
    const byType: Record<string, number> = {};
    leaves.filter((l) => l.finalStatus === 'approved').forEach((l) => {
      byType[l.leaveType] = (byType[l.leaveType] || 0) + 1;
    });
    return { pending, approvedThisMonth, totalDaysThisMonth, byType };
  }, [leaves]);

  const loanKpis = useMemo(() => {
    const active = loans.filter((l) => l.status === 'active' || l.finalStatus === 'approved');
    const pending = loans.filter((l) => l.finalStatus === 'pending').length;
    const totalAmount = active.reduce((s, l) => s + (l.loanAmount || 0), 0);
    const notDisbursed = active.filter((l) => !l.disbursed).length;
    const advances = loans.filter((l) => l.loanType === 'monthly_advance').length;
    const installments = loans.filter((l) => l.loanType === 'installment').length;
    return { activeCount: active.length, pending, totalAmount, notDisbursed, advances, installments };
  }, [loans]);

  const recentLeaves = useMemo(() => {
    return [...leaves]
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .slice(0, 5);
  }, [leaves]);

  const recentLoans = useMemo(() => {
    return [...loans]
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .slice(0, 5);
  }, [loans]);

  const empTypeLabels: Record<string, string> = {
    full_time: 'دوام كامل',
    part_time: 'دوام جزئي',
    contract: 'عقد مؤقت',
    daily: 'يومي',
  };

  // ── Alert bar items ────────────────────────────────────────────────────────
  const alertItems = useMemo(() => {
    const items: { icon: string; text: string; color: string; path: string }[] = [];

    if (leaveKpis.pending > 0) {
      items.push({
        icon: 'pending_actions',
        text: `${leaveKpis.pending} طلب إجازة بانتظار الموافقة`,
        color: 'amber',
        path: '/leave-requests',
      });
    }
    if (loanKpis.pending > 0) {
      items.push({
        icon: 'hourglass_top',
        text: `${loanKpis.pending} سلفة بانتظار الموافقة`,
        color: 'amber',
        path: '/loan-requests',
      });
    }
    if (loanKpis.notDisbursed > 0) {
      items.push({
        icon: 'payments',
        text: `${loanKpis.notDisbursed} سلفة لم تُصرف بعد`,
        color: 'rose',
        path: '/loan-requests',
      });
    }
    if (payrollStatus === 'draft') {
      items.push({
        icon: 'receipt_long',
        text: 'كشف الرواتب مسودة — لم يُعتمد بعد',
        color: 'orange',
        path: '/payroll',
      });
    }
    if (payrollStatus === null) {
      items.push({
        icon: 'warning',
        text: `لم يتم إعداد كشف رواتب ${getMonthKey()}`,
        color: 'slate',
        path: '/payroll',
      });
    }
    return items;
  }, [leaveKpis, loanKpis, payrollStatus]);

  // ── Quick action buttons ──────────────────────────────────────────────────
  const qaActions = [
    { key: 'loan' as const, label: 'سلفة', icon: 'payments', color: 'violet' },
    { key: 'allowance' as const, label: 'بدل', icon: 'card_giftcard', color: 'emerald' },
    { key: 'penalty' as const, label: 'جزاء', icon: 'gavel', color: 'rose' },
    { key: 'leave' as const, label: 'إجازة', icon: 'beach_access', color: 'sky' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton rows={3} />
      </div>
    );
  }

  const inputCls = 'w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-3 py-2.5 text-sm font-medium bg-[var(--color-card)] outline-none focus:ring-2 focus:ring-primary/20 transition-shadow';

  return (
    <div className="space-y-8">

      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER — Title + Search + Quick Action Toolbar
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Title */}
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--color-text)] flex items-center gap-2">
              <span className="material-icons-round text-primary text-3xl">monitoring</span>
              لوحة الموارد البشرية
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              نظرة شاملة — {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Search + Quick Actions toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Action buttons */}
            {qaActions.map((a) => (
              <button
                key={a.key}
                onClick={() => { setQaOpen(qaOpen === a.key ? '' : a.key); resetQa(); setQaStaged([]); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-[var(--border-radius-base)] text-xs font-bold border transition-all
                  ${qaOpen === a.key
                    ? `ring-2 ring-${a.color}-400/40 bg-${a.color}-100 dark:bg-${a.color}-900/30 text-${a.color}-700 dark:text-${a.color}-300 border-${a.color}-300 dark:border-${a.color}-700`
                    : `bg-[var(--color-card)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-${a.color}-300 hover:text-${a.color}-600`
                  }`}
                title={a.label}
              >
                <span className="material-icons-round text-base">{a.icon}</span>
                <span className="hidden sm:inline">{a.label}</span>
              </button>
            ))}
            {/* Divider */}
            <div className="w-px h-8 bg-slate-200 mx-1 hidden sm:block" />
            {/* Search */}
            <div className="w-56 sm:w-64">
              <SearchableSelect
                options={empOptions}
                value=""
                onChange={(val) => { if (val) navigate(`/employees/${val}`); }}
                placeholder="بحث بالاسم أو الكود..."
              />
            </div>
          </div>
        </div>

      </div>

      {/* ── Quick Action Dialogs ─────────────────────────────────────────── */}
      {qaOpen && (
        <div className="erp-modal-overlay" onClick={() => { if (!qaSaving) { setQaOpen(''); resetQa(); setQaStaged([]); } }}>
          <div className="erp-modal-panel relative w-[96vw] max-w-3xl max-h-[92dvh] overflow-hidden" onClick={(e) => e.stopPropagation()}>

            {/* ── Saving overlay ── */}
            {qaSaving && (
              <div className="absolute inset-0 bg-white/80/80 backdrop-blur-sm z-10 rounded-[var(--border-radius-xl)] flex flex-col items-center justify-center gap-4">
                <span className="material-icons-round text-5xl text-primary animate-spin">sync</span>
                <div className="text-center">
                  <p className="text-sm font-bold text-[var(--color-text)] mb-2">جاري الحفظ...</p>
                  <p className="text-xs text-[var(--color-text-muted)] font-bold">{qaSaveProgress.done} / {qaSaveProgress.total}</p>
                  <div className="w-48 h-2 bg-slate-200 rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${qaSaveProgress.total > 0 ? (qaSaveProgress.done / qaSaveProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Dialog Header ── */}
            <div className="erp-modal-head">
              <h3 className="erp-modal-title flex items-center gap-2.5">
                <span className={`material-icons-round text-lg ${
                  qaOpen === 'loan' ? 'text-violet-600' :
                  qaOpen === 'leave' ? 'text-sky-600' :
                  qaOpen === 'allowance' ? 'text-emerald-600' :
                  'text-rose-600'
                }`}>
                  {qaOpen === 'loan' ? 'payments' : qaOpen === 'leave' ? 'beach_access' : qaOpen === 'allowance' ? 'card_giftcard' : 'gavel'}
                </span>
                {qaOpen === 'loan' ? 'إنشاء سلفة' : qaOpen === 'leave' ? 'إنشاء إجازة' : qaOpen === 'allowance' ? 'ربط بدل بموظفين' : 'إنشاء جزاء'}
                {qaStaged.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-black">{qaStaged.length}</span>
                )}
              </h3>
              <button onClick={() => { if (!qaSaving) { setQaOpen(''); resetQa(); setQaStaged([]); } }} className="erp-modal-close" aria-label="إغلاق">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {/* ── Dialog Body ── */}
            <div className="erp-modal-body space-y-4">

              {/* ─── LOAN — inline form ─── */}
              {qaOpen === 'loan' && (
                <div className="space-y-2">
                  <div className="erp-filter-bar border border-[var(--color-border)] rounded-[var(--border-radius-base)]">
                    <div className="min-w-[240px]">
                      <label className="erp-filter-label mb-1 block">طريقة اختيار الموظفين</label>
                      <div className="erp-date-seg">
                        <button
                          type="button"
                          onClick={() => { setQaLoanPickMethod('search'); setQaLoanImportMsg(null); }}
                          className={`erp-date-seg-btn ${qaLoanPickMethod === 'search' ? 'active' : ''}`}
                        >
                          بحث يدوي
                        </button>
                        <button
                          type="button"
                          onClick={() => { setQaLoanPickMethod('codes'); setQaLoanImportMsg(null); }}
                          className={`erp-date-seg-btn ${qaLoanPickMethod === 'codes' ? 'active' : ''}`}
                        >
                          استيراد أكواد
                        </button>
                      </div>
                    </div>

                    {qaLoanPickMethod === 'search' && (
                      <div className="min-w-[220px] flex-1">
                        <label className="erp-filter-label mb-1 block">الموظف</label>
                        <SearchableSelect options={empOptions} value={qaEmpId} onChange={setQaEmpId} placeholder="اختر..." />
                      </div>
                    )}

                    {qaLoanPickMethod === 'codes' && (
                      <div className="min-w-[220px] flex-1">
                        <label className="erp-filter-label mb-1 block">إضافة موظف (اختياري)</label>
                        <SearchableSelect
                          options={empOptions.filter((o) => !qaEmpIds.includes(o.value))}
                          value=""
                          onChange={(val) => { if (val) addEmpToList(val); }}
                          placeholder="ابحث وأضف..."
                        />
                      </div>
                    )}

                    <div className="min-w-[130px]">
                      <label className="erp-filter-label mb-1 block">النوع</label>
                      <select className="erp-filter-select w-full" value={qaLoanType} onChange={(e) => setQaLoanType(e.target.value as any)}>
                        <option value="monthly_advance">شهرية</option>
                        <option value="installment">مقسطة</option>
                      </select>
                    </div>
                    <div className="min-w-[120px]">
                      <label className="erp-filter-label mb-1 block">المبلغ</label>
                      <input type="number" min={0} className={inputCls} value={qaLoanAmount || ''} onChange={(e) => setQaLoanAmount(Number(e.target.value))} placeholder="0" />
                    </div>
                    {qaLoanType === 'installment' && (
                      <>
                        <div className="min-w-[110px]">
                          <label className="erp-filter-label mb-1 block">القسط</label>
                          <input type="number" min={0} className={inputCls} value={qaLoanInstallment || ''} onChange={(e) => setQaLoanInstallment(Number(e.target.value))} placeholder="0" />
                        </div>
                        <div className="min-w-[96px]">
                          <label className="erp-filter-label mb-1 block">الأشهر</label>
                          <input type="number" min={1} className={inputCls} value={qaLoanMonths} onChange={(e) => setQaLoanMonths(Number(e.target.value) || 1)} />
                        </div>
                      </>
                    )}
                  </div>

                  {qaLoanPickMethod === 'codes' && (
                    <div className="border border-dashed border-[var(--color-border)] rounded-[var(--border-radius-base)] p-2.5 space-y-2 bg-[#fcfcfd]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-[var(--color-text-muted)]">استيراد الموظفين بكود الموظف</p>
                        <label className="erp-filter-apply cursor-pointer">
                          <span className="material-icons-round text-sm">upload_file</span>
                          رفع ملف
                          <input
                            type="file"
                            accept=".csv,.txt,.xlsx,.xls"
                            onChange={handleQaLoanFileImport}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <textarea
                        className={`${inputCls} min-h-[88px] font-mono text-xs`}
                        value={qaLoanCodeInput}
                        onChange={(e) => setQaLoanCodeInput(e.target.value)}
                        placeholder={'ألصق الأكواد (كل كود في سطر أو مفصول بفاصلة)\nمثال:\nE-142\nE-160'}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleQaLoanCodesImport}
                          className="erp-filter-apply"
                        >
                          <span className="material-icons-round text-sm">playlist_add</span>
                          استيراد الأكواد
                        </button>
                        {qaLoanImportMsg && (
                          <p className={`text-[11px] font-bold ${
                            qaLoanImportMsg.type === 'error'
                              ? 'text-rose-600'
                              : qaLoanImportMsg.type === 'warning'
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                          }`}>
                            {qaLoanImportMsg.text}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {qaEmpIds.length > 0 && (
                    <div className="border border-[var(--color-border)] rounded-[var(--border-radius-base)] p-2.5">
                      <div className="text-[11px] font-bold text-[var(--color-text-muted)] mb-2">الموظفون المحددون ({qaEmpIds.length})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {qaEmpIds.map((eid) => {
                          const emp = getEmpObj(eid);
                          return (
                            <span key={eid} className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--border-radius-base)] bg-violet-50 border border-violet-200 text-xs font-bold text-violet-700">
                              {(emp as any)?.code ? `${(emp as any).code} — ` : ''}{emp?.name || eid}
                              <button onClick={() => removeEmpFromList(eid)} className="text-violet-400 hover:text-rose-500 transition-colors mr-0.5">
                                <span className="material-icons-round text-sm">close</span>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={stageQaLoan}
                      disabled={(qaEmpIds.length === 0 && !qaEmpId) || qaLoanAmount <= 0}
                      className="erp-filter-apply disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-icons-round text-sm">add</span>
                      إضافة إلى الجدول
                    </button>
                  </div>
                </div>
              )}

              {/* ─── LEAVE — inline form ─── */}
              {qaOpen === 'leave' && (
                <div className="space-y-2">
                  <div className="erp-filter-bar border border-[var(--color-border)] rounded-[var(--border-radius-base)]">
                    <div className="min-w-[240px]">
                      <label className="erp-filter-label mb-1 block">طريقة اختيار الموظفين</label>
                      <div className="erp-date-seg">
                        <button
                          type="button"
                          onClick={() => { setQaLeavePickMethod('search'); setQaLeaveImportMsg(null); }}
                          className={`erp-date-seg-btn ${qaLeavePickMethod === 'search' ? 'active' : ''}`}
                        >
                          بحث يدوي
                        </button>
                        <button
                          type="button"
                          onClick={() => { setQaLeavePickMethod('codes'); setQaLeaveImportMsg(null); }}
                          className={`erp-date-seg-btn ${qaLeavePickMethod === 'codes' ? 'active' : ''}`}
                        >
                          استيراد أكواد
                        </button>
                      </div>
                    </div>

                    {qaLeavePickMethod === 'search' && (
                      <div className="min-w-[220px] flex-1">
                        <label className="erp-filter-label mb-1 block">الموظف</label>
                        <SearchableSelect options={empOptions} value={qaEmpId} onChange={setQaEmpId} placeholder="اختر..." />
                      </div>
                    )}

                    {qaLeavePickMethod === 'codes' && (
                      <div className="min-w-[220px] flex-1">
                        <label className="erp-filter-label mb-1 block">إضافة موظف (اختياري)</label>
                        <SearchableSelect
                          options={empOptions.filter((o) => !qaEmpIds.includes(o.value))}
                          value=""
                          onChange={(val) => { if (val) addEmpToList(val); }}
                          placeholder="ابحث وأضف..."
                        />
                      </div>
                    )}

                    <div className="min-w-[130px]">
                      <label className="erp-filter-label mb-1 block">نوع الإجازة</label>
                      <select className="erp-filter-select w-full" value={qaLeaveType} onChange={(e) => setQaLeaveType(e.target.value as any)}>
                        {(Object.entries(LEAVE_TYPE_LABELS) as [string, string][]).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="erp-filter-date">
                      <span className="erp-filter-label !mb-0">من</span>
                      <input type="date" value={qaLeaveStart} onChange={(e) => setQaLeaveStart(e.target.value)} />
                    </div>
                    <div className="erp-filter-date">
                      <span className="erp-filter-label !mb-0">إلى</span>
                      <input type="date" value={qaLeaveEnd} onChange={(e) => setQaLeaveEnd(e.target.value)} min={qaLeaveStart} />
                    </div>
                  </div>

                  {qaLeavePickMethod === 'codes' && (
                    <div className="border border-dashed border-[var(--color-border)] rounded-[var(--border-radius-base)] p-2.5 space-y-2 bg-[#fcfcfd]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-[var(--color-text-muted)]">استيراد الموظفين بكود الموظف</p>
                        <label className="erp-filter-apply cursor-pointer">
                          <span className="material-icons-round text-sm">upload_file</span>
                          رفع ملف
                          <input
                            type="file"
                            accept=".csv,.txt,.xlsx,.xls"
                            onChange={handleQaLeaveFileImport}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <textarea
                        className={`${inputCls} min-h-[88px] font-mono text-xs`}
                        value={qaLeaveCodeInput}
                        onChange={(e) => setQaLeaveCodeInput(e.target.value)}
                        placeholder={'ألصق الأكواد (كل كود في سطر أو مفصول بفاصلة)\nمثال:\nE-142\nE-160'}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleQaLeaveCodesImport}
                          className="erp-filter-apply"
                        >
                          <span className="material-icons-round text-sm">playlist_add</span>
                          استيراد الأكواد
                        </button>
                        {qaLeaveImportMsg && (
                          <p className={`text-[11px] font-bold ${
                            qaLeaveImportMsg.type === 'error'
                              ? 'text-rose-600'
                              : qaLeaveImportMsg.type === 'warning'
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                          }`}>
                            {qaLeaveImportMsg.text}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {qaEmpIds.length > 0 && (
                    <div className="border border-[var(--color-border)] rounded-[var(--border-radius-base)] p-2.5">
                      <div className="text-[11px] font-bold text-[var(--color-text-muted)] mb-2">الموظفون المحددون ({qaEmpIds.length})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {qaEmpIds.map((eid) => {
                          const emp = getEmpObj(eid);
                          return (
                            <span key={eid} className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--border-radius-base)] bg-sky-50 border border-sky-200 text-xs font-bold text-sky-700">
                              {(emp as any)?.code ? `${(emp as any).code} — ` : ''}{emp?.name || eid}
                              <button onClick={() => removeEmpFromList(eid)} className="text-sky-400 hover:text-rose-500 transition-colors mr-0.5">
                                <span className="material-icons-round text-sm">close</span>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={stageQaLeave}
                      disabled={(qaEmpIds.length === 0 && !qaEmpId) || !qaLeaveStart || !qaLeaveEnd}
                      className="erp-filter-apply disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-icons-round text-sm">add</span>
                      إضافة إلى الجدول
                    </button>
                  </div>
                </div>
              )}

              {/* ─── ALLOWANCE — inline form ─── */}
              {qaOpen === 'allowance' && (
                <>
                  <div className="space-y-2">
                    <div className="erp-filter-bar border border-[var(--color-border)] rounded-[var(--border-radius-base)]">
                      <div className="min-w-[180px]">
                        <label className="erp-filter-label mb-1 block">نوع البدل</label>
                        <select className="erp-filter-select w-full" value={qaAllowTypeId} onChange={(e) => {
                          setQaAllowTypeId(e.target.value);
                          const t = allowanceTypes.find((a) => a.id === e.target.value);
                          if (t && t.calculationType === 'fixed') setQaAllowAmount(t.value);
                        }}>
                          <option value="">— اختر —</option>
                          {allowanceTypes.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      {selectedQaAllowType?.calculationType === 'fixed' && (
                        <div className="min-w-[120px]">
                          <label className="erp-filter-label mb-1 block">المبلغ</label>
                          <input type="number" min={0} className={inputCls} value={qaAllowAmount || ''} onChange={(e) => setQaAllowAmount(Number(e.target.value))} />
                        </div>
                      )}

                      <div className="min-w-[240px]">
                        <label className="erp-filter-label mb-1 block">طريقة اختيار الموظفين</label>
                        <div className="erp-date-seg">
                          <button
                            type="button"
                            onClick={() => { setQaAllowPickMethod('search'); setQaAllowImportMsg(null); }}
                            className={`erp-date-seg-btn ${qaAllowPickMethod === 'search' ? 'active' : ''}`}
                          >
                            بحث يدوي
                          </button>
                          <button
                            type="button"
                            onClick={() => { setQaAllowPickMethod('codes'); setQaAllowImportMsg(null); }}
                            className={`erp-date-seg-btn ${qaAllowPickMethod === 'codes' ? 'active' : ''}`}
                          >
                            استيراد أكواد
                          </button>
                        </div>
                      </div>

                      {qaAllowPickMethod === 'search' && (
                        <div className="min-w-[220px] flex-1">
                          <label className="erp-filter-label mb-1 block">إضافة موظف</label>
                          <SearchableSelect
                            options={empOptions.filter((o) => !qaEmpIds.includes(o.value))}
                            value=""
                            onChange={(val) => { if (val) addEmpToList(val); }}
                            placeholder="ابحث وأضف..."
                          />
                        </div>
                      )}

                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={qaAllowRecurring} onChange={(e) => setQaAllowRecurring(e.target.checked)} className="w-4 h-4 rounded border-[var(--color-border)] text-primary focus:ring-primary" />
                        <span className="erp-filter-label !mb-0">متكرر</span>
                      </label>
                    </div>

                    {qaAllowPickMethod === 'codes' && (
                      <div className="border border-dashed border-[var(--color-border)] rounded-[var(--border-radius-base)] p-2.5 space-y-2 bg-[#fcfcfd]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-bold text-[var(--color-text-muted)]">استيراد الموظفين بكود الموظف</p>
                          <label className="erp-filter-apply cursor-pointer">
                            <span className="material-icons-round text-sm">upload_file</span>
                            رفع ملف
                            <input
                              type="file"
                              accept=".csv,.txt,.xlsx,.xls"
                              onChange={handleQaAllowFileImport}
                              className="hidden"
                            />
                          </label>
                        </div>
                        <textarea
                          className={`${inputCls} min-h-[88px] font-mono text-xs`}
                          value={qaAllowCodeInput}
                          onChange={(e) => setQaAllowCodeInput(e.target.value)}
                          placeholder={'ألصق الأكواد (كل كود في سطر أو مفصول بفاصلة)\nمثال:\nE-142\nE-160'}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={handleQaAllowCodesImport}
                            className="erp-filter-apply"
                          >
                            <span className="material-icons-round text-sm">playlist_add</span>
                            استيراد الأكواد
                          </button>
                          {qaAllowImportMsg && (
                            <p className={`text-[11px] font-bold ${
                              qaAllowImportMsg.type === 'error'
                                ? 'text-rose-600'
                                : qaAllowImportMsg.type === 'warning'
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                            }`}>
                              {qaAllowImportMsg.text}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        onClick={stageQaAllowance}
                        disabled={qaEmpIds.length === 0 || !qaAllowTypeId}
                        className="erp-filter-apply disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className="material-icons-round text-sm">add</span>
                        إضافة إلى الجدول
                      </button>
                    </div>
                  </div>
                  {qaEmpIds.length > 0 && (
                    <div className="border border-[var(--color-border)] rounded-[var(--border-radius-base)] p-2.5">
                      <div className="text-[11px] font-bold text-[var(--color-text-muted)] mb-2">الموظفون المحددون ({qaEmpIds.length})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {qaEmpIds.map((eid) => {
                          const emp = getEmpObj(eid);
                          return (
                            <span key={eid} className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--border-radius-base)] bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
                              {(emp as any)?.code ? `${(emp as any).code} — ` : ''}{emp?.name || eid}
                              <span className="text-[11px] text-emerald-500">{formatCurrency(resolveAllowAmountForEmp(eid))}</span>
                              <button onClick={() => removeEmpFromList(eid)} className="text-emerald-400 hover:text-rose-500 transition-colors mr-0.5">
                                <span className="material-icons-round text-sm">close</span>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ─── PENALTY — inline form ─── */}
              {qaOpen === 'penalty' && (
                <div className="space-y-2">
                  <div className="erp-filter-bar border border-[var(--color-border)] rounded-[var(--border-radius-base)]">
                    <div className="min-w-[240px]">
                      <label className="erp-filter-label mb-1 block">طريقة اختيار الموظفين</label>
                      <div className="erp-date-seg">
                        <button
                          type="button"
                          onClick={() => { setQaPenaltyPickMethod('search'); setQaPenaltyImportMsg(null); }}
                          className={`erp-date-seg-btn ${qaPenaltyPickMethod === 'search' ? 'active' : ''}`}
                        >
                          بحث يدوي
                        </button>
                        <button
                          type="button"
                          onClick={() => { setQaPenaltyPickMethod('codes'); setQaPenaltyImportMsg(null); }}
                          className={`erp-date-seg-btn ${qaPenaltyPickMethod === 'codes' ? 'active' : ''}`}
                        >
                          استيراد أكواد
                        </button>
                      </div>
                    </div>

                    {qaPenaltyPickMethod === 'search' && (
                      <div className="flex-1 min-w-0">
                        <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">الموظف</label>
                        <SearchableSelect options={empOptions} value={qaEmpId} onChange={setQaEmpId} placeholder="اختر..." />
                      </div>
                    )}

                    {qaPenaltyPickMethod === 'codes' && (
                      <div className="min-w-[220px] flex-1">
                        <label className="erp-filter-label mb-1 block">إضافة موظف (اختياري)</label>
                        <SearchableSelect
                          options={empOptions.filter((o) => !qaEmpIds.includes(o.value))}
                          value=""
                          onChange={(val) => { if (val) addEmpToList(val); }}
                          placeholder="ابحث وأضف..."
                        />
                      </div>
                    )}

                  </div>

                  <div className="flex items-end gap-2">
                    <div className="w-32 shrink-0">
                      <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">اسم الجزاء</label>
                      <input className={inputCls} value={qaPenaltyName} onChange={(e) => setQaPenaltyName(e.target.value)} placeholder="إنذار..." />
                    </div>
                    <div className="w-24 shrink-0">
                      <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">المبلغ</label>
                      <input type="number" min={0} className={inputCls} value={qaPenaltyAmount || ''} onChange={(e) => setQaPenaltyAmount(Number(e.target.value))} placeholder="0" />
                    </div>
                    <div className="w-28 shrink-0">
                      <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">الفئة</label>
                      <select className={inputCls} value={qaPenaltyCategory} onChange={(e) => setQaPenaltyCategory(e.target.value as any)}>
                        <option value="disciplinary">تأديبي</option>
                        <option value="manual">يدوي</option>
                        <option value="other">أخرى</option>
                      </select>
                    </div>
                  </div>

                  {qaPenaltyPickMethod === 'codes' && (
                    <div className="border border-dashed border-[var(--color-border)] rounded-[var(--border-radius-base)] p-2.5 space-y-2 bg-[#fcfcfd]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-[var(--color-text-muted)]">استيراد الموظفين بكود الموظف</p>
                        <label className="erp-filter-apply cursor-pointer">
                          <span className="material-icons-round text-sm">upload_file</span>
                          رفع ملف
                          <input
                            type="file"
                            accept=".csv,.txt,.xlsx,.xls"
                            onChange={handleQaPenaltyFileImport}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <textarea
                        className={`${inputCls} min-h-[88px] font-mono text-xs`}
                        value={qaPenaltyCodeInput}
                        onChange={(e) => setQaPenaltyCodeInput(e.target.value)}
                        placeholder={'ألصق الأكواد (كل كود في سطر أو مفصول بفاصلة)\nمثال:\nE-142\nE-160'}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleQaPenaltyCodesImport}
                          className="erp-filter-apply"
                        >
                          <span className="material-icons-round text-sm">playlist_add</span>
                          استيراد الأكواد
                        </button>
                        {qaPenaltyImportMsg && (
                          <p className={`text-[11px] font-bold ${
                            qaPenaltyImportMsg.type === 'error'
                              ? 'text-rose-600'
                              : qaPenaltyImportMsg.type === 'warning'
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                          }`}>
                            {qaPenaltyImportMsg.text}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {qaEmpIds.length > 0 && (
                    <div className="border border-[var(--color-border)] rounded-[var(--border-radius-base)] p-2.5">
                      <div className="text-[11px] font-bold text-[var(--color-text-muted)] mb-2">الموظفون المحددون ({qaEmpIds.length})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {qaEmpIds.map((eid) => {
                          const emp = getEmpObj(eid);
                          return (
                            <span key={eid} className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--border-radius-base)] bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
                              {(emp as any)?.code ? `${(emp as any).code} — ` : ''}{emp?.name || eid}
                              <button onClick={() => removeEmpFromList(eid)} className="text-rose-400 hover:text-rose-600 transition-colors mr-0.5">
                                <span className="material-icons-round text-sm">close</span>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={stageQaPenalty}
                      disabled={(qaEmpIds.length === 0 && !qaEmpId) || !qaPenaltyName.trim() || qaPenaltyAmount <= 0}
                      className="erp-filter-apply disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-icons-round text-sm">add</span>
                      إضافة إلى الجدول
                    </button>
                  </div>
                </div>
              )}

              {/* ─── STAGED ITEMS TABLE ─── */}
              {qaStaged.length > 0 ? (
                <div className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="erp-thead">
                      <tr>
                        <th className="erp-th">#</th>
                        <th className="erp-th">الكود</th>
                        <th className="erp-th">الموظف</th>
                        <th className="erp-th">التفاصيل</th>
                        <th className="erp-th">المبلغ</th>
                        <th className="erp-th text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {qaStaged.map((entry, i) => (
                        <tr key={i} className="border-t border-[var(--color-border)] hover:bg-[#f8f9fa]/30">
                          <td className="py-2 px-3 font-mono text-xs text-slate-400">{i + 1}</td>
                          <td className="py-2 px-3 font-mono text-xs text-slate-400">{entry.empCode || '—'}</td>
                          <td className="py-2 px-3 font-bold text-[var(--color-text)] text-xs">{entry.empName}</td>
                          <td className="py-2 px-3 text-xs text-slate-500">{entry.detail}</td>
                          <td className="py-2 px-3 font-mono text-xs font-bold">{entry.amount > 0 ? formatCurrency(entry.amount) : '—'}</td>
                          <td className="py-2 px-3 text-center">
                            <button onClick={() => removeStagedItem(i)} className="text-[var(--color-text-muted)] hover:text-rose-500 transition-colors">
                              <span className="material-icons-round text-base">close</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="bg-[#f8f9fa] px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] flex justify-between">
                    <span>{qaStaged.length} عملية جاهزة للحفظ</span>
                    {qaStaged.some((e) => e.amount > 0) && (
                      <span>إجمالي: {formatCurrency(qaStaged.reduce((s, e) => s + e.amount, 0))}</span>
                    )}
                  </div>
                </div>
              ) : !(qaOpen === 'allowance' && qaEmpIds.length > 0) ? (
                <div className="text-center py-6 text-[var(--color-text-muted)] dark:text-slate-600">
                  <span className="material-icons-round text-3xl block mb-1">playlist_add</span>
                  <p className="text-xs font-medium">أدخل البيانات واضغط + لإضافتها للجدول</p>
                </div>
              ) : null}
            </div>

            {/* ── Dialog Footer ── */}
            <div className="erp-modal-footer !justify-between !bg-[var(--color-card)]">
              <Button variant="outline" size="sm" onClick={() => { setQaOpen(''); resetQa(); setQaStaged([]); }} disabled={qaSaving}>
                إلغاء
              </Button>
              <Button size="sm" onClick={handleSaveAllStaged} disabled={qaSaving || qaStaged.length === 0}>
                <span className="material-icons-round text-sm">save</span>
                حفظ وإغلاق ({qaStaged.length})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          CRITICAL ALERTS ROW
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => navigate('/approval-center')}
          className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center hover:shadow-md transition-shadow group"
        >
          <div className="w-10 h-10 mx-auto mb-2 bg-amber-100 rounded-[var(--border-radius-base)] flex items-center justify-center">
            <span className="material-icons-round text-amber-600 text-xl">pending_actions</span>
          </div>
          <p className="text-2xl font-bold text-[var(--color-text)]">{leaveKpis.pending + loanKpis.pending}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-medium">موافقات معلقة</p>
        </button>
        <button
          onClick={() => navigate('/attendance')}
          className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center hover:shadow-md transition-shadow group"
        >
          <div className="w-10 h-10 mx-auto mb-2 bg-rose-100 rounded-[var(--border-radius-base)] flex items-center justify-center">
            <span className="material-icons-round text-rose-600 text-xl">person_off</span>
          </div>
          <p className="text-2xl font-bold text-[var(--color-text)]">{attKpis.todayAbsent}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-medium">غياب اليوم</p>
        </button>
        <button
          onClick={() => navigate('/attendance')}
          className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center hover:shadow-md transition-shadow group"
        >
          <div className="w-10 h-10 mx-auto mb-2 bg-orange-100 dark:bg-orange-900/30 rounded-[var(--border-radius-base)] flex items-center justify-center">
            <span className="material-icons-round text-orange-600 dark:text-orange-400 text-xl">schedule</span>
          </div>
          <p className="text-2xl font-bold text-[var(--color-text)]">{attKpis.todayLate}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-medium">تأخير اليوم</p>
        </button>
        <button
          onClick={() => navigate('/payroll')}
          className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center hover:shadow-md transition-shadow group"
        >
          <div className={`w-10 h-10 mx-auto mb-2 rounded-[var(--border-radius-base)] flex items-center justify-center ${
            payrollStatus === 'draft' ? 'bg-orange-100 dark:bg-orange-900/30' :
            payrollStatus === 'finalized' ? 'bg-emerald-100' :
            payrollStatus === 'locked' ? 'bg-blue-100' :
            'bg-[#f0f2f5]'
          }`}>
            <span className={`material-icons-round text-xl ${
              payrollStatus === 'draft' ? 'text-orange-600 dark:text-orange-400' :
              payrollStatus === 'finalized' ? 'text-emerald-600' :
              payrollStatus === 'locked' ? 'text-blue-600' :
              'text-slate-400'
            }`}>receipt_long</span>
          </div>
          <p className="text-sm font-bold text-[var(--color-text)]">
            {payrollStatus === 'draft' ? 'مسودة' :
             payrollStatus === 'finalized' ? 'مُعتمد' :
             payrollStatus === 'locked' ? 'مقفل' : 'لم يُعد'}
          </p>
          <p className="text-[11px] text-[var(--color-text-muted)] font-medium">كشف الرواتب</p>
        </button>
      </div>

      {/* ── Alert Bar ─────────────────────────────────────────────────────── */}
      {alertItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alertItems.map((a, i) => (
            <button
              key={i}
              onClick={() => navigate(a.path)}
              className={`flex items-center gap-2 px-3 py-2 rounded-[var(--border-radius-base)] text-xs font-bold border transition-all hover:shadow-sm
                bg-${a.color}-50 dark:bg-${a.color}-900/20
                border-${a.color}-200 dark:border-${a.color}-800
                text-${a.color}-700 dark:text-${a.color}-400`}
            >
              <span className="material-icons-round text-sm">{a.icon}</span>
              {a.text}
              <span className="material-icons-round text-xs opacity-50">arrow_forward</span>
            </button>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 — الحالة اليومية (Daily Status)
      ═══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-lg font-bold text-[var(--color-text)] mb-4 flex items-center gap-2">
          <span className="material-icons-round text-primary text-xl">today</span>
          الحالة اليومية
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPIBox label="إجمالي الموظفين" value={empKpis.active} icon="groups" colorClass="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" />
          <KPIBox label="حاضرين اليوم" value={attKpis.todayPresent} icon="check_circle" colorClass="bg-emerald-100 text-emerald-600" />
          <KPIBox label="غياب اليوم" value={attKpis.todayAbsent} icon="cancel" colorClass="bg-rose-100 text-rose-600" />
          <KPIBox label="متأخرين اليوم" value={attKpis.todayLate} icon="schedule" colorClass="bg-amber-100 text-amber-600" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2 — نظرة شهرية (Monthly Overview)
      ═══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-lg font-bold text-[var(--color-text)] mb-4 flex items-center gap-2">
          <span className="material-icons-round text-primary text-xl">calendar_month</span>
          النظرة الشهرية — {getMonthKey()}
        </h3>

        {/* Monthly KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center">
            <p className="text-xl font-bold text-sky-600 dark:text-sky-400">{attendance.length}</p>
            <p className="text-[11px] text-[var(--color-text-muted)] font-medium mt-1">سجلات حضور</p>
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center">
            <p className="text-xl font-bold text-amber-600">{formatNumber(attKpis.totalLateMins)}</p>
            <p className="text-[11px] text-[var(--color-text-muted)] font-medium mt-1">دقائق تأخير</p>
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center">
            <p className="text-xl font-bold text-emerald-600">{attKpis.avgHours.toFixed(1)}</p>
            <p className="text-[11px] text-[var(--color-text-muted)] font-medium mt-1">متوسط ساعات</p>
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center">
            <p className="text-xl font-bold text-rose-600">{attKpis.totalAbsences}</p>
            <p className="text-[11px] text-[var(--color-text-muted)] font-medium mt-1">حالات غياب</p>
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center">
            <p className="text-xl font-bold text-blue-600">{leaveKpis.approvedThisMonth}</p>
            <p className="text-[11px] text-[var(--color-text-muted)] font-medium mt-1">إجازات معتمدة</p>
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 text-center">
            <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{loanKpis.activeCount}</p>
            <p className="text-[11px] text-[var(--color-text-muted)] font-medium mt-1">سُلف نشطة</p>
          </div>
        </div>

        {/* Recent Leaves + Loans */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="آخر طلبات الإجازات">
            {recentLeaves.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-6">لا توجد طلبات</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">الموظف</th>
                      <th className="erp-th">النوع</th>
                      <th className="erp-th">الأيام</th>
                      <th className="erp-th">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLeaves.map((l) => {
                      const emp = employees.find((e) => e.id === l.employeeId || e.userId === l.employeeId);
                      return (
                        <tr key={l.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa]/30">
                          <td className="py-2.5 px-2 font-bold text-[var(--color-text)]">{emp?.name || l.employeeId}</td>
                          <td className="py-2.5 px-2 text-slate-500">{LEAVE_TYPE_LABELS[l.leaveType]}</td>
                          <td className="py-2.5 px-2 font-mono text-[var(--color-text-muted)]">{l.totalDays}</td>
                          <td className="py-2.5 px-2">
                            <Badge variant={STATUS_VARIANT[l.finalStatus] ?? 'neutral'}>{STATUS_LABELS[l.finalStatus] ?? l.finalStatus}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={() => navigate('/leave-requests')} className="w-full text-xs text-primary font-bold hover:underline mt-4 flex items-center justify-center gap-1">
              عرض كل الإجازات
              <span className="material-icons-round text-xs">arrow_forward</span>
            </button>
          </Card>

          <Card title="آخر طلبات السُلف">
            {recentLoans.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-6">لا توجد سُلف</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">الموظف</th>
                      <th className="erp-th">النوع</th>
                      <th className="erp-th">المبلغ</th>
                      <th className="erp-th">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLoans.map((l) => (
                      <tr key={l.id} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa]/30">
                        <td className="py-2.5 px-2 font-bold text-[var(--color-text)]">{l.employeeName || l.employeeId}</td>
                        <td className="py-2.5 px-2 text-slate-500">{LOAN_TYPE_LABELS[l.loanType]}</td>
                        <td className="py-2.5 px-2 font-mono text-[var(--color-text-muted)]">{formatCurrency(l.loanAmount)}</td>
                        <td className="py-2.5 px-2">
                          <Badge variant={STATUS_VARIANT[l.status] ?? 'neutral'}>{STATUS_LABELS[l.status] ?? l.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={() => navigate('/loan-requests')} className="w-full text-xs text-primary font-bold hover:underline mt-4 flex items-center justify-center gap-1">
              عرض كل السُلف
              <span className="material-icons-round text-xs">arrow_forward</span>
            </button>
          </Card>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3 — تحليلات (Analytics)
      ═══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h3 className="text-lg font-bold text-[var(--color-text)] mb-4 flex items-center gap-2">
          <span className="material-icons-round text-primary text-xl">analytics</span>
          تحليلات
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Department breakdown */}
          <Card title="توزيع الموظفين حسب القسم">
            {deptBreakdown.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">لا توجد أقسام</p>
            ) : (
              <div className="space-y-3">
                {deptBreakdown.map((d) => {
                  const pct = empKpis.active > 0 ? (d.count / empKpis.active) * 100 : 0;
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-[var(--color-text)] w-28 truncate">{d.name}</span>
                      <div className="flex-1 bg-[#f0f2f5] rounded-full h-4 overflow-hidden">
                        <div
                          className="bg-indigo-500 dark:bg-indigo-400 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-[var(--color-text-muted)] w-8 text-left">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Employment type + Leave type */}
          <div className="space-y-6">
            <Card title="أنواع التوظيف">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(empKpis.byType).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2 p-3 bg-[#f8f9fa]/50 rounded-[var(--border-radius-base)]">
                    <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-[var(--border-radius-sm)] flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-indigo-600 dark:text-indigo-400 text-sm">badge</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-bold text-[var(--color-text)] leading-tight">{count}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-medium truncate">{empTypeLabels[type] || type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="الإجازات المعتمدة حسب النوع">
              {Object.keys(leaveKpis.byType).length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-4">لا توجد بيانات</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(leaveKpis.byType).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2 p-3 bg-[#f8f9fa]/50 rounded-[var(--border-radius-base)]">
                      <div className="w-8 h-8 bg-emerald-100 rounded-[var(--border-radius-sm)] flex items-center justify-center shrink-0">
                        <span className="material-icons-round text-emerald-600 text-sm">beach_access</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-bold text-[var(--color-text)] leading-tight">{count}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)] font-medium truncate">{LEAVE_TYPE_LABELS[type as keyof typeof LEAVE_TYPE_LABELS] || type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Financial summary row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPIBox label="إجمالي الرواتب الأساسية" value={formatCurrency(empKpis.totalSalary)} icon="payments" colorClass="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" />
          <KPIBox label="إجمالي مبالغ السُلف" value={formatCurrency(loanKpis.totalAmount)} icon="monetization_on" colorClass="bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400" />
          <KPIBox label="أيام إجازات هذا الشهر" value={leaveKpis.totalDaysThisMonth} icon="event_busy" colorClass="bg-rose-100 text-rose-600" />
        </div>
      </section>

    </div>
  );
};

