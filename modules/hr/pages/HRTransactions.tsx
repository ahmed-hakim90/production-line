import React, { useState, useMemo, useCallback } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Badge, Button, SearchableSelect } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
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
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';

const TX_CACHE_KEY = 'hr:transactions';

type HRTransactionsPageData = {
  employees: FirestoreEmployee[];
  leaves: FirestoreLeaveRequest[];
  loans: FirestoreEmployeeLoan[];
  allowances: FirestoreEmployeeAllowance[];
  deductions: FirestoreEmployeeDeduction[];
};

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
  leave: 'text-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)/0.1)]',
  loan: 'text-[rgb(var(--color-warning))] bg-[rgb(var(--color-warning)/0.1)]',
  allowance: 'text-[rgb(var(--color-success))] bg-[rgb(var(--color-success)/0.1)]',
  deduction: 'text-[rgb(var(--color-danger))] bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger))]/30',
};

const STATUS_MAP: Record<string, { label: string; color: HRTransaction['statusColor'] }> = {
  approved: { label: 'تم الاعتماد', color: 'green' },
  pending: { label: 'قيد الانتظار', color: 'yellow' },
  rejected: { label: 'مرفوض', color: 'red' },
  active: { label: 'نشط', color: 'green' },
  closed: { label: 'مغلق', color: 'gray' },
  stopped: { label: 'متوقف', color: 'red' },
  disbursed: { label: 'تم الصرف', color: 'blue' },
};

function toDate(val: any): Date {
  if (!val) return new Date(0);
  if (val.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
}

export const HRTransactions: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const permissions = useAppStore((s) => s.userPermissions);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);

  const {
    data,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<HRTransactionsPageData>(
    TX_CACHE_KEY,
    async () => {
      const [emps, lv, lo, al, de] = await Promise.all([
        employeeService.getAll(),
        leaveRequestService.getAll(),
        loanService.getAll(),
        employeeAllowanceService.getAll(),
        employeeDeductionService.getAll(),
      ]);
      return {
        employees: emps,
        leaves: lv,
        loans: lo,
        allowances: al,
        deductions: de,
      };
    },
    { maxAgeMs: 60_000 },
  );

  const employees = data?.employees ?? [];
  const leaves = data?.leaves ?? [];
  const loans = data?.loans ?? [];
  const allowances = data?.allowances ?? [];
  const deductions = data?.deductions ?? [];

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
        .map((e) => ({ value: e.id!, label: `${e.code || ''} — ${e.name}` })),
    [employees],
  );

  const fetchData = useCallback(async () => {
    invalidatePageDataCache(TX_CACHE_KEY);
    await reloadCached(true);
  }, [reloadCached]);

  const transactions = useMemo<HRTransaction[]>(() => {
    const items: HRTransaction[] = [];

    leaves.forEach((l) => {
      const isCancellable =
        l.finalStatus === 'pending' || l.finalStatus === 'approved';
      items.push({
        id: l.id!,
        type: 'leave',
        typeLabel: `إجازة ${LEAVE_TYPE_LABELS[l.leaveType] || l.leaveType}`,
        employeeId: l.employeeId,
        description: `${l.totalDays} يوم — ${l.startDate} → ${l.endDate}${l.reason ? ` (${l.reason})` : ''}`,
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
        typeLabel: LOAN_TYPE_LABELS[l.loanType] || 'سلفة',
        employeeId: l.employeeId,
        description: `${formatCurrency(l.loanAmount)}${l.loanType === 'installment' ? ` — ${l.totalInstallments} قسط (${formatCurrency(l.installmentAmount)}/شهر) — متبقي ${l.remainingInstallments}` : ''}${l.reason ? ` (${l.reason})` : ''}`,
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
        typeLabel: `بدل: ${a.allowanceTypeName}`,
        employeeId: a.employeeId,
        description: `${formatCurrency(a.amount)} — ${a.isRecurring ? 'شهري متكرر' : 'مرة واحدة'} — من ${a.startMonth}${a.endMonth ? ` إلى ${a.endMonth}` : ''}`,
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
        typeLabel: `اقتطاع: ${d.deductionTypeName || d.category}`,
        employeeId: d.employeeId,
        description: `${formatCurrency(d.amount)} — ${d.isRecurring ? 'شهري متكرر' : 'مرة واحدة'} — ${d.reason || ''}`,
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
    if (!confirm('هل تريد إلغاء هذا الإجراء؟')) return;
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
      alert('فشل في الإلغاء');
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
      alert('فشل في الحذف');
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
        alert('أدخل مبلغاً صحيحاً');
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
      alert('فشل في التعديل');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = () => {
    const rows = filtered.map((t) => ({
      'النوع': t.typeLabel,
      'الموظف': getEmpName(t.employeeId),
      'كود الموظف': getEmpCode(t.employeeId),
      'الوصف': t.description,
      'المبلغ': t.amount ?? '',
      'الحالة': STATUS_MAP[t.status]?.label || t.status,
      'التاريخ': t.dateLabel,
    }));
    exportHRData(rows, 'حركات', 'سجل_حركات_الموارد_البشرية');
  };

  const uniqueStatuses = useMemo(() => {
    const s = new Set<string>(transactions.map((t) => t.status));
    return Array.from(s).map((st) => ({
      value: st,
      label: STATUS_MAP[st]?.label || st,
    }));
  }, [transactions]);

  if (loading) {
    return <PageContentSkeleton variant="list" showFilters tableRows={6} />;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="سجل حركات الموارد البشرية"
      rangeLabel="جميع الإجازات والسلف والبدلات والاقتطاعات في مكان واحد"
      actions={
        canExportFromPage ? (
          <Button type="button" variant="outline" onClick={handleExport}>
            <span className="material-icons-round text-sm">download</span>
            تصدير Excel
          </Button>
        ) : undefined
      }
    >

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          onClick={() => setFilterType('all')}
          className={`rounded-[var(--border-radius-lg)] p-3 text-center transition-all border-2 ${filterType === 'all' ? 'border-primary bg-primary/5' : 'border-transparent bg-[var(--color-card)]'}`}
        >
          <div className="text-2xl font-bold text-[var(--color-text)]">{stats.total}</div>
          <div className="text-xs text-[var(--color-text-muted)]">الكل</div>
        </button>
        {([['leave', 'إجازات', 'beach_access'], ['loan', 'سلف', 'payments'], ['allowance', 'بدلات', 'trending_up'], ['deduction', 'اقتطاعات', 'trending_down']] as const).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setFilterType(key)}
            className={`rounded-[var(--border-radius-lg)] p-3 text-center transition-all border-2 ${filterType === key ? 'border-primary bg-primary/5' : 'border-transparent bg-[var(--color-card)]'}`}
          >
            <div className="flex items-center justify-center gap-1">
              <span className={`material-icons-round text-base ${TYPE_COLORS[key].split(' ')[0]}`}>{icon}</span>
              <span className="text-2xl font-bold text-[var(--color-text)]">{stats.byType[key]}</span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
          </button>
        ))}
      </div>

      <OpsDashPanel title="الحركات" accent="hr" bodyClassName="p-0">
        <SmartFilterBar
      pageId="hr-transactions"
          className="mb-0 border-0 rounded-none"
          searchPlaceholder="بحث بالاسم / كود / وصف..."
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'status',
              placeholder: 'جميع الحالات',
              options: uniqueStatuses,
            },
          ]}
          quickFilterValues={{ status: filterStatus }}
          onQuickFilterChange={(key, value) => {
            if (key === 'status') setFilterStatus(value);
          }}
          advancedFilters={[
            {
              key: 'dateFrom',
              label: 'من تاريخ',
              placeholder: 'من',
              type: 'date',
              options: [],
            },
            {
              key: 'dateTo',
              label: 'إلى تاريخ',
              placeholder: 'إلى',
              type: 'date',
              options: [],
            },
          ]}
          advancedFilterValues={{ dateFrom: filterFrom, dateTo: filterTo }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'dateFrom') setFilterFrom(value);
            else if (key === 'dateTo') setFilterTo(value);
          }}
          extra={
            <SearchableSelect
              options={[{ value: '', label: 'كل الموظفين' }, ...empOptions]}
              value={filterEmployee}
              onChange={setFilterEmployee}
              placeholder="تصفية بالموظف..."
              className="sm:w-64"
            />
          }
        />

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--color-text-muted)]">
            <span className="material-icons-round text-5xl mb-2">inbox</span>
            <p className="font-bold">لا توجد حركات</p>
          </div>
        ) : (
          <>
            <div className="erp-mobile-card-list p-2">
              {filtered.map((txn) => (
                <div
                  key={`m-${txn.type}-${txn.id}`}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[var(--border-radius-base)] text-xs font-bold ${TYPE_COLORS[txn.type]}`}>
                      <span className="material-icons-round text-sm">{TYPE_ICONS[txn.type]}</span>
                      {txn.typeLabel}
                    </div>
                    <Badge color={txn.statusColor}>
                      {STATUS_MAP[txn.status]?.label || txn.status}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    className="mt-2 block text-right"
                    onClick={() => {
                      const emp = employees.find(
                        (e) => e.id === txn.employeeId || e.userId === txn.employeeId,
                      );
                      if (emp?.id) navigate(`/hr/employees/${emp.id}`);
                    }}
                  >
                    <p className="text-sm font-bold">{getEmpName(txn.employeeId)}</p>
                    {getEmpCode(txn.employeeId) && (
                      <p className="font-mono text-[10px] text-[var(--color-text-muted)]">{getEmpCode(txn.employeeId)}</p>
                    )}
                  </button>
                  <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{txn.description}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-[10px] text-[var(--color-text-muted)]">المبلغ</dt>
                      <dd className="font-bold">{txn.amount !== null ? formatCurrency(txn.amount) : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-[var(--color-text-muted)]">التاريخ</dt>
                      <dd className="text-xs">{txn.dateLabel}</dd>
                    </div>
                  </dl>
                  {canManage && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {txn.canEdit && (
                        <button type="button" onClick={() => openEdit(txn)} className="p-1.5 rounded text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--color-primary)/0.1)]" title="تعديل" disabled={actionLoading}>
                          <span className="material-icons-round text-lg">edit</span>
                        </button>
                      )}
                      {txn.canCancel && (
                        <button type="button" onClick={() => handleCancel(txn)} className="p-1.5 rounded text-[rgb(var(--color-warning))] hover:bg-[rgb(var(--color-warning)/0.1)]" title="إلغاء" disabled={actionLoading}>
                          <span className="material-icons-round text-lg">block</span>
                        </button>
                      )}
                      {txn.canDelete && (
                        <button type="button" onClick={() => setConfirmDelete(txn)} className="p-1.5 rounded text-[rgb(var(--color-danger))] hover:bg-[rgb(var(--color-danger)/0.1)]" title="حذف" disabled={actionLoading}>
                          <span className="material-icons-round text-lg">delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="erp-desktop-table overflow-x-auto">
            <table className="erp-table w-full min-w-[800px] text-sm">
              <thead className="erp-thead">
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                  <th className="erp-th">النوع</th>
                  <th className="erp-th">الموظف</th>
                  <th className="erp-th">التفاصيل</th>
                  <th className="erp-th">المبلغ</th>
                  <th className="erp-th">الحالة</th>
                  <th className="erp-th">التاريخ</th>
                  {canManage && (
                    <th className="erp-th text-center">إجراءات</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((txn) => (
                  <tr
                    key={`${txn.type}-${txn.id}`}
                    className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg)] transition-colors"
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
                          if (emp?.id) navigate(`/hr/employees/${emp.id}`);
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
                      {txn.amount !== null ? formatCurrency(txn.amount) : '—'}
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
                              className="p-1 rounded hover:bg-[rgb(var(--color-primary)/0.1)] dark:hover:bg-[rgb(var(--color-primary))]/30 text-[rgb(var(--color-primary))] transition-colors"
                              title="تعديل"
                              disabled={actionLoading}
                            >
                              <span className="material-icons-round text-lg">edit</span>
                            </button>
                          )}
                          {txn.canCancel && (
                            <button
                              onClick={() => handleCancel(txn)}
                              className="p-1 rounded hover:bg-[rgb(var(--color-warning)/0.1)] dark:hover:bg-[rgb(var(--color-warning))]/30 text-[rgb(var(--color-warning))] transition-colors"
                              title="إلغاء"
                              disabled={actionLoading}
                            >
                              <span className="material-icons-round text-lg">block</span>
                            </button>
                          )}
                          {txn.canDelete && (
                            <button
                              onClick={() => setConfirmDelete(txn)}
                              className="p-1 rounded hover:bg-[rgb(var(--color-danger)/0.1)] dark:hover:bg-[rgb(var(--color-danger))]/30 text-[rgb(var(--color-danger))] transition-colors"
                              title="حذف"
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
          </>
        )}
      </OpsDashPanel>

      {/* Edit Modal */}
      {editModal && (
        <ManagedModalPortal>
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10050] p-4">
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <span className="material-icons-round text-primary">edit</span>
              تعديل {editModal.typeLabel}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              {getEmpName(editModal.employeeId)} — {editModal.typeLabel}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">المبلغ</label>
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
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">السبب</label>
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
              <Button variant="secondary" size="sm" onClick={() => setEditModal(null)} disabled={actionLoading}>إلغاء</Button>
              <Button size="sm" onClick={handleEditSave} disabled={actionLoading}>
                {actionLoading ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <ManagedModalPortal>
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10050] p-4">
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center">
              <span className="material-icons-round text-5xl text-[rgb(var(--color-danger))] mb-2">warning</span>
              <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">
                تأكيد الحذف
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] mb-1">
                هل تريد حذف هذا الإجراء نهائياً؟
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">
                {confirmDelete.typeLabel} — {getEmpName(confirmDelete.employeeId)}
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)} disabled={actionLoading}>
                تراجع
              </Button>
              <Button
                size="sm"
                onClick={() => handleDelete(confirmDelete)}
                disabled={actionLoading}
                className="!bg-[rgb(var(--color-danger))] hover:!bg-[rgb(var(--color-danger))]"
              >
                {actionLoading ? 'جاري الحذف...' : 'حذف نهائي'}
              </Button>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}
    </ModuleOpsPageShell>
  );
};





