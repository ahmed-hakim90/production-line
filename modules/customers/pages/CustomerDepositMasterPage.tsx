import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { toast } from '../../../components/Toast';
import { withTenantPath } from '../../../lib/tenantPaths';
import { customerDepositCustomerService } from '../services/customerDepositCustomerService';
import { customerDepositBankAccountService } from '../services/customerDepositBankAccountService';
import { customerDepositAdjustmentService } from '../services/customerDepositAdjustmentService';
import { customerDepositEntryService } from '../services/customerDepositEntryService';
import type {
  CustomerDepositAdjustment,
  CustomerDepositCompanyBankAccount,
  CustomerDepositCustomer,
  CustomerDepositEntry,
} from '../types';
import { companyBankCashBalance, customerReceivableBalance } from '../utils/balances';
import { parseNumericField } from '../utils/numericField';
import { normalizeCustomerCode } from '../utils/normalize';
import { usePermission } from '../../../utils/permissions';
import { CustomerDepositsPackImportExportSection } from '../components/CustomerDepositsPackImportExportSection';
import { CustomerDepositCustomerDrawer } from '../components/CustomerDepositCustomerDrawer';
import { CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE, useClientTablePagination } from '../hooks/useClientTablePagination';
import { OnlineDataPaginationFooter } from '../../online/components/OnlineDataPaginationFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowDown, ArrowUp, ChevronsUpDown, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

const moneyLocaleOpts: Intl.NumberFormatOptions = {
  numberingSystem: 'latn',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

const fmtMoney = (n: number) =>
  (Number(n) || 0).toLocaleString('ar-EG', moneyLocaleOpts);

function firestoreTsToMillis(ts: unknown): number {
  if (ts == null || typeof ts !== 'object') return 0;
  const t = ts as { toMillis?: () => number; toDate?: () => Date };
  if (typeof t.toMillis === 'function') {
    const m = t.toMillis();
    return typeof m === 'number' && !Number.isNaN(m) ? m : 0;
  }
  if (typeof t.toDate === 'function') {
    const d = t.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  }
  return 0;
}

function formatShortUpdatedAt(ts: unknown): string {
  const ms = firestoreTsToMillis(ts);
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('ar-EG', { dateStyle: 'short' });
}

const safeMoney = (v: unknown) => {
  const n = parseNumericField(v);
  if (n === null) return '—';
  return n.toLocaleString('ar-EG', moneyLocaleOpts);
};

type TabKey = 'customers' | 'banks' | 'adjustments' | 'pack';

type CustomerTableSortKey = 'code' | 'name' | 'opening' | 'official' | 'active' | 'updated';
type BankTableSortKey = 'account' | 'label' | 'opening' | 'official' | 'pending' | 'updated';
type AdjustmentTableSortKey = 'date' | 'amount' | 'note';

function customerCodeKey(c: CustomerDepositCustomer): string {
  const raw = String(c.codeNormalized ?? '').trim() || normalizeCustomerCode(c.code ?? '');
  return raw;
}

function customerIsReferencedInDeposits(
  customerId: string,
  entries: CustomerDepositEntry[],
  adjustments: CustomerDepositAdjustment[],
): boolean {
  return (
    entries.some((e) => e.customerId === customerId) ||
    adjustments.some((a) => a.customerId === customerId)
  );
}

/** يُبقى سجلًا واحدًا لكل مجموعة مكررة: الأحدث تحديثًا ثم أصغر معرّف مستند. */
function pickKeeperCustomerIdForDuplicateGroup(group: CustomerDepositCustomer[]): string {
  if (group.length === 0) return '';
  const sorted = [...group].sort((a, b) => {
    const ma = firestoreTsToMillis(a.updatedAt);
    const mb = firestoreTsToMillis(b.updatedAt);
    if (mb !== ma) return mb - ma;
    return a.id.localeCompare(b.id);
  });
  return sorted[0].id;
}

export const CustomerDepositMasterPage: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const navigate = useNavigate();
  const tp = (path: string) => withTenantPath(tenantSlug, path);
  const { can } = usePermission();
  const canManageDeposits = can('customerDeposits.manage');
  const [tab, setTab] = useState<TabKey>('customers');

  const [customers, setCustomers] = useState<CustomerDepositCustomer[]>([]);
  const [banks, setBanks] = useState<CustomerDepositCompanyBankAccount[]>([]);
  const [adjustments, setAdjustments] = useState<CustomerDepositAdjustment[]>([]);
  const [entriesAll, setEntriesAll] = useState<CustomerDepositEntry[]>([]);
  const [adjustmentsAll, setAdjustmentsAll] = useState<CustomerDepositAdjustment[]>([]);
  const [resetOpeningDialogOpen, setResetOpeningDialogOpen] = useState(false);
  const [resetOpeningConfirm, setResetOpeningConfirm] = useState('');
  const [resetOpeningBusy, setResetOpeningBusy] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addBankOpen, setAddBankOpen] = useState(false);
  const [addAdjustmentOpen, setAddAdjustmentOpen] = useState(false);
  const [deleteDupTarget, setDeleteDupTarget] = useState<CustomerDepositCustomer | null>(null);
  const [deleteDupBusy, setDeleteDupBusy] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);

  const bankCashById = useMemo(() => {
    const m = new Map<string, { official: number; pendingInflow: number }>();
    for (const b of banks) {
      m.set(b.id, companyBankCashBalance(b, entriesAll, adjustmentsAll));
    }
    return m;
  }, [banks, entriesAll, adjustmentsAll]);

  const customerReceivableById = useMemo(() => {
    const m = new Map<string, { official: number; pendingDeposits: number }>();
    for (const c of customers) {
      m.set(c.id, customerReceivableBalance(c, entriesAll, adjustmentsAll));
    }
    return m;
  }, [customers, entriesAll, adjustmentsAll]);

  /** أكواد لها أكثر من مستند عميل (نفس codeNormalized). */
  const customersByNormalizedCode = useMemo(() => {
    const m = new Map<string, CustomerDepositCustomer[]>();
    for (const c of customers) {
      const key = customerCodeKey(c);
      if (!key) continue;
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }
    return m;
  }, [customers]);

  const duplicateCustomerCodeKeys = useMemo(() => {
    const keys: string[] = [];
    for (const [k, arr] of customersByNormalizedCode) {
      if (arr.length > 1) keys.push(k);
    }
    return keys.sort((a, b) => a.localeCompare(b, 'ar', { numeric: true, sensitivity: 'base' }));
  }, [customersByNormalizedCode]);

  const isCustomerRowCodeDuplicate = useCallback(
    (c: CustomerDepositCustomer) => {
      const key = customerCodeKey(c);
      return Boolean(key && (customersByNormalizedCode.get(key)?.length ?? 0) > 1);
    },
    [customersByNormalizedCode],
  );

  const canDeleteAsEmptyDuplicate = useCallback(
    (c: CustomerDepositCustomer) => {
      if (!isCustomerRowCodeDuplicate(c)) return false;
      if (customerIsReferencedInDeposits(c.id, entriesAll, adjustmentsAll)) return false;
      const ob = Number(c.openingBalance) || 0;
      if (ob !== 0) return false;
      const recv = customerReceivableById.get(c.id);
      const official = recv?.official ?? 0;
      const pending = recv?.pendingDeposits ?? 0;
      return official === 0 && pending === 0;
    },
    [customerReceivableById, entriesAll, adjustmentsAll, isCustomerRowCodeDuplicate],
  );

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSortKey, setCustomerSortKey] = useState<CustomerTableSortKey | null>(null);
  const [customerSortDir, setCustomerSortDir] = useState<'asc' | 'desc'>('asc');

  const customersFilteredSorted = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    let list = customers;
    if (q) {
      list = customers.filter((c) => {
        const official = customerReceivableById.get(c.id)?.official ?? 0;
        const blob = [
          c.code,
          c.codeNormalized,
          c.name,
          String(c.openingBalance),
          official.toFixed(2),
          c.isActive ? 'نعم' : 'لا',
        ]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    if (!customerSortKey) {
      return [...list].sort((a, b) => {
        const cmp = (a.code || '').localeCompare(b.code || '', 'ar', { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      });
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (customerSortKey) {
        case 'code':
          cmp = (a.code || '').localeCompare(b.code || '', 'ar', { numeric: true, sensitivity: 'base' });
          break;
        case 'name':
          cmp = (a.name || '').localeCompare(b.name || '', 'ar', { sensitivity: 'base' });
          break;
        case 'opening':
          cmp = (Number(a.openingBalance) || 0) - (Number(b.openingBalance) || 0);
          break;
        case 'official':
          cmp =
            (customerReceivableById.get(a.id)?.official ?? 0) -
            (customerReceivableById.get(b.id)?.official ?? 0);
          break;
        case 'active':
          cmp = (a.isActive === b.isActive ? 0 : a.isActive ? 1 : -1);
          break;
        case 'updated':
          cmp = firestoreTsToMillis(a.updatedAt) - firestoreTsToMillis(b.updatedAt);
          break;
        default:
          break;
      }
      return customerSortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [
    customers,
    customerReceivableById,
    customerSearch,
    customerSortDir,
    customerSortKey,
  ]);

  const customersPg = useClientTablePagination(
    customersFilteredSorted,
    CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE,
    `${customerSearch}\0${customerSortKey ?? ''}\0${customerSortDir}`,
  );

  const pageCustomerIds = useMemo(() => customersPg.slice.map((c) => c.id), [customersPg.slice]);

  const pageSelectionState = useMemo(() => {
    if (pageCustomerIds.length === 0) return { all: false, some: false };
    let sel = 0;
    for (const id of pageCustomerIds) {
      if (selectedCustomerIds.has(id)) sel++;
    }
    return {
      all: sel === pageCustomerIds.length,
      some: sel > 0 && sel < pageCustomerIds.length,
    };
  }, [pageCustomerIds, selectedCustomerIds]);

  const toggleCustomerSelected = useCallback((id: string) => {
    setSelectedCustomerIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedCustomerIds((prev) => {
      const n = new Set(prev);
      const ids = customersPg.slice.map((c) => c.id);
      const allOn = ids.length > 0 && ids.every((id) => n.has(id));
      if (allOn) {
        for (const id of ids) n.delete(id);
      } else {
        for (const id of ids) n.add(id);
      }
      return n;
    });
  }, [customersPg.slice]);

  const selectDeletableDuplicatesExceptKeepers = useCallback(() => {
    const next = new Set<string>();
    for (const key of duplicateCustomerCodeKeys) {
      const group = customersByNormalizedCode.get(key) ?? [];
      if (group.length < 2) continue;
      const keeper = pickKeeperCustomerIdForDuplicateGroup(group);
      for (const c of group) {
        if (c.id === keeper) continue;
        if (canDeleteAsEmptyDuplicate(c)) next.add(c.id);
      }
    }
    setSelectedCustomerIds(next);
    toast.success(
      next.size > 0
        ? `تم تحديد ${next.size} عميلًا للحذف (أُبقي أحدث تحديث لكل كود مكرر). راجع ثم اضغط «حذف المحدد».`
        : 'لا توجد نسخ مكررة فارغة قابلة للحذف بهذه القاعدة.',
    );
  }, [duplicateCustomerCodeKeys, customersByNormalizedCode, canDeleteAsEmptyDuplicate]);

  const bulkDeletePreview = useMemo(() => {
    const selected = customers.filter((c) => selectedCustomerIds.has(c.id));
    const deletable: CustomerDepositCustomer[] = [];
    const skipped: CustomerDepositCustomer[] = [];
    for (const c of selected) {
      if (canDeleteAsEmptyDuplicate(c)) deletable.push(c);
      else skipped.push(c);
    }
    return { deletable, skipped };
  }, [customers, selectedCustomerIds, canDeleteAsEmptyDuplicate]);

  const toggleCustomerSort = (key: CustomerTableSortKey) => {
    if (customerSortKey === key) {
      setCustomerSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setCustomerSortKey(key);
    setCustomerSortDir(key === 'updated' ? 'desc' : 'asc');
  };

  const customerSortIcon = (key: CustomerTableSortKey) => {
    if (customerSortKey !== key) {
      return <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
    }
    return customerSortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
    );
  };

  const [bankSearch, setBankSearch] = useState('');
  const [bankSortKey, setBankSortKey] = useState<BankTableSortKey | null>(null);
  const [bankSortDir, setBankSortDir] = useState<'asc' | 'desc'>('asc');

  const banksFilteredSorted = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    let list = banks;
    if (q) {
      list = banks.filter((b) => {
        const cash = bankCashById.get(b.id) ?? { official: 0, pendingInflow: 0 };
        const blob = [
          b.accountNumber,
          b.accountNumberNormalized,
          b.bankLabel,
          String(b.openingBalance),
          cash.official.toFixed(2),
          cash.pendingInflow.toFixed(2),
        ]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    if (!bankSortKey) return list;
    return [...list].sort((a, b) => {
      const cashA = bankCashById.get(a.id) ?? { official: 0, pendingInflow: 0 };
      const cashB = bankCashById.get(b.id) ?? { official: 0, pendingInflow: 0 };
      let cmp = 0;
      switch (bankSortKey) {
        case 'account':
          cmp = (a.accountNumber || '').localeCompare(b.accountNumber || '', 'ar', {
            numeric: true,
            sensitivity: 'base',
          });
          break;
        case 'label':
          cmp = (a.bankLabel || '').localeCompare(b.bankLabel || '', 'ar', { sensitivity: 'base' });
          break;
        case 'opening':
          cmp = (Number(a.openingBalance) || 0) - (Number(b.openingBalance) || 0);
          break;
        case 'official':
          cmp = cashA.official - cashB.official;
          break;
        case 'pending':
          cmp = cashA.pendingInflow - cashB.pendingInflow;
          break;
        case 'updated':
          cmp = firestoreTsToMillis(a.updatedAt) - firestoreTsToMillis(b.updatedAt);
          break;
        default:
          break;
      }
      return bankSortDir === 'asc' ? cmp : -cmp;
    });
  }, [bankCashById, bankSearch, bankSortDir, bankSortKey, banks]);

  const banksPg = useClientTablePagination(
    banksFilteredSorted,
    CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE,
    `${bankSearch}\0${bankSortKey ?? ''}\0${bankSortDir}`,
  );

  const toggleBankSort = (key: BankTableSortKey) => {
    if (bankSortKey === key) {
      setBankSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setBankSortKey(key);
    setBankSortDir(key === 'updated' ? 'desc' : 'asc');
  };

  const bankSortIcon = (key: BankTableSortKey) => {
    if (bankSortKey !== key) {
      return <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
    }
    return bankSortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
    );
  };

  const [adjustmentSearch, setAdjustmentSearch] = useState('');
  const [adjustmentSortKey, setAdjustmentSortKey] = useState<AdjustmentTableSortKey | null>(null);
  const [adjustmentSortDir, setAdjustmentSortDir] = useState<'asc' | 'desc'>('asc');

  const adjustmentsFilteredSorted = useMemo(() => {
    const custMap = new Map(customers.map((c) => [c.id, c] as const));
    const bnkMap = new Map(banks.map((b) => [b.id, b] as const));
    const q = adjustmentSearch.trim().toLowerCase();
    let list = adjustments;
    if (q) {
      list = adjustments.filter((a) => {
        const cust = a.customerId ? custMap.get(a.customerId) : undefined;
        const bank = a.companyBankAccountId ? bnkMap.get(a.companyBankAccountId) : undefined;
        const blob = [
          a.effectiveDate,
          String(a.signedAmount),
          a.note ?? '',
          cust ? `${cust.code} ${cust.name}` : '',
          bank ? `${bank.accountNumber} ${bank.bankLabel}` : '',
        ]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    if (!adjustmentSortKey) return list;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (adjustmentSortKey) {
        case 'date':
          cmp = (a.effectiveDate || '').localeCompare(b.effectiveDate || '', 'ar');
          break;
        case 'amount':
          cmp = (Number(a.signedAmount) || 0) - (Number(b.signedAmount) || 0);
          break;
        case 'note':
          cmp = (a.note || '').localeCompare(b.note || '', 'ar', { sensitivity: 'base' });
          break;
        default:
          break;
      }
      return adjustmentSortDir === 'asc' ? cmp : -cmp;
    });
  }, [adjustments, adjustmentSearch, adjustmentSortDir, adjustmentSortKey, banks, customers]);

  const adjustmentsPg = useClientTablePagination(
    adjustmentsFilteredSorted,
    CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE,
    `${adjustmentSearch}\0${adjustmentSortKey ?? ''}\0${adjustmentSortDir}`,
  );

  const toggleAdjustmentSort = (key: AdjustmentTableSortKey) => {
    if (adjustmentSortKey === key) {
      setAdjustmentSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setAdjustmentSortKey(key);
    setAdjustmentSortDir('asc');
  };

  const adjustmentSortIcon = (key: AdjustmentTableSortKey) => {
    if (adjustmentSortKey !== key) {
      return <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
    }
    return adjustmentSortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
    );
  };

  const customerNavIds = useMemo(() => customersFilteredSorted.map((c) => c.id), [customersFilteredSorted]);
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);
  const [customerDrawerId, setCustomerDrawerId] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'customers') {
      setCustomerDrawerOpen(false);
      setCustomerDrawerId(null);
      setSelectedCustomerIds(new Set());
      setBulkDeleteDialogOpen(false);
    }
  }, [tab]);

  useEffect(() => {
    const valid = new Set(customers.map((c) => c.id));
    setSelectedCustomerIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size === prev.size && [...prev].every((id) => next.has(id))) return prev;
      return next;
    });
  }, [customers]);

  useEffect(() => {
    setAddCustomerOpen(false);
    setAddBankOpen(false);
    setAddAdjustmentOpen(false);
  }, [tab]);

  const loadAll = useCallback(async () => {
    const [c, b, adj, ent, adjAll] = await Promise.all([
      customerDepositCustomerService.getAll(),
      customerDepositBankAccountService.getAll(),
      customerDepositAdjustmentService.listRecent(200),
      customerDepositEntryService.listAllForExport(),
      customerDepositAdjustmentService.listAllForExport(),
    ]);
    setCustomers(c);
    setBanks(b);
    setAdjustments(adj);
    setEntriesAll(ent);
    setAdjustmentsAll(adjAll);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const confirmDeleteDuplicateCustomer = async () => {
    if (!deleteDupTarget) return;
    if (!canDeleteAsEmptyDuplicate(deleteDupTarget)) {
      toast.error('لا يمكن حذف هذا السجل وفق الشروط الحالية.');
      return;
    }
    setDeleteDupBusy(true);
    try {
      await customerDepositCustomerService.delete(deleteDupTarget.id);
      toast.success('تم حذف نسخة العميل الزائدة.');
      setDeleteDupTarget(null);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'فشل الحذف');
    } finally {
      setDeleteDupBusy(false);
    }
  };

  const confirmBulkDeleteDuplicateCustomers = useCallback(async () => {
    const selected = customers.filter((c) => selectedCustomerIds.has(c.id));
    const deletable = selected.filter((c) => canDeleteAsEmptyDuplicate(c));
    const skipped = selected.length - deletable.length;
    if (deletable.length === 0) {
      toast.error('لا يوجد في المحدد صفوف تستوفي شروط الحذف (مكرر فارغ بلا حركات).');
      setBulkDeleteDialogOpen(false);
      return;
    }
    setBulkDeleteBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const c of deletable) {
        try {
          await customerDepositCustomerService.delete(c.id);
          ok++;
        } catch {
          fail++;
        }
      }
      setSelectedCustomerIds((prev) => {
        const n = new Set(prev);
        for (const c of deletable) n.delete(c.id);
        return n;
      });
      setBulkDeleteDialogOpen(false);
      await loadAll();
      const parts = [`حُذف ${ok} عميلًا.`];
      if (fail > 0) parts.push(`فشل ${fail}.`);
      if (skipped > 0) parts.push(`تُرك ${skipped} محددًا لأنها لا تقبل الحذف الجماعي.`);
      toast.success(parts.join(' '));
    } finally {
      setBulkDeleteBusy(false);
    }
  }, [customers, selectedCustomerIds, canDeleteAsEmptyDuplicate, loadAll]);

  const [cCode, setCCode] = useState('');
  const [cName, setCName] = useState('');
  const [cOpen, setCOpen] = useState('0');
  const [bAcc, setBAcc] = useState('');
  const [bLabel, setBLabel] = useState('');
  const [bOpen, setBOpen] = useState('0');
  const [adjDate, setAdjDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adjAmt, setAdjAmt] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjCustomerId, setAdjCustomerId] = useState('');
  const [adjBankId, setAdjBankId] = useState('');

  const addCustomer = async () => {
    try {
      await customerDepositCustomerService.create({
        code: cCode,
        name: cName,
        openingBalance: Number(cOpen) || 0,
      });
      toast.success('تم إضافة العميل');
      setCCode('');
      setCName('');
      setCOpen('0');
      setAddCustomerOpen(false);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    }
  };

  const addBank = async () => {
    try {
      await customerDepositBankAccountService.create({
        accountNumber: bAcc,
        bankLabel: bLabel,
        openingBalance: Number(bOpen) || 0,
      });
      toast.success('تم إضافة الحساب');
      setBAcc('');
      setBLabel('');
      setBOpen('0');
      setAddBankOpen(false);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    }
  };

  const confirmResetCustomerOpeningBalances = async () => {
    if (resetOpeningConfirm.trim() !== 'تصفير') {
      toast.error('اكتب كلمة «تصفير» للتأكيد');
      return;
    }
    setResetOpeningBusy(true);
    try {
      const { updated } = await customerDepositCustomerService.resetAllOpeningBalances();
      toast.success(`تم ضبط الرصيد الافتتاحي إلى صفر لـ ${updated} عميل.`);
      setResetOpeningDialogOpen(false);
      setResetOpeningConfirm('');
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'فشل التصفير');
    } finally {
      setResetOpeningBusy(false);
    }
  };

  const addAdjustment = async () => {
    if (!adjCustomerId && !adjBankId) {
      toast.error('اختر عميلًا أو حساب بنك للتسوية');
      return;
    }
    try {
      await customerDepositAdjustmentService.create({
        effectiveDate: adjDate,
        signedAmount: Number(adjAmt),
        note: adjNote,
        customerId: adjCustomerId || undefined,
        companyBankAccountId: adjBankId || undefined,
      });
      toast.success('تمت التسوية');
      setAdjAmt('');
      setAdjNote('');
      setAddAdjustmentOpen(false);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    }
  };

  const tabBtn = (k: TabKey, label: string) => (
    <Button type="button" variant={tab === k ? 'default' : 'outline'} size="sm" onClick={() => setTab(k)}>
      {label}
    </Button>
  );

  return (
    <div className="erp-page mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="إعدادات العملاء والبنوك"
        subtitle="ماستر الأكواد والحسابات والتسويات"
        icon="settings"
        secondaryAction={{
          label: 'قائمة الإيداعات',
          icon: 'layout_dashboard',
          onClick: () => navigate(tp('/customers/deposits')),
        }}
      />
      <div className="flex flex-wrap gap-2">
        {tabBtn('customers', 'العملاء')}
        {tabBtn('banks', 'حسابات البنك')}
        {tabBtn('adjustments', 'تسويات')}
        {tabBtn('pack', 'تصدير / استيراد')}
      </div>

      {tab === 'customers' && (
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-sm font-semibold">قائمة العملاء</CardTitle>
                  <CardDescription className="text-xs">
                    «ذمة معتمدة» = رصيد افتتاحي الذمم ناقص إيداعات مؤكدة زائد تسويات مرتبطة بالعميل (نفس منطق صفحة
                    الكشف). انقر صفاً لعرض تفاصيل العميل والحركات في درج جانبي.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  title="إضافة عميل"
                  aria-label="إضافة عميل"
                  onClick={() => setAddCustomerOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-b border-border px-4 py-3">
                <Label htmlFor="customer-master-search" className="sr-only">
                  بحث في العملاء
                </Label>
                <Input
                  id="customer-master-search"
                  type="search"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="بحث: الكود، الاسم، الأرصدة، نشط…"
                  className="max-w-md"
                  dir="rtl"
                />
              </div>
              {canManageDeposits ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2 text-xs sm:text-sm">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={customersPg.slice.length === 0}
                    onClick={() => toggleSelectAllOnPage()}
                  >
                    {pageSelectionState.all ? 'إلغاء تحديد الصفحة الحالية' : 'تحديد كل صفوف الصفحة الحالية'}
                  </Button>
                  {duplicateCustomerCodeKeys.length > 0 ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => selectDeletableDuplicatesExceptKeepers()}>
                      تحديد المكررات الفارغة (إبقاء أحدث تحديث لكل كود)
                    </Button>
                  ) : null}
                  {selectedCustomerIds.size > 0 ? (
                    <>
                      <span className="text-muted-foreground">محدد: {selectedCustomerIds.size}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedCustomerIds(new Set())}>
                        مسح التحديد
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => setBulkDeleteDialogOpen(true)}>
                        حذف المحدد…
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
              {duplicateCustomerCodeKeys.length > 0 ? (
                <div
                  className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-50"
                  role="status"
                >
                  <p className="font-semibold">
                    تنبيه: يوجد أكثر من عميل لنفس الكود ({duplicateCustomerCodeKeys.length} كودًا مكررًا في القاعدة)
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed opacity-95">
                    الصفوف ذات الخلفية الصفراء = نفس <span className="font-medium">الكود المطبّع</span>. احذف النسخة
                    الزائدة بزر سلة المهملات أو عبر تحديد عدة صفوف ثم «حذف المحدد» عندما يكون السجل بلا إيداعات أو
                    تسويات ورصيد افتتاحي وذمة معتمدة = صفر. يمكنك «تحديد المكررات الفارغة» للإبقاء على أحدث تحديث لكل
                    كود. إذا كانت الحركات على النسخة «الخاطئة»، صحّح الإيداعات أو التسويات أولًا ثم احذف الفارغ.
                  </p>
                </div>
              ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                {canManageDeposits ? (
                  <TableHead className="w-11 px-2 text-center">
                    <div className="flex justify-center py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={
                          pageSelectionState.all
                            ? true
                            : pageSelectionState.some
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={() => toggleSelectAllOnPage()}
                        disabled={customersPg.slice.length === 0}
                        aria-label="تحديد أو إلغاء تحديد كل صفوف الصفحة الحالية"
                      />
                    </div>
                  </TableHead>
                ) : null}
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    customerSortKey === 'code'
                      ? customerSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60',
                    )}
                    onClick={() => toggleCustomerSort('code')}
                  >
                    الكود
                    {customerSortIcon('code')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    customerSortKey === 'name'
                      ? customerSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleCustomerSort('name')}
                  >
                    الاسم
                    {customerSortIcon('name')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    customerSortKey === 'opening'
                      ? customerSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleCustomerSort('opening')}
                  >
                    رصيد افتتاحي
                    {customerSortIcon('opening')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    customerSortKey === 'official'
                      ? customerSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleCustomerSort('official')}
                  >
                    ذمة معتمدة
                    {customerSortIcon('official')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    customerSortKey === 'active'
                      ? customerSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleCustomerSort('active')}
                  >
                    نشط
                    {customerSortIcon('active')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    customerSortKey === 'updated'
                      ? customerSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleCustomerSort('updated')}
                  >
                    آخر تحديث
                    {customerSortIcon('updated')}
                  </button>
                </TableHead>
                <TableHead className="text-right text-xs font-medium">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customersPg.slice.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canManageDeposits ? 8 : 7}
                    className="text-center text-muted-foreground"
                  >
                    {customers.length === 0
                      ? 'لا يوجد عملاء'
                      : 'لا توجد نتائج تطابق البحث'}
                  </TableCell>
                </TableRow>
              ) : (
                customersPg.slice.map((c) => {
                  const official = customerReceivableById.get(c.id)?.official ?? 0;
                  const dupRow = isCustomerRowCodeDuplicate(c);
                  const canTrashDup = canManageDeposits && canDeleteAsEmptyDuplicate(c);
                  return (
                    <TableRow
                      key={c.id}
                      className={cn(
                        'cursor-pointer',
                        dupRow && 'bg-amber-500/12 dark:bg-amber-500/15',
                      )}
                      onClick={() => {
                        setCustomerDrawerId(c.id);
                        setCustomerDrawerOpen(true);
                      }}
                    >
                      {canManageDeposits ? (
                        <TableCell className="w-11 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center py-1">
                            <Checkbox
                              checked={selectedCustomerIds.has(c.id)}
                              onCheckedChange={() => toggleCustomerSelected(c.id)}
                              aria-label={`تحديد العميل ${c.code}`}
                            />
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="font-mono text-start" dir="ltr">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {c.code}
                          {dupRow ? (
                            <span className="rounded bg-amber-600/25 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950 dark:text-amber-100">
                              مكرر
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="tabular-nums">{safeMoney(c.openingBalance)}</TableCell>
                      <TableCell className="font-medium tabular-nums text-primary">{fmtMoney(official)}</TableCell>
                      <TableCell>{c.isActive ? 'نعم' : 'لا'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatShortUpdatedAt(c.updatedAt)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {canManageDeposits && dupRow ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'h-8 w-8',
                                canTrashDup
                                  ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                                  : 'text-muted-foreground hover:bg-muted',
                              )}
                              title={
                                canTrashDup
                                  ? 'حذف هذه النسخة (بلا حركات مالية)'
                                  : 'لا يمكن الحذف: يوجد إيداع/تسوية أو رصيد — انقر للتفاصيل'
                              }
                              aria-label="حذف نسخة مكررة"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!canTrashDup) {
                                  toast.error(
                                    'لا يمكن حذف هذه النسخة لوجود إيداعات أو تسويات أو أرصدة. صحّح البيانات ثم احذف النسخة الفارغة، أو انقل الحركات للسجل الذي ستحتفظ به.',
                                  );
                                  return;
                                }
                                setDeleteDupTarget(c);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Link to={tp(`/customers/deposits/customer/${c.id}`)} className="text-primary text-sm">
                            كشف
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
            <OnlineDataPaginationFooter
              page={customersPg.page}
              totalPages={customersPg.totalPages}
              totalItems={customersPg.totalItems}
              onPageChange={customersPg.setPage}
              itemLabel="عميل"
            />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'banks' && (
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-sm font-semibold">حسابات البنك</CardTitle>
                  <CardDescription className="text-xs">
                    «وارد معتمد» = رصيد افتتاحي الحساب + إيداعات مؤكدة على هذا الحساب ± تسويات مرتبطة به (نفس منطق صفحة
                    التفاصيل).
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  title="إضافة حساب بنك شركة"
                  aria-label="إضافة حساب بنك شركة"
                  onClick={() => setAddBankOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-b border-border px-4 py-3">
                <Label htmlFor="bank-master-search" className="sr-only">
                  بحث في حسابات البنك
                </Label>
                <Input
                  id="bank-master-search"
                  type="search"
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="بحث: رقم الحساب، البنك، الأرصدة…"
                  className="max-w-md"
                  dir="rtl"
                />
              </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    bankSortKey === 'account'
                      ? bankSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleBankSort('account')}
                  >
                    رقم الحساب
                    {bankSortIcon('account')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    bankSortKey === 'label'
                      ? bankSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleBankSort('label')}
                  >
                    البنك
                    {bankSortIcon('label')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    bankSortKey === 'opening'
                      ? bankSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleBankSort('opening')}
                  >
                    رصيد افتتاحي
                    {bankSortIcon('opening')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    bankSortKey === 'official'
                      ? bankSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleBankSort('official')}
                  >
                    وارد معتمد
                    {bankSortIcon('official')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    bankSortKey === 'pending'
                      ? bankSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleBankSort('pending')}
                  >
                    وارد معلّق
                    {bankSortIcon('pending')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    bankSortKey === 'updated'
                      ? bankSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleBankSort('updated')}
                  >
                    آخر تحديث
                    {bankSortIcon('updated')}
                  </button>
                </TableHead>
                <TableHead className="text-right">—</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banksPg.slice.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {banks.length === 0 ? 'لا توجد حسابات' : 'لا توجد نتائج تطابق البحث'}
                  </TableCell>
                </TableRow>
              ) : (
                banksPg.slice.map((b) => {
                  const cash = bankCashById.get(b.id) ?? { official: 0, pendingInflow: 0 };
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono">{b.accountNumber}</TableCell>
                      <TableCell>{b.bankLabel}</TableCell>
                      <TableCell className="tabular-nums">{safeMoney(b.openingBalance)}</TableCell>
                      <TableCell className="font-medium tabular-nums text-primary">{fmtMoney(cash.official)}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{fmtMoney(cash.pendingInflow)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatShortUpdatedAt(b.updatedAt)}
                      </TableCell>
                      <TableCell>
                        <Link to={tp(`/customers/deposits/bank-account/${b.id}`)} className="text-primary text-sm">
                          تفاصيل
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
            <OnlineDataPaginationFooter
              page={banksPg.page}
              totalPages={banksPg.totalPages}
              totalItems={banksPg.totalItems}
              onPageChange={banksPg.setPage}
              itemLabel="حساب"
            />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'adjustments' && (
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-sm font-semibold">آخر التسويات</CardTitle>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  title="تسوية يدوية جديدة"
                  aria-label="تسوية يدوية جديدة"
                  onClick={() => setAddAdjustmentOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-b border-border px-4 py-3">
                <Label htmlFor="adjustment-master-search" className="sr-only">
                  بحث في التسويات
                </Label>
                <Input
                  id="adjustment-master-search"
                  type="search"
                  value={adjustmentSearch}
                  onChange={(e) => setAdjustmentSearch(e.target.value)}
                  placeholder="بحث: التاريخ، المبلغ، الملاحظة، العميل، الحساب…"
                  className="max-w-md"
                  dir="rtl"
                />
              </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    adjustmentSortKey === 'date'
                      ? adjustmentSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleAdjustmentSort('date')}
                  >
                    التاريخ
                    {adjustmentSortIcon('date')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    adjustmentSortKey === 'amount'
                      ? adjustmentSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleAdjustmentSort('amount')}
                  >
                    المبلغ
                    {adjustmentSortIcon('amount')}
                  </button>
                </TableHead>
                <TableHead
                  className="p-0 text-right"
                  aria-sort={
                    adjustmentSortKey === 'note'
                      ? adjustmentSortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 text-right text-sm font-medium hover:bg-muted/60"
                    onClick={() => toggleAdjustmentSort('note')}
                  >
                    ملاحظة
                    {adjustmentSortIcon('note')}
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustmentsPg.slice.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {adjustments.length === 0 ? 'لا توجد تسويات' : 'لا توجد نتائج تطابق البحث'}
                  </TableCell>
                </TableRow>
              ) : (
                adjustmentsPg.slice.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.effectiveDate}</TableCell>
                    <TableCell>{safeMoney(a.signedAmount)}</TableCell>
                    <TableCell>{a.note}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
            <OnlineDataPaginationFooter
              page={adjustmentsPg.page}
              totalPages={adjustmentsPg.totalPages}
              totalItems={adjustmentsPg.totalItems}
              onPageChange={adjustmentsPg.setPage}
              itemLabel="تسوية"
            />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'pack' && <CustomerDepositsPackImportExportSection onImportSuccess={() => void loadAll()} />}

      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>عميل جديد</DialogTitle>
            <DialogDescription>يُستخدم كود العميل في نموذج الإيداع.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs text-muted-foreground">الكود</Label>
              <Input value={cCode} onChange={(e) => setCCode(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">الاسم</Label>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">رصيد افتتاحي (ذمم)</Label>
              <Input type="number" step="0.01" value={cOpen} onChange={(e) => setCOpen(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddCustomerOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" onClick={() => void addCustomer()}>
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addBankOpen} onOpenChange={setAddBankOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>حساب بنك شركة جديد</DialogTitle>
            <DialogDescription>يُربط برقم الحساب في نموذج الإيداع.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs text-muted-foreground">رقم الحساب</Label>
              <Input value={bAcc} onChange={(e) => setBAcc(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">البنك / الوصف</Label>
              <Input value={bLabel} onChange={(e) => setBLabel(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">رصيد افتتاحي</Label>
              <Input type="number" step="0.01" value={bOpen} onChange={(e) => setBOpen(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddBankOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" onClick={() => void addBank()}>
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addAdjustmentOpen} onOpenChange={setAddAdjustmentOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تسوية يدوية</DialogTitle>
            <DialogDescription>
              المبلغ موجب يزيد ذمم العميل (أو الرصيد حسب الربط)، سالب يقللها. اربط عميلًا و/أو حساب بنك.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">التاريخ</Label>
              <Input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">المبلغ (+ / −)</Label>
              <Input type="number" step="0.01" value={adjAmt} onChange={(e) => setAdjAmt(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">ملاحظة</Label>
              <Input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">عميل (اختياري)</Label>
              <Select value={adjCustomerId || '__'} onValueChange={(v) => setAdjCustomerId(v === '__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__">—</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">حساب بنك (اختياري)</Label>
              <Select value={adjBankId || '__'} onValueChange={(v) => setAdjBankId(v === '__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__">—</SelectItem>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.accountNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddAdjustmentOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" onClick={() => void addAdjustment()}>
              حفظ التسوية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerDepositCustomerDrawer
        tenantSlug={tenantSlug}
        customerId={customerDrawerId}
        open={customerDrawerOpen}
        onOpenChange={(o) => {
          setCustomerDrawerOpen(o);
          if (!o) setCustomerDrawerId(null);
        }}
        navIds={customerNavIds}
        onNavigate={setCustomerDrawerId}
      />

      <Dialog
        open={deleteDupTarget != null}
        onOpenChange={(o) => {
          if (!o) setDeleteDupTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>حذف نسخة عميل مكررة</DialogTitle>
            <DialogDescription>
              حذف نهائي من قاعدة البيانات. يُسمح فقط عندما لا تكون هناك إيداعات أو تسويات مرتبطة بهذا المعرّف
              وأرصدة الصف صفر.
            </DialogDescription>
          </DialogHeader>
          {deleteDupTarget ? (
            <p className="text-sm text-foreground">
              <span className="font-mono" dir="ltr">
                {deleteDupTarget.code}
              </span>
              {' — '}
              {deleteDupTarget.name}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteDupTarget(null)}>
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteDupBusy}
              onClick={() => void confirmDeleteDuplicateCustomer()}
            >
              تأكيد الحذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkDeleteDialogOpen}
        onOpenChange={(o) => {
          if (!o) setBulkDeleteDialogOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>حذف عملاء محددين</DialogTitle>
            <DialogDescription>
              يُحذف فقط من يستوفي نفس شروط حذف المكرر الفردي: كود مكرر، بلا إيداعات أو تسويات على هذا المعرّف، ورصيد
              افتتاحي وذمة معتمدة = صفر. السجلات الأخرى تُستبعد من التنفيذ وتبقى محددة.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(50vh,320px)] space-y-3 overflow-y-auto text-sm">
            {bulkDeletePreview.deletable.length > 0 ? (
              <div>
                <p className="font-medium text-foreground">سيُحذف ({bulkDeletePreview.deletable.length})</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {bulkDeletePreview.deletable.map((c) => (
                    <li key={c.id}>
                      <span className="font-mono" dir="ltr">
                        {c.code}
                      </span>
                      {' — '}
                      {c.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {bulkDeletePreview.skipped.length > 0 ? (
              <div>
                <p className="font-medium text-foreground">لن يُحذف — يستبعد ({bulkDeletePreview.skipped.length})</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {bulkDeletePreview.skipped.map((c) => (
                    <li key={c.id}>
                      <span className="font-mono" dir="ltr">
                        {c.code}
                      </span>
                      {' — '}
                      {c.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {bulkDeletePreview.deletable.length === 0 && bulkDeletePreview.skipped.length === 0 ? (
              <p className="text-muted-foreground">لا يوجد محدد.</p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setBulkDeleteDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={bulkDeleteBusy || bulkDeletePreview.deletable.length === 0}
              onClick={() => void confirmBulkDeleteDuplicateCustomers()}
            >
              تنفيذ الحذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpeningDialogOpen} onOpenChange={setResetOpeningDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تصفير الأرصدة الافتتاحية للعملاء</DialogTitle>
            <DialogDescription>
              سيتم ضبط حقل «رصيد افتتاحي» إلى 0 لكل سجلات العملاء في شركتك. الإيداعات والتسويات المسجّلة لا تُحذف.
              لا يمكن التراجع تلقائيًا.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reset-opening-confirm">اكتب «تصفير» للمتابعة</Label>
            <Input
              id="reset-opening-confirm"
              value={resetOpeningConfirm}
              onChange={(e) => setResetOpeningConfirm(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setResetOpeningDialogOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" variant="destructive" disabled={resetOpeningBusy} onClick={() => void confirmResetCustomerOpeningBalances()}>
              تنفيذ التصفير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
