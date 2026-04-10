import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Timestamp } from 'firebase/firestore';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { withTenantPath } from '../../../lib/tenantPaths';
import { customerDepositEntryService } from '../services/customerDepositEntryService';
import { customerDepositCustomerService } from '../services/customerDepositCustomerService';
import { customerDepositBankAccountService } from '../services/customerDepositBankAccountService';
import type { CustomerDepositEntry, DepositListNavState } from '../types';
import { formatDepositTitleWithDate } from '../utils/depositSerialLabel';
import { CustomerDepositStatusBadge } from './CustomerDepositStatusBadge';
import { Button } from '@/components/ui/button';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const moneyLocaleOpts: Intl.NumberFormatOptions = {
  numberingSystem: 'latn',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

const fmtMoney = (n: number) =>
  (Number(n) || 0).toLocaleString('ar-EG', moneyLocaleOpts);

function fmtTs(ts: Timestamp | undefined): string {
  if (!ts) return '—';
  try {
    const d = ts.toDate?.() ?? null;
    if (!d) return '—';
    return d.toLocaleString('ar-EG');
  } catch {
    return '—';
  }
}

const DEPOSIT_FORM_CUSTOMERS_LIMIT = 500;
const DEPOSIT_FORM_BANKS_LIMIT = 200;

export type CustomerDepositEntryDrawerProps = {
  tenantSlug: string | undefined;
  entryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navState: DepositListNavState;
  /** لتنقّل سابق/تالي داخل الدرج */
  navIds?: string[];
  onNavigate?: (id: string) => void;
  onMutate: () => void;
};

export const CustomerDepositEntryDrawer: React.FC<CustomerDepositEntryDrawerProps> = ({
  tenantSlug,
  entryId,
  open,
  onOpenChange,
  navState,
  navIds = [],
  onNavigate,
  onMutate,
}) => {
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const tp = (path: string) => withTenantPath(tenantSlug, path);

  const [row, setRow] = useState<CustomerDepositEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Partial<CustomerDepositEntry>>({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [customers, setCustomers] = useState<{ id: string; code: string; name: string }[]>([]);
  const [banks, setBanks] = useState<{ id: string; accountNumber: string; bankLabel: string }[]>([]);

  const idx = entryId ? navIds.indexOf(entryId) : -1;
  const prevId = idx > 0 ? navIds[idx - 1] : null;
  const nextId = idx >= 0 && idx < navIds.length - 1 ? navIds[idx + 1] : null;

  const canConfirm = can('customerDeposits.confirm') || can('customerDeposits.manage');
  const canManage = can('customerDeposits.manage');
  const canDelete = canManage;

  const canEditPending = useMemo(() => {
    if (!row || row.status !== 'pending') return false;
    return canManage || (can('customerDeposits.create') && row.createdByUid === uid);
  }, [row, canManage, can, uid]);

  const loadEntry = useCallback(async () => {
    if (!entryId) {
      setRow(null);
      return;
    }
    setLoading(true);
    try {
      const e = await customerDepositEntryService.getById(entryId);
      setRow(e);
      if (e) {
        setDraft({
          amount: e.amount,
          depositorName: e.depositorName,
          depositorAccountNumber: e.depositorAccountNumber,
          depositDate: e.depositDate,
          customerId: e.customerId,
          customerCodeSnapshot: e.customerCodeSnapshot,
          customerNameSnapshot: e.customerNameSnapshot,
          companyBankAccountId: e.companyBankAccountId,
          bankLabelSnapshot: e.bankLabelSnapshot,
        });
      }
      setEdit(false);
      setDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    if (!open || !entryId) return;
    void loadEntry();
  }, [open, entryId, loadEntry]);

  useEffect(() => {
    if (!open || !canManage || row?.status !== 'pending') return;
    void (async () => {
      const [c, b] = await Promise.all([
        customerDepositCustomerService.getActive({ limit: DEPOSIT_FORM_CUSTOMERS_LIMIT }),
        customerDepositBankAccountService.getActive({ limit: DEPOSIT_FORM_BANKS_LIMIT }),
      ]);
      setCustomers(c.map((x) => ({ id: x.id, code: x.code, name: x.name })));
      setBanks(b.map((x) => ({ id: x.id, accountNumber: x.accountNumber, bankLabel: x.bankLabel })));
    })();
  }, [open, canManage, row?.status, row?.id]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setEdit(false);
      setDeleteConfirm(false);
    }
    onOpenChange(next);
  };

  const onConfirm = async () => {
    if (!entryId || !row) return;
    setConfirmBusy(true);
    try {
      await customerDepositEntryService.confirm(entryId);
      toast.success('تم تأكيد الإيداع');
      await loadEntry();
      onMutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'فشل التأكيد');
    } finally {
      setConfirmBusy(false);
    }
  };

  const onSaveEdit = async () => {
    if (!entryId || !row) return;
    setSaveBusy(true);
    try {
      const patch: Parameters<typeof customerDepositEntryService.updatePending>[1] = {
        amount: Number(draft.amount),
        depositorName: String(draft.depositorName || ''),
        depositorAccountNumber: String(draft.depositorAccountNumber || ''),
        depositDate: String(draft.depositDate || ''),
      };
      if (canManage) {
        patch.customerId = draft.customerId;
        patch.customerCodeSnapshot = String(draft.customerCodeSnapshot || '');
        patch.customerNameSnapshot = String(draft.customerNameSnapshot || '');
        patch.companyBankAccountId = draft.companyBankAccountId;
        patch.bankLabelSnapshot = String(draft.bankLabelSnapshot || '');
      }
      await customerDepositEntryService.updatePending(entryId, patch);
      toast.success('تم حفظ التعديلات');
      setEdit(false);
      await loadEntry();
      onMutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setSaveBusy(false);
    }
  };

  const onDelete = async () => {
    if (!entryId) return;
    setDeleteBusy(true);
    try {
      await customerDepositEntryService.deleteEntry(entryId);
      toast.success('تم حذف الإيداع');
      handleOpenChange(false);
      onMutate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'فشل الحذف');
    } finally {
      setDeleteBusy(false);
      setDeleteConfirm(false);
    }
  };

  const onSelectCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    setDraft((d) => ({
      ...d,
      customerId: id,
      customerNameSnapshot: c?.name ?? '',
      customerCodeSnapshot: c?.code ?? '',
    }));
  };

  const onSelectBank = (id: string) => {
    const b = banks.find((x) => x.id === id);
    setDraft((d) => ({
      ...d,
      companyBankAccountId: id,
      bankLabelSnapshot: b?.bankLabel ?? '',
    }));
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="space-y-1 border-b px-6 py-4 text-right">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="text-right">
                {row ? formatDepositTitleWithDate(row) : 'تفاصيل الإيداع'}
              </SheetTitle>
              <SheetDescription className="text-right">
                عرض وتعديل وحذف من الدرج — أو{' '}
                {row ? (
                  <Link
                    to={tp(`/customers/deposits/${row.id}`)}
                    state={navState}
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => handleOpenChange(false)}
                  >
                    فتح في صفحة كاملة
                  </Link>
                ) : null}
              </SheetDescription>
            </div>
            {row ? <CustomerDepositStatusBadge status={row.status} /> : null}
          </div>
          {navIds.length > 1 && onNavigate ? (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              {prevId ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onNavigate(prevId)}>
                  <ChevronRight className="ms-1 h-4 w-4" />
                  السابق
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  السابق
                </Button>
              )}
              {nextId ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onNavigate(nextId)}>
                  التالي
                  <ChevronLeft className="me-1 h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  التالي
                </Button>
              )}
            </div>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground">جاري التحميل…</p>
          ) : !row ? (
            <p className="text-center text-sm text-muted-foreground">لم يُعثر على الإيداع</p>
          ) : edit ? (
            <div className="space-y-4">
              <div>
                <Label>القيمة</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.amount ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>بيانات المودع</Label>
                <Input
                  value={draft.depositorName ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, depositorName: e.target.value }))}
                />
              </div>
              <div>
                <Label>رقم حساب المودع</Label>
                <Input
                  value={draft.depositorAccountNumber ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, depositorAccountNumber: e.target.value }))}
                />
              </div>
              <div>
                <Label>تاريخ الإيداع</Label>
                <Input
                  type="date"
                  value={draft.depositDate ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, depositDate: e.target.value }))}
                />
              </div>
              {canManage ? (
                <>
                  <div>
                    <Label>العميل</Label>
                    <Select value={draft.customerId || ''} onValueChange={onSelectCustomer}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر العميل" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.code} — {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>حساب بنك الشركة</Label>
                    <Select value={draft.companyBankAccountId || ''} onValueChange={onSelectBank}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الحساب" />
                      </SelectTrigger>
                      <SelectContent>
                        {banks.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.accountNumber} — {b.bankLabel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void onSaveEdit()} disabled={saveBusy}>
                  حفظ
                </Button>
                <Button type="button" variant="outline" onClick={() => setEdit(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {typeof row.depositSerial === 'number' && row.depositSerial >= 1 ? (
                  <div>
                    <p className="text-xs text-muted-foreground">رقم المسلسل</p>
                    <p className="font-semibold tabular-nums">{row.depositSerial}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs text-muted-foreground">القيمة</p>
                  <p className="font-semibold tabular-nums">{fmtMoney(row.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">المودع</p>
                  <p>{row.depositorName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">رقم حساب المودع</p>
                  <p className="font-mono text-sm">{row.depositorAccountNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">العميل</p>
                  <p>{row.customerNameSnapshot}</p>
                  <p className="text-xs text-muted-foreground">كود: {row.customerCodeSnapshot}</p>
                  <Link
                    to={tp(`/customers/deposits/customer/${row.customerId}`)}
                    className="mt-1 inline-block text-sm text-primary"
                    onClick={() => handleOpenChange(false)}
                  >
                    كشف حساب العميل
                  </Link>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">حساب الشركة / البنك</p>
                  <p>{row.bankLabelSnapshot}</p>
                  <Link
                    to={tp(`/customers/deposits/bank-account/${row.companyBankAccountId}`)}
                    className="mt-1 inline-block text-sm text-primary"
                    onClick={() => handleOpenChange(false)}
                  >
                    تفاصيل الحساب
                  </Link>
                </div>
              </div>
              <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                <p>أنشئ في {fmtTs(row.createdAt)}</p>
                {row.confirmedAt ? <p>أكّد في {fmtTs(row.confirmedAt)}</p> : null}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="flex flex-col items-stretch gap-3 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
          {!loading && row && !edit ? (
            <>
              {row.status === 'pending' && canConfirm ? (
                <Button type="button" onClick={() => void onConfirm()} disabled={confirmBusy}>
                  تأكيد (موكّد)
                </Button>
              ) : null}
              {canEditPending ? (
                <Button type="button" variant="outline" onClick={() => setEdit(true)}>
                  تعديل
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteBusy}
                  onClick={() => setDeleteConfirm(true)}
                >
                  حذف
                </Button>
              ) : null}
            </>
          ) : null}
          {deleteConfirm ? (
            <div className="w-full rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="mb-2 text-right">
                {row?.status === 'confirmed'
                  ? 'هذا إيداع مؤكد. حذف السجل نهائي ولا يمكن التراجع من الواجهة.'
                  : 'حذف هذا الإيداع نهائياً؟'}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDeleteConfirm(false)}>
                  إلغاء
                </Button>
                <Button type="button" variant="destructive" size="sm" disabled={deleteBusy} onClick={() => void onDelete()}>
                  تأكيد الحذف
                </Button>
              </div>
            </div>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
