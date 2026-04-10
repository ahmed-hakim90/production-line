import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { usePermission } from '../../../utils/permissions';
import { withTenantPath } from '../../../lib/tenantPaths';
import { customerDepositBankAccountService } from '../services/customerDepositBankAccountService';
import { customerDepositEntryService } from '../services/customerDepositEntryService';
import { customerDepositAdjustmentService } from '../services/customerDepositAdjustmentService';
import { companyBankCashBalance } from '../utils/balances';
import type { CustomerDepositCompanyBankAccount } from '../types';
import { CustomerDepositStatusBadge } from '../components/CustomerDepositStatusBadge';
import { CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE, useClientTablePagination } from '../hooks/useClientTablePagination';
import { OnlineDataPaginationFooter } from '../../online/components/OnlineDataPaginationFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const fmtMoney = (n: number) =>
  (Number(n) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CustomerDepositBankPage: React.FC = () => {
  const { tenantSlug, accountId } = useParams<{ tenantSlug: string; accountId: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const tp = (path: string) => withTenantPath(tenantSlug, path);
  const [account, setAccount] = useState<CustomerDepositCompanyBankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof customerDepositEntryService.listByCompanyBankAccountId>>>([]);
  const [adjustments, setAdjustments] = useState<
    Awaited<ReturnType<typeof customerDepositAdjustmentService.listByCompanyBankAccountId>>
  >([]);

  useEffect(() => {
    if (!accountId) return;
    void (async () => {
      setLoading(true);
      try {
        const a = await customerDepositBankAccountService.getById(accountId);
        setAccount(a);
        const [e, adj] = await Promise.all([
          customerDepositEntryService.listByCompanyBankAccountId(accountId),
          customerDepositAdjustmentService.listByCompanyBankAccountId(accountId),
        ]);
        setEntries(e);
        setAdjustments(adj);
      } finally {
        setLoading(false);
      }
    })();
  }, [accountId]);

  const { official, pendingInflow } = useMemo(() => {
    if (!account) return { official: 0, pendingInflow: 0 };
    return companyBankCashBalance(account, entries, adjustments);
  }, [account, entries, adjustments]);

  const entriesPg = useClientTablePagination(entries, CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE, accountId);
  const adjustmentsPg = useClientTablePagination(adjustments, CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE, accountId);

  if (loading) {
    return (
      <div className="erp-page space-y-6">
        <p className="text-center text-muted-foreground">جاري التحميل…</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="erp-page space-y-6">
        <PageHeader title="حساب غير موجود" icon="landmark" backAction={{ to: tp('/customers/deposits') }} />
        <Button asChild variant="outline">
          <Link to={tp('/customers/deposits')}>العودة</Link>
        </Button>
      </div>
    );
  }

  const canNew = can('customerDeposits.create') || can('customerDeposits.manage');

  return (
    <div className="erp-page mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={account.bankLabel}
        subtitle={`رقم الحساب: ${account.accountNumber}`}
        icon="landmark"
        backAction={{ to: tp('/customers/deposits') }}
        secondaryAction={{
          label: 'قائمة الإيداعات',
          icon: 'layout_dashboard',
          onClick: () => navigate(tp('/customers/deposits')),
        }}
        primaryAction={
          canNew
            ? {
                label: 'إيداع جديد',
                icon: 'add',
                onClick: () => navigate(tp('/customers/deposits/new')),
              }
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="p-4">
            <CardDescription className="text-xs">رصيد افتتاحي</CardDescription>
            <CardTitle className="text-xl font-bold tabular-nums">{fmtMoney(account.openingBalance)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="p-4">
            <CardDescription className="text-xs">وارد معتمد</CardDescription>
            <CardTitle className="text-primary text-xl font-bold tabular-nums">{fmtMoney(official)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="p-4">
            <CardDescription className="text-xs">إيداعات معلقة</CardDescription>
            <CardTitle className="text-xl font-bold tabular-nums text-amber-600">{fmtMoney(pendingInflow)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
          <CardTitle className="text-base font-semibold">الإيداعات على هذا الحساب</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">العميل</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-[var(--color-text-muted)]">
                  لا توجد إيداعات
                </TableCell>
              </TableRow>
            ) : (
              entriesPg.slice.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link to={tp(`/customers/deposits/${r.id}`)} className="text-primary">
                      {typeof r.depositSerial === 'number' && r.depositSerial >= 1
                        ? `#${r.depositSerial} · ${r.depositDate}`
                        : r.depositDate}
                    </Link>
                  </TableCell>
                  <TableCell>{fmtMoney(r.amount)}</TableCell>
                  <TableCell>{r.customerNameSnapshot}</TableCell>
                  <TableCell>
                    <CustomerDepositStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <OnlineDataPaginationFooter
          page={entriesPg.page}
          totalPages={entriesPg.totalPages}
          totalItems={entriesPg.totalItems}
          onPageChange={entriesPg.setPage}
          itemLabel="إيداع"
        />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
          <CardTitle className="text-base font-semibold">التسويات على هذا الحساب</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">ملاحظة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adjustments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-[var(--color-text-muted)]">
                  لا توجد تسويات
                </TableCell>
              </TableRow>
            ) : (
              adjustmentsPg.slice.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.effectiveDate}</TableCell>
                  <TableCell>{fmtMoney(a.signedAmount)}</TableCell>
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
  );
};
