import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Timestamp } from 'firebase/firestore';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { withTenantPath } from '../../../lib/tenantPaths';
import { customerDepositCustomerService } from '../services/customerDepositCustomerService';
import { customerDepositEntryService } from '../services/customerDepositEntryService';
import { customerDepositAdjustmentService } from '../services/customerDepositAdjustmentService';
import type { CustomerDepositCustomer } from '../types';
import { customerReceivableBalance } from '../utils/balances';
import { buildCustomerStatementRows, runningBalancesForStatement } from '../utils/statement';
import { parseNumericField } from '../utils/numericField';
import { CustomerDepositStatusBadge } from './CustomerDepositStatusBadge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

export type CustomerDepositCustomerDrawerProps = {
  tenantSlug: string | undefined;
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ترتيب العملاء في الماستر للتنقّل سابق/تالي */
  navIds?: string[];
  onNavigate?: (id: string) => void;
};

export const CustomerDepositCustomerDrawer: React.FC<CustomerDepositCustomerDrawerProps> = ({
  tenantSlug,
  customerId,
  open,
  onOpenChange,
  navIds = [],
  onNavigate,
}) => {
  const tp = (path: string) => withTenantPath(tenantSlug, path);

  const [customer, setCustomer] = useState<CustomerDepositCustomer | null>(null);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof customerDepositEntryService.listByCustomerId>>>(
    [],
  );
  const [adjustments, setAdjustments] = useState<
    Awaited<ReturnType<typeof customerDepositAdjustmentService.listByCustomerId>>
  >([]);

  const idx = customerId ? navIds.indexOf(customerId) : -1;
  const prevId = idx > 0 ? navIds[idx - 1] : null;
  const nextId = idx >= 0 && idx < navIds.length - 1 ? navIds[idx + 1] : null;

  const load = useCallback(async () => {
    if (!customerId) {
      setCustomer(null);
      setEntries([]);
      setAdjustments([]);
      return;
    }
    setLoading(true);
    try {
      const [c, e, adj] = await Promise.all([
        customerDepositCustomerService.getById(customerId),
        customerDepositEntryService.listByCustomerId(customerId),
        customerDepositAdjustmentService.listByCustomerId(customerId),
      ]);
      setCustomer(c);
      setEntries(e);
      setAdjustments(adj);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (!open || !customerId) return;
    void load();
  }, [open, customerId, load]);

  const { official, pendingDeposits } = useMemo(() => {
    if (!customer) return { official: 0, pendingDeposits: 0 };
    return customerReceivableBalance(customer, entries, adjustments);
  }, [customer, entries, adjustments]);

  const statementLines = useMemo(() => {
    if (!customer) return [];
    const rows = buildCustomerStatementRows(entries, adjustments);
    return runningBalancesForStatement(rows, customer.openingBalance);
  }, [customer, entries, adjustments]);

  const openingDisplay = useMemo(() => {
    if (!customer) return '—';
    const n = parseNumericField(customer.openingBalance);
    if (n === null) return '—';
    return n.toLocaleString('ar-EG', moneyLocaleOpts);
  }, [customer]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="space-y-1 border-b px-6 py-4 text-right">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="text-right">{customer?.name ?? 'تفاصيل العميل'}</SheetTitle>
              <SheetDescription className="text-right">
                {customer ? (
                  <>
                    كود: <span className="font-mono tabular-nums">{customer.code}</span>
                    {' — '}
                    <Link
                      to={tp(`/customers/deposits/customer/${customer.id}`)}
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => handleOpenChange(false)}
                    >
                      فتح صفحة الكشف الكاملة
                    </Link>
                  </>
                ) : (
                  '—'
                )}
              </SheetDescription>
            </div>
            {customer ? (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  customer.isActive ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                }`}
              >
                {customer.isActive ? 'نشط' : 'غير نشط'}
              </span>
            ) : null}
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground">جاري التحميل…</p>
          ) : !customer ? (
            <p className="text-center text-sm text-muted-foreground">لم يُعثر على العميل</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">رصيد افتتاحي (ذمم)</p>
                  <p className="mt-1 font-semibold tabular-nums">{openingDisplay}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">مستحق معتمد</p>
                  <p className="mt-1 font-semibold tabular-nums text-primary">{fmtMoney(official)}</p>
                </div>
                <div className="col-span-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-xs text-muted-foreground">إيداعات معلّقة (غير مؤكدة)</p>
                  <p className="mt-1 font-semibold tabular-nums text-amber-700 dark:text-amber-500">
                    {fmtMoney(pendingDeposits)}
                  </p>
                </div>
              </div>

              {customer.createdAt ? (
                <p className="text-xs text-muted-foreground">سجّل في النظام: {fmtTs(customer.createdAt)}</p>
              ) : null}

              <div>
                <p className="mb-2 text-sm font-semibold">ملخص الحركات</p>
                <div className="max-h-[min(50vh,22rem)] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right text-xs">التاريخ</TableHead>
                        <TableHead className="text-right text-xs">البيان</TableHead>
                        <TableHead className="text-right text-xs">المبلغ</TableHead>
                        <TableHead className="text-right text-xs">رصيد جاري</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-xs">—</TableCell>
                        <TableCell className="text-xs">رصيد أول المدة</TableCell>
                        <TableCell className="text-xs">—</TableCell>
                        <TableCell className="tabular-nums text-xs font-medium">{openingDisplay}</TableCell>
                      </TableRow>
                      {statementLines.map(({ row, balance }) => (
                        <TableRow key={`${row.kind}-${row.id}`}>
                          <TableCell className="text-xs">{row.date}</TableCell>
                          <TableCell className="text-xs">
                            {row.kind === 'deposit' ? (
                              <span className="flex flex-wrap items-center gap-1">
                                <Link
                                  to={tp(`/customers/deposits/${row.id}`)}
                                  className="text-primary hover:underline"
                                  onClick={() => handleOpenChange(false)}
                                >
                                  {row.label}
                                </Link>
                                <CustomerDepositStatusBadge status={row.status} />
                              </span>
                            ) : (
                              row.label
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums text-xs">
                            {row.kind === 'deposit'
                              ? row.status === 'confirmed'
                                ? fmtMoney(row.amount)
                                : '—'
                              : fmtMoney(row.amount)}
                          </TableCell>
                          <TableCell className="tabular-nums text-xs font-medium">{fmtMoney(balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  الترتيب زمني من الأقدم للأحدث؛ للطباعة أو ترقيم الصفحات استخدم صفحة الكشف الكاملة.
                </p>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="border-t bg-muted/20 px-6 py-4 sm:justify-end">
          {customer ? (
            <Button asChild variant="default">
              <Link to={tp(`/customers/deposits/customer/${customer.id}`)} onClick={() => handleOpenChange(false)}>
                الانتقال لكشف الحساب
              </Link>
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
