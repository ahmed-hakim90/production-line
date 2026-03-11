import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/PageHeader';
import { useShallowStore } from '../../../store/useAppStore';

type ReportMode = 'monthly' | 'yearly';

const getCurrentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const getCurrentYear = (): string => String(new Date().getFullYear());

const getMonthRange = (month: string): { startDate: string; endDate: string } => {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
};

export const DepreciationReport: React.FC = () => {
  const [mode, setMode] = useState<ReportMode>('monthly');
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(getCurrentYear());

  const {
    assets,
    assetDepreciations,
    costCenters,
    costAllocations,
    productionReports,
    _rawLines,
    _rawProducts,
    fetchDepreciationReport,
    fetchDepreciationYear,
    fetchReports,
  } = useShallowStore((s) => ({
    assets: s.assets,
    assetDepreciations: s.assetDepreciations,
    costCenters: s.costCenters,
    costAllocations: s.costAllocations,
    productionReports: s.productionReports,
    _rawLines: s._rawLines,
    _rawProducts: s._rawProducts,
    fetchDepreciationReport: s.fetchDepreciationReport,
    fetchDepreciationYear: s.fetchDepreciationYear,
    fetchReports: s.fetchReports,
  }));

  useEffect(() => {
    if (mode === 'monthly') {
      void fetchDepreciationReport(month);
      const range = getMonthRange(month);
      void fetchReports(range.startDate, range.endDate);
    } else {
      void fetchDepreciationYear(year);
    }
  }, [mode, month, year, fetchDepreciationReport, fetchDepreciationYear, fetchReports]);

  const assetMap = useMemo(() => new Map(assets.map((a) => [String(a.id), a])), [assets]);
  const lineNameMap = useMemo(
    () => new Map(_rawLines.map((line) => [String(line.id || ''), String(line.name || '')])),
    [_rawLines],
  );
  const productNameMap = useMemo(
    () => new Map(_rawProducts.map((product) => [String(product.id || ''), String(product.name || '')])),
    [_rawProducts],
  );

  const totalDepreciation = useMemo(
    () => assetDepreciations.reduce((sum, row) => sum + Number(row.depreciationAmount || 0), 0),
    [assetDepreciations],
  );

  const monthlyBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    assetDepreciations.forEach((row) => {
      map.set(row.period, (map.get(row.period) || 0) + Number(row.depreciationAmount || 0));
    });
    return Array.from(map.entries())
      .map(([period, amount]) => ({ period, amount }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }, [assetDepreciations]);

  const centerBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    assetDepreciations.forEach((row) => {
      const asset = assetMap.get(String(row.assetId));
      const centerId = String(asset?.centerId || '');
      if (!centerId) return;
      map.set(centerId, (map.get(centerId) || 0) + Number(row.depreciationAmount || 0));
    });
    return Array.from(map.entries()).map(([centerId, amount]) => ({
      centerId,
      centerName: costCenters.find((c) => c.id === centerId)?.name || centerId,
      amount,
    })).sort((a, b) => b.amount - a.amount);
  }, [assetDepreciations, assetMap, costCenters]);

  const lineBreakdown = useMemo<Array<{ lineId: string; amount: number }>>(() => {
    if (mode !== 'monthly') return [];
    const centerAmountMap = new Map(centerBreakdown.map((row) => [row.centerId, row.amount]));
    const monthAllocations = costAllocations.filter((alloc) => alloc.month === month);
    const lineMap = new Map<string, number>();

    monthAllocations.forEach((alloc) => {
      const centerAmount = centerAmountMap.get(String(alloc.costCenterId)) || 0;
      if (centerAmount <= 0) return;
      alloc.allocations.forEach((lineAlloc) => {
        const ratio = Number(lineAlloc.percentage || 0) / 100;
        lineMap.set(lineAlloc.lineId, (lineMap.get(lineAlloc.lineId) || 0) + (centerAmount * ratio));
      });
    });

    return Array.from(lineMap.entries())
      .map(([lineId, amount]) => ({ lineId, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [mode, month, centerBreakdown, costAllocations]);

  const productBreakdown = useMemo<Array<{ lineId: string; productId: string; amount: number }>>(() => {
    if (mode !== 'monthly') return [];
    const lineAmountMap = new Map(lineBreakdown.map((row) => [row.lineId, row.amount]));
    const lineTotalQty = new Map<string, number>();
    const lineProductQty = new Map<string, number>();

    productionReports.forEach((report) => {
      const qty = Number(report.quantityProduced || 0);
      if (qty <= 0) return;
      lineTotalQty.set(report.lineId, (lineTotalQty.get(report.lineId) || 0) + qty);
      const key = `${report.lineId}__${report.productId}`;
      lineProductQty.set(key, (lineProductQty.get(key) || 0) + qty);
    });

    const rows: Array<{ lineId: string; productId: string; amount: number }> = [];
    lineProductQty.forEach((qty, key) => {
      const [lineId, productId] = key.split('__');
      const lineAmount = lineAmountMap.get(lineId) || 0;
      const totalQty = lineTotalQty.get(lineId) || 0;
      if (lineAmount <= 0 || totalQty <= 0) return;
      rows.push({
        lineId,
        productId,
        amount: lineAmount * (qty / totalQty),
      });
    });

    return rows.sort((a, b) => b.amount - a.amount);
  }, [mode, lineBreakdown, productionReports]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقرير الإهلاك"
        subtitle="تحليل الإهلاك الشهري والسنوي وربطه بمراكز التكلفة والخطوط والمنتجات"
        icon="receipt_long"
        extra={(
          <div className="flex items-center gap-2">
            <select className="h-10 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value as ReportMode)}>
              <option value="monthly">شهري</option>
              <option value="yearly">سنوي</option>
            </select>
            {mode === 'monthly' ? (
              <input type="month" className="h-10 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
            ) : (
              <input type="number" className="h-10 w-28 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm" min={2020} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
            )}
          </div>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-xs text-[var(--color-text-muted)]">الإهلاك {mode === 'monthly' ? 'الشهري' : 'السنوي'}</div>
          <div className="text-lg font-bold mt-1">{totalDepreciation.toFixed(2)}</div>
        </div>
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-xs text-[var(--color-text-muted)]">عدد سجلات الإهلاك</div>
          <div className="text-lg font-bold mt-1">{assetDepreciations.length}</div>
        </div>
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-xs text-[var(--color-text-muted)]">إجمالي الإهلاك (تراكمي بالتقرير)</div>
          <div className="text-lg font-bold mt-1 text-primary">{monthlyBreakdown.reduce((s, r) => s + r.amount, 0).toFixed(2)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="p-4 border-b border-[var(--color-border)] font-semibold">الإهلاك حسب الفترات</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="erp-thead">
                <tr className="bg-[#f8f9fa]/50 text-[var(--color-text-muted)]">
                  <th className="erp-th">الفترة</th>
                  <th className="erp-th">قيمة الإهلاك</th>
                </tr>
              </thead>
              <tbody>
                {monthlyBreakdown.map((row) => (
                  <tr key={row.period} className="border-t border-[var(--color-border)]">
                    <td className="py-3 px-4">{row.period}</td>
                    <td className="py-3 px-4 tabular-nums">{row.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="p-4 border-b border-[var(--color-border)] font-semibold">الإهلاك حسب المراكز</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="erp-thead">
                <tr className="bg-[#f8f9fa]/50 text-[var(--color-text-muted)]">
                  <th className="erp-th">المركز</th>
                  <th className="erp-th">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {centerBreakdown.map((row) => (
                  <tr key={row.centerId} className="border-t border-[var(--color-border)]">
                    <td className="py-3 px-4">{row.centerName}</td>
                    <td className="py-3 px-4 tabular-nums">{row.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {mode === 'monthly' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
            <div className="p-4 border-b border-[var(--color-border)] font-semibold">توزيع الإهلاك على الخطوط</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="erp-thead">
                  <tr className="bg-[#f8f9fa]/50 text-[var(--color-text-muted)]">
                    <th className="erp-th">الخط</th>
                    <th className="erp-th">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {lineBreakdown.map((row) => (
                    <tr key={row.lineId} className="border-t border-[var(--color-border)]">
                      <td className="py-3 px-4">{lineNameMap.get(row.lineId) || row.lineId}</td>
                      <td className="py-3 px-4 tabular-nums">{row.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  {lineBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-[var(--color-text-muted)]">لا يوجد توزيع متاح لهذا الشهر</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
            <div className="p-4 border-b border-[var(--color-border)] font-semibold">توزيع الإهلاك على المنتجات</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="erp-thead">
                  <tr className="bg-[#f8f9fa]/50 text-[var(--color-text-muted)]">
                    <th className="erp-th">الخط</th>
                    <th className="erp-th">المنتج</th>
                    <th className="erp-th">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {productBreakdown.map((row, idx) => (
                    <tr key={`${row.lineId}_${row.productId}_${idx}`} className="border-t border-[var(--color-border)]">
                      <td className="py-3 px-4">{lineNameMap.get(row.lineId) || row.lineId}</td>
                      <td className="py-3 px-4">{productNameMap.get(row.productId) || row.productId}</td>
                      <td className="py-3 px-4 tabular-nums">{row.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  {productBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-[var(--color-text-muted)]">لا يوجد توزيع متاح لهذا الشهر</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
