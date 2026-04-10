import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Timestamp } from 'firebase/firestore';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../../components/PageHeader';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { withTenantPath } from '../../../lib/tenantPaths';
import { customerDepositEntryService } from '../services/customerDepositEntryService';
import type { CustomerDepositEntry, DepositListNavState } from '../types';
import { formatDepositTitleWithDate } from '../utils/depositSerialLabel';
import { CustomerDepositStatusBadge } from '../components/CustomerDepositStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const fmtMoney = (n: number) =>
  (Number(n) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export const CustomerDepositDetailPage: React.FC = () => {
  const { tenantSlug, entryId } = useParams<{ tenantSlug: string; entryId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const [row, setRow] = useState<CustomerDepositEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [draft, setDraft] = useState<Partial<CustomerDepositEntry>>({});

  const tp = (path: string) => withTenantPath(tenantSlug, path);
  const navState = (location.state || {}) as DepositListNavState;
  const navIds = navState.depositNavIds?.length ? navState.depositNavIds : [];
  const idx = entryId ? navIds.indexOf(entryId) : -1;
  const prevId = idx > 0 ? navIds[idx - 1] : null;
  const nextId = idx >= 0 && idx < navIds.length - 1 ? navIds[idx + 1] : null;

  const load = useCallback(async () => {
    if (!entryId) return;
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
        });
      }
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canConfirm = can('customerDeposits.confirm') || can('customerDeposits.manage');
  const canManage = can('customerDeposits.manage');
  const canEditPending =
    row?.status === 'pending' &&
    (canManage || (can('customerDeposits.create') && row.createdByUid === uid));

  const goSibling = (id: string) => {
    navigate(tp(`/customers/deposits/${id}`), { replace: false, state: navState });
  };

  const onConfirm = async () => {
    if (!entryId || !row) return;
    setConfirmBusy(true);
    try {
      await customerDepositEntryService.confirm(entryId);
      toast.success('تم تأكيد الإيداع');
      await load();
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
      await customerDepositEntryService.updatePending(entryId, {
        amount: Number(draft.amount),
        depositorName: String(draft.depositorName || ''),
        depositorAccountNumber: String(draft.depositorAccountNumber || ''),
        depositDate: String(draft.depositDate || ''),
      });
      toast.success('تم حفظ التعديلات');
      setEdit(false);
      await load();
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
      navigate(tp('/customers/deposits'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'فشل الحذف');
    } finally {
      setDeleteBusy(false);
      setDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="erp-page space-y-6">
        <p className="text-center text-muted-foreground">جاري التحميل…</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="erp-page space-y-6">
        <PageHeader title="إيداع غير موجود" icon="landmark" backAction={{ to: tp('/customers/deposits') }} />
        <Button asChild variant="outline">
          <Link to={tp('/customers/deposits')}>العودة للقائمة</Link>
        </Button>
      </div>
    );
  }

  const navExtra = (
    <div className="flex flex-wrap items-center gap-2">
      {prevId ? (
        <Button type="button" variant="outline" size="icon" onClick={() => goSibling(prevId)} title="السابق">
          <ChevronRight className="h-4 w-4" />
        </Button>
      ) : (
        <Button type="button" variant="outline" size="icon" disabled title="لا يوجد سابق">
          <ChevronRight className="h-4 w-4 opacity-40" />
        </Button>
      )}
      {nextId ? (
        <Button type="button" variant="outline" size="icon" onClick={() => goSibling(nextId)} title="التالي">
          <ChevronLeft className="h-4 w-4" />
        </Button>
      ) : (
        <Button type="button" variant="outline" size="icon" disabled title="لا يوجد تالي">
          <ChevronLeft className="h-4 w-4 opacity-40" />
        </Button>
      )}
      <Button asChild variant="ghost" size="sm">
        <Link to={tp('/customers/deposits')}>قائمة الإيداعات</Link>
      </Button>
    </div>
  );

  return (
    <div className="erp-page mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={formatDepositTitleWithDate(row)}
        subtitle="تفاصيل سجل الإيداع"
        icon="landmark"
        extra={navExtra}
      />

      <Card className="shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold">البيانات</CardTitle>
            <CustomerDepositStatusBadge status={row.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
        {edit ? (
          <>
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
              <Label>تاريخ الإيداع (YYYY-MM-DD)</Label>
              <Input
                value={draft.depositDate ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, depositDate: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void onSaveEdit()} disabled={saveBusy}>
                حفظ
              </Button>
              <Button type="button" variant="outline" onClick={() => setEdit(false)}>
                إلغاء
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {typeof row.depositSerial === 'number' && row.depositSerial >= 1 ? (
                <div>
                  <p className="text-sm text-[var(--color-text-muted)]">رقم المسلسل</p>
                  <p className="font-semibold tabular-nums">{row.depositSerial}</p>
                </div>
              ) : null}
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">القيمة</p>
                <p className="font-semibold">{fmtMoney(row.amount)}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">المودع</p>
                <p>{row.depositorName}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">رقم حساب المودع</p>
                <p className="font-mono">{row.depositorAccountNumber || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">العميل</p>
                <p>{row.customerNameSnapshot}</p>
                <p className="text-xs text-[var(--color-text-muted)]">كود: {row.customerCodeSnapshot}</p>
                <Link
                  to={tp(`/customers/deposits/customer/${row.customerId}`)}
                  className="text-sm text-primary mt-1 inline-block"
                >
                  كشف حساب العميل
                </Link>
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">حساب الشركة / البنك</p>
                <p>{row.bankLabelSnapshot}</p>
                <Link
                  to={tp(`/customers/deposits/bank-account/${row.companyBankAccountId}`)}
                  className="text-sm text-primary mt-1 inline-block"
                >
                  تفاصيل الحساب
                </Link>
              </div>
            </div>
            <div className="border-t border-border pt-2 text-sm text-muted-foreground">
              <p>أنشئ في {fmtTs(row.createdAt)}</p>
              {row.confirmedAt && <p>أكّد في {fmtTs(row.confirmedAt)}</p>}
            </div>
          </>
        )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          {row.status === 'pending' && canConfirm && (
            <Button type="button" onClick={() => void onConfirm()} disabled={confirmBusy}>
              تأكيد (موكّد)
            </Button>
          )}
          {canEditPending && !edit && (
            <Button type="button" variant="outline" onClick={() => setEdit(true)}>
              تعديل (معلق فقط)
            </Button>
          )}
          {canManage && !edit ? (
            <Button type="button" variant="destructive" disabled={deleteBusy} onClick={() => setDeleteConfirm(true)}>
              حذف الإيداع
            </Button>
          ) : null}
        </div>
        {deleteConfirm ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="mb-2">
              {row.status === 'confirmed'
                ? 'هذا إيداع مؤكد. الحذف نهائي ولا يمكن التراجع من الواجهة.'
                : 'حذف هذا الإيداع نهائياً؟'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDeleteConfirm(false)}>
                إلغاء
              </Button>
              <Button type="button" variant="destructive" size="sm" disabled={deleteBusy} onClick={() => void onDelete()}>
                تأكيد الحذف
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
