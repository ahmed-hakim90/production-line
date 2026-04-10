import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { usePermission } from '../../../utils/permissions';
import { withTenantPath } from '../../../lib/tenantPaths';
import { customerDepositCustomerService } from '../services/customerDepositCustomerService';
import { customerDepositEntryService } from '../services/customerDepositEntryService';
import { customerDepositAdjustmentService } from '../services/customerDepositAdjustmentService';
import { customerReceivableBalance } from '../utils/balances';
import { buildCustomerStatementRows, runningBalancesForStatement } from '../utils/statement';
import type { CustomerDepositCustomer } from '../types';
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

export const CustomerDepositCustomerPage: React.FC = () => {
  const { tenantSlug, customerId } = useParams<{ tenantSlug: string; customerId: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const tp = (path: string) => withTenantPath(tenantSlug, path);
  const [customer, setCustomer] = useState<CustomerDepositCustomer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    void (async () => {
      setLoading(true);
      try {
        const c = await customerDepositCustomerService.getById(customerId);
        setCustomer(c);
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId]);

  const [entries, setEntries] = useState<Awaited<ReturnType<typeof customerDepositEntryService.listByCustomerId>>>(
    [],
  );
  const [adjustments, setAdjustments] = useState<
    Awaited<ReturnType<typeof customerDepositAdjustmentService.listByCustomerId>>
  >([]);

  useEffect(() => {
    if (!customerId) return;
    void (async () => {
      const [e, a] = await Promise.all([
        customerDepositEntryService.listByCustomerId(customerId),
        customerDepositAdjustmentService.listByCustomerId(customerId),
      ]);
      setEntries(e);
      setAdjustments(a);
    })();
  }, [customerId]);

  const { official, pendingDeposits } = useMemo(() => {
    if (!customer) return { official: 0, pendingDeposits: 0 };
    return customerReceivableBalance(customer, entries, adjustments);
  }, [customer, entries, adjustments]);

  const statementRows = useMemo(() => {
    if (!customer) return [];
    const rows = buildCustomerStatementRows(entries, adjustments);
    return runningBalancesForStatement(rows, customer.openingBalance);
  }, [customer, entries, adjustments]);

  const statementPg = useClientTablePagination(
    statementRows,
    CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE,
    customerId ?? '',
  );

  if (loading) {
    return (
      <div className="erp-page space-y-6">
        <p className="text-center text-muted-foreground">جاري التحميل…</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="erp-page space-y-6">
        <PageHeader title="عميل غير موجود" icon="landmark" backAction={{ to: tp('/customers/deposits') }} />
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
        title={customer.name}
        subtitle={`كود: ${customer.code} — كشف حساب وذمم`}
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
                onClick: () =>
                  navigate(
                    tp(`/customers/deposits/new?customerId=${encodeURIComponent(customer.id)}`),
                  ),
              }
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="p-4">
            <CardDescription className="text-xs">رصيد افتتاحي (ذمم)</CardDescription>
            <CardTitle className="text-xl font-bold tabular-nums">{fmtMoney(customer.openingBalance)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="p-4">
            <CardDescription className="text-xs">مستحق معتمد</CardDescription>
            <CardTitle className="text-primary text-xl font-bold tabular-nums">{fmtMoney(official)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="p-4">
            <CardDescription className="text-xs">إيداعات معلقة (لم تُؤكّد)</CardDescription>
            <CardTitle className="text-xl font-bold tabular-nums text-amber-600">{fmtMoney(pendingDeposits)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
          <CardTitle className="text-base font-semibold">كشف الحركة</CardTitle>
          <CardDescription className="text-xs">الإيداعات والتسويات مع الرصيد الجاري للذمم.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">البيان</TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">رصيد جاري (ذمم)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>—</TableCell>
              <TableCell>افتتاحي</TableCell>
              <TableCell>رصيد أول المدة</TableCell>
              <TableCell>—</TableCell>
              <TableCell>{fmtMoney(customer.openingBalance)}</TableCell>
            </TableRow>
            {statementPg.slice.map(({ row, balance }) => (
              <TableRow key={`${row.kind}-${row.id}`}>
                <TableCell>{row.date}</TableCell>
                <TableCell>{row.kind === 'deposit' ? 'إيداع' : 'تسوية'}</TableCell>
                <TableCell>
                  {row.kind === 'deposit' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={tp(`/customers/deposits/${row.id}`)} className="text-primary text-sm">
                        {row.label}
                      </Link>
                      <CustomerDepositStatusBadge status={row.status} />
                    </div>
                  ) : (
                    row.label
                  )}
                </TableCell>
                <TableCell>
                  {row.kind === 'deposit'
                    ? row.status === 'confirmed'
                      ? fmtMoney(row.amount)
                      : '—'
                    : fmtMoney(row.amount)}
                </TableCell>
                <TableCell>{fmtMoney(balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <OnlineDataPaginationFooter
          page={statementPg.page}
          totalPages={statementPg.totalPages}
          totalItems={statementPg.totalItems}
          onPageChange={statementPg.setPage}
          itemLabel="حركة"
        />
        </CardContent>
      </Card>
    </div>
  );
};
