import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getDocs, query, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { PageHeader } from '@/components/PageHeader';
import { payrollDistributionsRef } from '../collections';
import { getPayrollMonth, getPayrollRecords } from '../payroll';
import type { FirestorePayrollRecord } from '../payroll/types';
import { useAppStore } from '@/store/useAppStore';
import { db } from '@/services/firebase';
import { usePermission } from '@/utils/permissions';

function fmt(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const PayrollAccounts: React.FC = () => {
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const canConfirmDisbursement = can('payroll.accounts.disburse');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<(FirestorePayrollRecord & { disbursed?: boolean })[]>([]);
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const distSnap = await getDocs(query(payrollDistributionsRef(), where('status', '==', 'distributed')));
      const months = distSnap.docs
        .map((d) => String((d.data() as any).month || ''))
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a));
      if (months.length === 0) {
        setMonth('');
        setRows([]);
        return;
      }
      const targetMonth = month || months[0];
      if (!month) setMonth(targetMonth);
      const payrollMonth = await getPayrollMonth(targetMonth);
      if (!payrollMonth?.id) {
        setRows([]);
        return;
      }
      const records = await getPayrollRecords(payrollMonth.id);
      setRows(records as Array<FirestorePayrollRecord & { disbursed?: boolean }>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل بيانات صرف الرواتب');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmOne = async (id?: string, reloadAfter = true) => {
    if (!canConfirmDisbursement) {
      setError('ليس لديك صلاحية تأكيد صرف الرواتب.');
      return;
    }
    if (!id) return;
    await updateDoc(doc(db, 'payroll_records', id), {
      disbursed: true,
      disbursedAt: serverTimestamp(),
      disbursedBy: uid || '',
      disbursedByName: userDisplayName || '',
    });
    if (reloadAfter) {
      await load();
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
    await load();
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
        extra={(
          <input
            type="month"
            className="erp-filter-select"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        )}
      />

      {error && <div className="card p-3 text-sm font-bold text-rose-600">{error}</div>}

      <div className="flex items-center gap-3">
        <button className="erp-filter-apply" onClick={() => void confirmAll()} disabled={rows.length === 0 || !canConfirmDisbursement}>
          تأكيد صرف الكل
        </button>
        <div className="text-sm font-bold text-[var(--color-text-muted)]">
          إجمالي المصروف: {fmt(totals.disbursed)} ج.م · المتبقي: {fmt(totals.remaining)} ج.م
        </div>
      </div>

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
                  <button
                    className="erp-filter-apply"
                    disabled={!!row.disbursed || !canConfirmDisbursement}
                    onClick={() => void confirmOne(row.id)}
                  >
                    {row.disbursed ? 'تم ✓' : 'تأكيد الصرف'}
                  </button>
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
