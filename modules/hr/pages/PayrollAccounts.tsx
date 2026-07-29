import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getDocs, query, where } from 'firebase/firestore';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/UI';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { payrollDistributionsRef } from '../collections';
import { getPayrollMonth, getPayrollRecords } from '../payroll';
import type { FirestorePayrollRecord } from '../payroll/types';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { getCurrentTenantId } from '@/lib/currentTenant';
import { confirmPayrollDisbursement } from '../usecases/payrollAccounts';
import { unwrapOrThrow } from '@/shared/usecases';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
  setPageDataCache,
} from '../../shared/lib/pageDataCache';

function fmt(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type PayrollAccountsPageData = {
  month: string;
  rows: (FirestorePayrollRecord & { disbursed?: boolean })[];
};

export const PayrollAccounts: React.FC = () => {
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const canConfirmDisbursement = can('payroll.accounts.disburse');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<(FirestorePayrollRecord & { disbursed?: boolean })[]>([]);
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');

  const applyAccountsData = useCallback((data: PayrollAccountsPageData) => {
    setMonth(data.month);
    setRows(data.rows);
  }, []);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    const cacheKey = `hr:payroll-accounts:${month || 'auto'}`;
    const cached = peekPageDataCache<PayrollAccountsPageData>(cacheKey);
    if (cached) {
      applyAccountsData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      const { data } = await fetchCachedPageData(
        cacheKey,
        async (): Promise<PayrollAccountsPageData> => {
          const distSnap = await getDocs(query(
            payrollDistributionsRef(),
            where('tenantId', '==', getCurrentTenantId()),
            where('status', '==', 'distributed'),
          ));
          const months = distSnap.docs
            .map((d) => String((d.data() as { month?: string }).month || ''))
            .filter(Boolean)
            .sort((a, b) => b.localeCompare(a));
          if (months.length === 0) {
            return { month: '', rows: [] };
          }
          const targetMonth = month || months[0];
          const payrollMonth = await getPayrollMonth(targetMonth);
          if (!payrollMonth?.id) {
            return { month: targetMonth, rows: [] };
          }
          const records = await getPayrollRecords(payrollMonth.id);
          return {
            month: targetMonth,
            rows: records as Array<FirestorePayrollRecord & { disbursed?: boolean }>,
          };
        },
        { force, maxAgeMs: 60_000 },
      );
      applyAccountsData(data);
      // Also seed the resolved-month key when we started from "auto"
      if (!month && data.month) {
        const resolvedKey = `hr:payroll-accounts:${data.month}`;
        if (resolvedKey !== cacheKey) {
          setPageDataCache(resolvedKey, data);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل بيانات صرف الرواتب');
    } finally {
      setLoading(false);
    }
  }, [month, applyAccountsData]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmOne = async (id?: string, reloadAfter = true) => {
    if (!canConfirmDisbursement) {
      setError('ليس لديك صلاحية تأكيد صرف الرواتب.');
      return;
    }
    if (!id) return;
    unwrapOrThrow(await confirmPayrollDisbursement({
      recordId: id,
      disbursedBy: uid || '',
      disbursedByName: userDisplayName || '',
    }));
    if (reloadAfter) {
      invalidatePageDataCache('hr:payroll-accounts:');
      await load({ force: true });
    }
  };

  const confirmAll = async () => {
    if (!canConfirmDisbursement) {
      setError('ليس لديك صلاحية تأكيد صرف الرواتب.');
      return;
    }
    const pending = rows.filter((r) => !r.disbursed);
    if (pending.length === 0) return;
    const result = await Promise.allSettled(
      pending.map((row) => confirmOne(row.id, false)),
    );
    const failedCount = result.filter((item) => item.status === 'rejected').length;
    if (failedCount > 0) {
      setError(`تعذر تأكيد صرف ${failedCount} سجل.`);
    }
    invalidatePageDataCache('hr:payroll-accounts:');
    await load({ force: true });
  };

  const totals = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + Number(row.netSalary || 0), 0);
    const disbursed = rows.filter((r) => r.disbursed).reduce((sum, row) => sum + Number(row.netSalary || 0), 0);
    return { total, disbursed, remaining: Math.max(0, total - disbursed) };
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="صرف الرواتب"
        subtitle="تأكيد صرف الرواتب الموزعة"
        icon="payments"
        primaryAction={{ label: loading ? 'جار التحميل...' : 'تحديث', icon: 'refresh', onClick: () => void load(), disabled: loading }}
      />

      {error && <div className="card p-3 text-sm font-bold text-rose-600">{error}</div>}

      <SmartFilterBar
        advancedFilters={[
          {
            key: 'month',
            label: 'الشهر',
            placeholder: 'اختر الشهر',
            type: 'month',
            options: [],
          },
        ]}
        advancedFilterValues={{ month }}
        onAdvancedFilterChange={(key, value) => {
          if (key === 'month') setMonth(value);
        }}
        extra={
          <>
            <Button className="erp-filter-apply" onClick={() => void confirmAll()} disabled={rows.length === 0 || !canConfirmDisbursement}>
              تأكيد صرف الكل
            </Button>
            <div className="text-sm font-bold text-[var(--color-text-muted)]">
              إجمالي المصروف: {fmt(totals.disbursed)} ج.م · المتبقي: {fmt(totals.remaining)} ج.م
            </div>
          </>
        }
      />

      <div className="card overflow-x-auto">
        <table className="erp-table w-full text-sm">
          <thead className="erp-thead">
            <tr>
              <th className="erp-th">اسم الموظف</th>
              <th className="erp-th">القسم</th>
              <th className="erp-th">صافي الراتب</th>
              <th className="erp-th">حالة الصرف</th>
              <th className="erp-th">تأكيد الصرف</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--color-border)]">
                <td className="py-2 px-2">{row.employeeName}</td>
                <td className="py-2 px-2">{row.departmentId || '—'}</td>
                <td className="py-2 px-2 font-mono">{fmt(Number(row.netSalary || 0))}</td>
                <td className="py-2 px-2">{row.disbursed ? 'تم الصرف' : 'لم يُصرف'}</td>
                <td className="py-2 px-2">
                  <Button
                    className="erp-filter-apply"
                    size="sm"
                    disabled={!!row.disbursed || !canConfirmDisbursement}
                    onClick={() => void confirmOne(row.id)}
                  >
                    {row.disbursed ? 'تم ✓' : 'تأكيد الصرف'}
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">
                  لا توجد رواتب موزعة للعرض.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
