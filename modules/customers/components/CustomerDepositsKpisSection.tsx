import React, { useMemo } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { usePermission } from '../../../utils/permissions';
import type { CustomerDepositEntry } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function filterByDepositDateRange(
  entries: CustomerDepositEntry[],
  fromYmd: string,
  toYmd: string,
): CustomerDepositEntry[] {
  const from = String(fromYmd || '').trim();
  const to = String(toYmd || '').trim();
  if (!from || !to) return entries;
  return entries.filter((e) => {
    const d = String(e.depositDate || '').trim();
    return d >= from && d <= to;
  });
}

function summarizeDepositsInRange(list: CustomerDepositEntry[]) {
  let pendingCount = 0;
  let confirmedCount = 0;
  let pendingAmount = 0;
  let confirmedAmount = 0;
  for (const e of list) {
    const amt = Number(e.amount) || 0;
    if (e.status === 'pending') {
      pendingCount += 1;
      pendingAmount += amt;
    } else {
      confirmedCount += 1;
      confirmedAmount += amt;
    }
  }
  return {
    total: list.length,
    pendingCount,
    confirmedCount,
    pendingAmount,
    confirmedAmount,
  };
}

const fmtMoney = (n: number) =>
  (Number(n) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type CustomerDepositsKpisSectionProps = {
  entries: CustomerDepositEntry[];
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  showControls?: boolean;
  className?: string;
};

export const CustomerDepositsKpisSection: React.FC<CustomerDepositsKpisSectionProps> = ({
  entries,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  showControls = true,
  className,
}) => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();

  const inRange = useMemo(
    () => filterByDepositDateRange(entries, dateFrom, dateTo),
    [entries, dateFrom, dateTo],
  );

  const s = useMemo(() => summarizeDepositsInRange(inRange), [inRange]);

  const tileClass = 'rounded-lg border border-border bg-card p-3 sm:p-4 shadow-sm';

  const canNew = can('customerDeposits.create') || can('customerDeposits.manage');
  const canMaster = can('customerDeposits.manage');

  return (
    <div className={cn('space-y-4', className)}>
      <Card className="shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 sm:gap-4">
            <div className={tileClass}>
              <p className="text-xs text-muted-foreground">إيداعات ضمن الفترة</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{s.total}</p>
            </div>
            <div className={tileClass}>
              <p className="text-xs text-muted-foreground">معلق (عدد)</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {s.pendingCount}
              </p>
            </div>
            <div className={tileClass}>
              <p className="text-xs text-muted-foreground">موكّد (عدد)</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {s.confirmedCount}
              </p>
            </div>
            <div className={tileClass}>
              <p className="text-xs text-muted-foreground">مجموع معلّق</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{fmtMoney(s.pendingAmount)}</p>
            </div>
            <div className={tileClass}>
              <p className="text-xs text-muted-foreground">مجموع موكّد</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{fmtMoney(s.confirmedAmount)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {showControls && (
        <Card className="shadow-sm">
          <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
            <CardTitle className="text-base font-semibold">الفترة والاختصارات</CardTitle>
            <CardDescription className="text-xs">
              نطاق التاريخ يطبّق على المؤشرات أعلاه وجدول الإيداعات أدناه.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4 p-4 sm:p-6">
            <div className="space-y-2">
              <Label htmlFor="cd-kpi-from" className="text-xs text-muted-foreground">
                من تاريخ
              </Label>
              <Input
                id="cd-kpi-from"
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="w-[180px] sm:w-[200px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cd-kpi-to" className="text-xs text-muted-foreground">
                إلى تاريخ
              </Label>
              <Input
                id="cd-kpi-to"
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                className="w-[180px] sm:w-[200px]"
              />
            </div>
            {canNew && (
              <Button type="button" variant="default" onClick={() => navigate('/customers/deposits/new')}>
                إيداع جديد
              </Button>
            )}
            {canMaster && (
              <Button type="button" variant="outline" onClick={() => navigate('/customers/deposits/master')}>
                إعداد العملاء والبنوك
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
