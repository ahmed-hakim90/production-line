import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Button, SearchableSelect, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { getExportImportPageControl } from '@/utils/exportImportControls';
import { employeeService } from '../employeeService';
import { leaveRequestService } from '../leaveService';
import { loanService } from '../loanService';
import {
  employeeAllowanceService,
  employeeDeductionService,
} from '../employeeFinancialsService';
import { exportHRData } from '@/utils/exportExcel';
import { formatCurrency } from '@/utils/calculations';
import type { FirestoreEmployee } from '@/types';
import type {
  FirestoreLeaveRequest,
  FirestoreEmployeeLoan,
  FirestoreEmployeeAllowance,
  FirestoreEmployeeDeduction,
} from '../types';
import { LEAVE_TYPE_LABELS, LOAN_TYPE_LABELS } from '../types';
import { PageHeader } from '../../../components/PageHeader';

type TransactionType = 'all' | 'leave' | 'loan' | 'allowance' | 'deduction';

interface HRTransaction {
  id: string;
  type: 'leave' | 'loan' | 'allowance' | 'deduction';
  typeLabel: string;
  employeeId: string;
  description: string;
  amount: number | null;
  status: string;
  statusColor: 'green' | 'red' | 'yellow' | 'blue' | 'gray';
  date: Date;
  dateLabel: string;
  raw: FirestoreLeaveRequest | FirestoreEmployeeLoan | FirestoreEmployeeAllowance | FirestoreEmployeeDeduction;
  canCancel: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const TYPE_ICONS: Record<HRTransaction['type'], string> = {
  leave: 'beach_access',
  loan: 'payments',
  allowance: 'trending_up',
  deduction: 'trending_down',
};

const TYPE_COLORS: Record<HRTransaction['type'], string> = {
  leave: 'text-blue-600 bg-blue-50',
  loan: 'text-amber-600 bg-amber-50',
  allowance: 'text-emerald-600 bg-emerald-50',
  deduction: 'text-red-600 bg-red-50 dark:bg-red-900/30',
};

const STATUS_MAP: Record<string, { label: string; color: HRTransaction['statusColor'] }> = {
  approved: { label: 'ŘŞŮŘŞ Ř§ŮŮŮŘ§ŮŮŘŠ', color: 'green' },
  pending: { label: 'ŮŮŘŻ Ř§ŮŘ§ŮŘŞŘ¸Ř§Řą', color: 'yellow' },
  rejected: { label: 'ŮŘąŮŮŘś', color: 'red' },
  active: { label: 'ŮŘ´Řˇ', color: 'green' },
  closed: { label: '8&788', color: 'gray' },
  stopped: { label: 'ŮŘŞŮŮŮ', color: 'red' },
  disbursed: { label: 'ŘŞŮ Ř§ŮŘľŘąŮ', color: 'blue' },
};

function toDate(val: any): Date {
  if (!val) return new Date(0);
  if (val.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
}

export const HRTransactions: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
  const permissions = useAppStore((s) => s.userPermissions);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [leaves, setLeaves] = useState<FirestoreLeaveRequest[]>([]);
  const [loans, setLoans] = useState<FirestoreEmployeeLoan[]>([]);
  const [allowances, setAllowances] = useState<FirestoreEmployeeAllowance[]>([]);
  const [deductions, setDeductions] = useState<FirestoreEmployeeDeduction[]>([]);

  const [filterType, setFilterType] = useState<TransactionType>('all');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [search, setSearch] = useState('');

  const [editModal, setEditModal] = useState<HRTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<HRTransaction | null>(null);
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'hrTransactions'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;

  const canManage = permissions['hrSettings.edit'] || permissions['admin'];

  const empNameMap = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach((e) => {
      if (e.id) m.set(e.id, e.name);
      if (e.userId) m.set(e.userId, e.name);
      if (e.code) m.set(e.code, e.name);
    });
    return m;
  }, [employees]);

  const empCodeMap = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach((e) => {
      if (e.id) m.set(e.id, e.code || '');
      if (e.userId) m.set(e.userId, e.code || '');
    });
    return m;
  }, [employees]);

  const getEmpName = useCallback(
    (id: string) => empNameMap.get(id) || id,
    [empNameMap],
  );

  const getEmpCode = useCallback(
    (id: string) => empCodeMap.get(id) || '',
    [empCodeMap],
  );

  const empOptions = useMemo(
    () =>
      employees
        .filter((e) => e.isActive !== false)
        .map((e) => ({ value: e.id!, label: `${e.code || ''} â ${e.name}` })),
    [employees],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, lv, lo, al, de] = await Promise.all([
        employeeService.getAll(),
        leaveRequestService.getAll(),
        loanService.getAll(),
        employeeAllowanceService.getAll(),
        employeeDeductionService.getAll(),
      ]);
      setEmployees(emps);
      setLeaves(lv);
      setLoans(lo);
      setAllowances(al);
      setDeductions(de);
    } catch (err) {
      console.error('Failed to load HR transactions', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const transactions = useMemo<HRTransaction[]>(() => {
    const items: HRTransaction[] = [];

    leaves.forEach((l) => {
      const isCancellable =
        l.finalStatus === 'pending' || l.finalStatus === 'approved';
      items.push({
        id: l.id!,
        type: 'leave',
        typeLabel: `ŘĽŘŹŘ§Ř˛ŘŠ ${LEAVE_TYPE_LABELS[l.leaveType] || l.leaveType}`,
        employeeId: l.employeeId,
        description: `${l.totalDays} ŮŮŮ â ${l.startDate} â ${l.endDate}${l.reason ? ` (${l.reason})` : ''}`,
        amount: null,
        status: l.finalStatus || l.status,
        statusColor: STATUS_MAP[l.finalStatus || l.status]?.color || 'gray',
        date: toDate(l.createdAt),
        dateLabel: toDate(l.createdAt).toLocaleDateString('ar-EG'),
        raw: l,
        canCancel: isCancellable && canManage,
        canEdit: false,
        canDelete: canManage,
      });
    });

    loans.forEach((l) => {
      const status = l.disbursed
        ? 'disbursed'
        : l.status === 'closed'
          ? 'closed'
          : l.finalStatus || 'pending';
      items.push({
        id: l.id!,
        type: 'loan',
        typeLabel: LOAN_TYPE_LABELS[l.loanType] || 'ŘłŮŮŘŠ',
        employeeId: l.employeeId,
        description: `${formatCurrency(l.loanAmount)}${l.loanType === 'installment' ? ` â ${l.totalInstallments} ŮŘłŘˇ (${formatCurrency(l.installmentAmount)}/Ř´ŮŘą) â ŮŘŞŘ¨ŮŮ ${l.remainingInstallments}` : ''}${l.reason ? ` (${l.reason})` : ''}`,
        amount: l.loanAmount,
        status,
        statusColor: STATUS_MAP[status]?.color || 'gray',
        date: toDate(l.createdAt),
        dateLabel: toDate(l.createdAt).toLocaleDateString('ar-EG'),
        raw: l,
        canCancel:
          canManage &&
          l.finalStatus !== 'rejected' &&
          l.status !== 'closed',
        canEdit: false,
        canDelete: canManage,
      });
    });

    allowances.forEach((a) => {
      items.push({
        id: a.id!,
        type: 'allowance',
        typeLabel: `Ř¨ŘŻŮ: ${a.allowanceTypeName}`,
        employeeId: a.employeeId,
        description: `${formatCurrency(a.amount)} â ${a.isRecurring ? 'Ř´ŮŘąŮ ŮŘŞŮŘąŘą' : 'ŮŘąŘŠ ŮŘ§Ř­ŘŻŘŠ'} â ŮŮ ${a.startMonth}${a.endMonth ? ` ŘĽŮŮ ${a.endMonth}` : ''}`,
        amount: a.amount,
        status: a.status,
        statusColor: a.status === 'active' ? 'green' : 'red',
        date: toDate(a.createdAt),
        dateLabel: toDate(a.createdAt).toLocaleDateString('ar-EG'),
        raw: a,
        canCancel: a.status === 'active' && canManage,
        canEdit: a.status === 'active' && canManage,
        canDelete: canManage,
      });
    });

    deductions.forEach((d) => {
      items.push({
        id: d.id!,
        type: 'deduction',
        typeLabel: `Ř§ŘłŘŞŮŘˇŘ§Řš: ${d.deductionTypeName || d.category}`,
        employeeId: d.employeeId,
        description: `${formatCurrency(d.amount)} â ${d.isRecurring ? 'Ř´ŮŘąŮ ŮŘŞŮŘąŘą' : 'ŮŘąŘŠ ŮŘ§Ř­ŘŻŘŠ'} â ${d.reason || ''}`,
        amount: d.amount,
        status: d.status,
        statusColor: d.status === 'active' ? 'green' : 'red',
        date: toDate(d.createdAt),
        dateLabel: toDate(d.createdAt).toLocaleDateString('ar-EG'),
        raw: d,
        canCancel: d.status === 'active' && canManage,
        canEdit: d.status === 'active' && canManage,
        canDelete: canManage,
      });
    });

    items.sort((a, b) => b.date.getTime() - a.date.getTime());
    return items;
  }, [leaves, loans, allowances, deductions, canManage]);

  const filtered = useMemo(() => {
    let result = transactions;
    if (filterType !== 'all') {
      result = result.filter((t) => t.type === filterType);
    }
    if (filterEmployee) {
      result = result.filter((t) => t.employeeId === filterEmployee);
    }
    if (filterStatus) {
      result = result.filter((t) => t.status === filterStatus);
    }
    if (filterFrom) {
      const from = new Date(filterFrom);
      result = result.filter((t) => t.date >= from);
    }
    if (filterTo) {
      const to = new Date(filterTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((t) => t.date <= to);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (t) =>
          getEmpName(t.employeeId).toLowerCase().includes(q) ||
          getEmpCode(t.employeeId).toLowerCase().includes(q) ||
          t.typeLabel.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [transactions, filterType, filterEmployee, filterStatus, filterFrom, filterTo, search, getEmpName, getEmpCode]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const byType = {
      leave: filtered.filter((t) => t.type === 'leave').length,
      loan: filtered.filter((t) => t.type === 'loan').length,
      allowance: filtered.filter((t) => t.type === 'allowance').length,
      deduction: filtered.filter((t) => t.type === 'deduction').length,
    };
    const pending = filtered.filter((t) => t.status === 'pending').length;
    return { total, byType, pending };
  }, [filtered]);

  const handleCancel = async (txn: HRTransaction) => {
    if (!confirm('ŮŮ ŘŞŘąŮŘŻ ŘĽŮŘşŘ§ŘĄ ŮŘ°Ř§ Ř§ŮŘĽŘŹŘąŘ§ŘĄŘ')) return;
    setActionLoading(true);
    try {
      switch (txn.type) {
        case 'leave':
          await leaveRequestService.update(txn.id, {
            finalStatus: 'rejected',
            status: 'rejected',
          } as any);
          break;
        case 'loan':
          await loanService.update(txn.id, {
            finalStatus: 'rejected',
            status: 'closed',
          } as any);
          break;
        case 'allowance':
          await employeeAllowanceService.stop(txn.id);
          break;
        case 'deduction':
          await employeeDeductionService.stop(txn.id);
          break;
      }
      await fetchData();
    } catch (err) {
      console.error('Cancel failed', err);
      alert('ŮŘ´Ů ŮŮ Ř§ŮŘĽŮŘşŘ§ŘĄ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (txn: HRTransaction) => {
    setActionLoading(true);
    try {
      switch (txn.type) {
        case 'leave':
          await leaveRequestService.delete(txn.id);
          break;
        case 'loan':
          await loanService.delete(txn.id);
          break;
        case 'allowance':
          await employeeAllowanceService.delete(txn.id);
          break;
        case 'deduction':
          await employeeDeductionService.delete(txn.id);
          break;
      }
      setConfirmDelete(null);
      await fetchData();
    } catch (err) {
      console.error('Delete failed', err);
      alert('ŮŘ´Ů ŮŮ Ř§ŮŘ­Ř°Ů');
    } finally {
      setActionLoading(false);
    }
  };

  const openEdit = (txn: HRTransaction) => {
    setEditModal(txn);
    setEditAmount(String(txn.amount ?? ''));
    if (txn.type === 'deduction') {
      setEditReason((txn.raw as FirestoreEmployeeDeduction).reason || '');
    } else {
      setEditReason('');
    }
  };

  const handleEditSave = async () => {
    if (!editModal) return;
    setActionLoading(true);
    try {
      const amt = parseFloat(editAmount);
      if (isNaN(amt) || amt <= 0) {
        alert('ŘŁŘŻŘŽŮ ŮŘ¨ŮŘş ŘľŘ­ŮŘ­');
        setActionLoading(false);
        return;
      }
      if (editModal.type === 'allowance') {
        await employeeAllowanceService.update(editModal.id, { amount: amt });
      } else if (editModal.type === 'deduction') {
        await employeeDeductionService.update(editModal.id, {
          amount: amt,
          reason: editReason,
        });
      }
      setEditModal(null);
      await fetchData();
    } catch (err) {
      console.error('Edit failed', err);
      alert('ŮŘ´Ů ŮŮ Ř§ŮŘŞŘšŘŻŮŮ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = () => {
    const rows = filtered.map((t) => ({
      'Ř§ŮŮŮŘš': t.typeLabel,
      'Ř§ŮŮŮŘ¸Ů': getEmpName(t.employeeId),
      'ŮŮŘŻ Ř§ŮŮŮŘ¸Ů': getEmpCode(t.employeeId),
      'Ř§ŮŮŘľŮ': t.description,
      'Ř§ŮŮŘ¨ŮŘş': t.amount ?? '',
      'Ř§ŮŘ­Ř§ŮŘŠ': STATUS_MAP[t.status]?.label || t.status,
      'Ř§ŮŘŞŘ§ŘąŮŘŽ': t.dateLabel,
    }));
    exportHRData(rows, 'Ř­ŘąŮŘ§ŘŞ', 'ŘłŘŹŮ_Ř­ŘąŮŘ§ŘŞ_Ř§ŮŮŮŘ§ŘąŘŻ_Ř§ŮŘ¨Ř´ŘąŮŘŠ');
  };

  const uniqueStatuses = useMemo(() => {
    const s = new Set<string>(transactions.map((t) => t.status));
    return Array.from(s).map((st) => ({
      value: st,
      label: STATUS_MAP[st]?.label || st,
    }));
  }, [transactions]);

  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="ŘłŘŹŮ Ř­ŘąŮŘ§ŘŞ Ř§ŮŮŮŘ§ŘąŘŻ Ř§ŮŘ¨Ř´ŘąŮŘŠ"
        subtitle="ŘŹŮŮŘš Ř§ŮŘĽŘŹŘ§Ř˛Ř§ŘŞ ŮŘ§ŮŘłŮŮ ŮŘ§ŮŘ¨ŘŻŮŘ§ŘŞ ŮŘ§ŮŘ§ŘłŘŞŮŘˇŘ§ŘšŘ§ŘŞ ŮŮ ŮŮŘ§Ů ŮŘ§Ř­ŘŻ"
        icon="receipt_long"
        moreActions={[
          {
            label: 'ŘŞŘľŘŻŮŘą Excel',
            icon: 'download',
            group: 'ŘŞŘľŘŻŮŘą',
            hidden: !canExportFromPage,
            onClick: handleExport,
          },
        ]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          onClick={() => setFilterType('all')}
          className={`rounded-[var(--border-radius-lg)] p-3 text-center transition-all border-2 ${filterType === 'all' ? 'border-primary bg-primary/5' : 'border-transparent bg-[var(--color-card)]'}`}
        >
          <div className="text-2xl font-bold text-[var(--color-text)]">{stats.total}</div>
          <div className="text-xs text-slate-500">Ř§ŮŮŮ</div>
        </button>
        {([['leave', 'ŘĽŘŹŘ§Ř˛Ř§ŘŞ', 'beach_access'], ['loan', 'ŘłŮŮŮ', 'payments'], ['allowance', 'Ř¨ŘŻŮŘ§ŘŞ', 'trending_up'], ['deduction', 'Ř§ŘłŘŞŮŘˇŘ§ŘšŘ§ŘŞ', 'trending_down']] as const).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setFilterType(key)}
            className={`rounded-[var(--border-radius-lg)] p-3 text-center transition-all border-2 ${filterType === key ? 'border-primary bg-primary/5' : 'border-transparent bg-[var(--color-card)]'}`}
          >
            <div className="flex items-center justify-center gap-1">
              <span className={`material-icons-round text-base ${TYPE_COLORS[key].split(' ')[0]}`}>{icon}</span>
              <span className="text-2xl font-bold text-[var(--color-text)]">{stats.byType[key]}</span>
            </div>
            <div className="text-xs text-slate-500">{label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">Ř¨Ř­ŘŤ</label>
            <input
              type="text"
              className="input input-sm w-full"
              placeholder="Ř§ŘłŮ / ŮŮŘŻ / ŮŘľŮ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">Ř§ŮŮŮŘ¸Ů</label>
            <SearchableSelect
              options={empOptions}
              value={filterEmployee}
              onChange={setFilterEmployee}
              placeholder="ŮŮ Ř§ŮŮŮŘ¸ŮŮŮ"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">Ř§ŮŘ­Ř§ŮŘŠ</label>
            <select
              className="input input-sm w-full"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Ř§ŮŮŮ</option>
              {uniqueStatuses.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">ŮŮ ŘŞŘ§ŘąŮŘŽ</label>
            <input
              type="date"
              className="input input-sm w-full"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">ŘĽŮŮ ŘŞŘ§ŘąŮŘŽ</label>
            <input
              type="date"
              className="input input-sm w-full"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
        </div>
        {(filterType !== 'all' || filterEmployee || filterStatus || filterFrom || filterTo || search) && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span className="material-icons-round text-sm">filter_list</span>
            ŘšŘąŘś {filtered.length} ŮŮ {transactions.length} Ř­ŘąŮŘŠ
            <button
              className="text-primary hover:underline"
              onClick={() => {
                setFilterType('all');
                setFilterEmployee('');
                setFilterStatus('');
                setFilterFrom('');
                setFilterTo('');
                setSearch('');
              }}
            >
              ŮŘłŘ­ Ř§ŮŮŮŘŞŘą
            </button>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-5xl mb-2">inbox</span>
            <p className="font-bold">ŮŘ§ ŘŞŮŘŹŘŻ Ř­ŘąŮŘ§ŘŞ</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="erp-thead">
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                  <th className="erp-th">Ř§ŮŮŮŘš</th>
                  <th className="erp-th">Ř§ŮŮŮŘ¸Ů</th>
                  <th className="erp-th">Ř§ŮŘŞŮŘ§ŘľŮŮ</th>
                  <th className="erp-th">Ř§ŮŮŘ¨ŮŘş</th>
                  <th className="erp-th">Ř§ŮŘ­Ř§ŮŘŠ</th>
                  <th className="erp-th">Ř§ŮŘŞŘ§ŘąŮŘŽ</th>
                  {canManage && (
                    <th className="erp-th text-center">ŘĽŘŹŘąŘ§ŘĄŘ§ŘŞ</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((txn) => (
                  <tr
                    key={`${txn.type}-${txn.id}`}
                    className="border-b border-[var(--color-border)]/50 hover:bg-[#f8f9fa] transition-colors"
                  >
                    <td className="py-3 px-2">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[var(--border-radius-base)] text-xs font-bold ${TYPE_COLORS[txn.type]}`}>
                        <span className="material-icons-round text-sm">{TYPE_ICONS[txn.type]}</span>
                        {txn.typeLabel}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <button
                        className="text-right hover:text-primary transition-colors"
                        onClick={() => {
                          const emp = employees.find(
                            (e) => e.id === txn.employeeId || e.userId === txn.employeeId,
                          );
                          if (emp?.id) navigate(`/employees/${emp.id}`);
                        }}
                      >
                        <div className="font-bold text-[var(--color-text)] text-sm">
                          {getEmpName(txn.employeeId)}
                        </div>
                        {getEmpCode(txn.employeeId) && (
                          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                            {getEmpCode(txn.employeeId)}
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-2 text-[var(--color-text-muted)] max-w-xs truncate">
                      {txn.description}
                    </td>
                    <td className="py-3 px-2 font-bold text-[var(--color-text)] whitespace-nowrap">
                      {txn.amount !== null ? formatCurrency(txn.amount) : 'â'}
                    </td>
                    <td className="py-3 px-2">
                      <Badge color={txn.statusColor}>
                        {STATUS_MAP[txn.status]?.label || txn.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-2 text-[var(--color-text-muted)] text-xs whitespace-nowrap">
                      {txn.dateLabel}
                    </td>
                    {canManage && (
                      <td className="py-3 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {txn.canEdit && (
                            <button
                              onClick={() => openEdit(txn)}
                              className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500 transition-colors"
                              title="ŘŞŘšŘŻŮŮ"
                              disabled={actionLoading}
                            >
                              <span className="material-icons-round text-lg">edit</span>
                            </button>
                          )}
                          {txn.canCancel && (
                            <button
                              onClick={() => handleCancel(txn)}
                              className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-500 transition-colors"
                              title="ŘĽŮŘşŘ§ŘĄ"
                              disabled={actionLoading}
                            >
                              <span className="material-icons-round text-lg">block</span>
                            </button>
                          )}
                          {txn.canDelete && (
                            <button
                              onClick={() => setConfirmDelete(txn)}
                              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                              title="Ř­Ř°Ů"
                              disabled={actionLoading}
                            >
                              <span className="material-icons-round text-lg">delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <span className="material-icons-round text-primary">edit</span>
              ŘŞŘšŘŻŮŮ {editModal.typeLabel}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              {getEmpName(editModal.employeeId)} â {editModal.typeLabel}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">Ř§ŮŮŘ¨ŮŘş</label>
                <input
                  type="number"
                  className="input w-full"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  min={0}
                />
              </div>
              {editModal.type === 'deduction' && (
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">Ř§ŮŘłŘ¨Ř¨</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" size="sm" onClick={() => setEditModal(null)} disabled={actionLoading}>
                ŘĽŮŘşŘ§ŘĄ
              </Button>
              <Button size="sm" onClick={handleEditSave} disabled={actionLoading}>
                {actionLoading ? 'ŘŹŘ§ŘąŮ Ř§ŮŘ­ŮŘ¸...' : 'Ř­ŮŘ¸'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center">
              <span className="material-icons-round text-5xl text-red-500 mb-2">warning</span>
              <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">
                ŘŞŘŁŮŮŘŻ Ř§ŮŘ­Ř°Ů
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] mb-1">
                ŮŮ ŘŞŘąŮŘŻ Ř­Ř°Ů ŮŘ°Ř§ Ř§ŮŘĽŘŹŘąŘ§ŘĄ ŮŮŘ§ŘŚŮŘ§ŮŘ
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">
                {confirmDelete.typeLabel} â {getEmpName(confirmDelete.employeeId)}
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)} disabled={actionLoading}>
                ŘŞŘąŘ§ŘŹŘš
              </Button>
              <Button
                size="sm"
                onClick={() => handleDelete(confirmDelete)}
                disabled={actionLoading}
                className="!bg-red-600 hover:!bg-red-700"
              >
                {actionLoading ? 'ŘŹŘ§ŘąŮ Ř§ŮŘ­Ř°Ů...' : 'Ř­Ř°Ů ŮŮŘ§ŘŚŮ'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

