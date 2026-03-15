import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { Button } from '../../../components/UI';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { DataTable, type Column } from '../../../src/components/erp/DataTable';
import { KPICard } from '../../../src/components/erp/KPICard';
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
  const navigate = useNavigate();
  const [mode, setMode] = useState<ReportMode>('monthly');
  const [month, setMonth] = useState(getCurrentMonth());

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
      const selectedYear = month.split('-')[0] || getCurrentYear();
      void fetchDepreciationYear(selectedYear);
    }
  }, [mode, month, fetchDepreciationReport, fetchDepreciationYear, fetchReports]);

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
      const centerAmount = Number(centerAmountMap.get(String(alloc.costCenterId)) || 0);
      if (centerAmount <= 0) return;
      (alloc.allocations || []).forEach((lineAlloc: any) => {
        const lineId = String(lineAlloc?.lineId || '');
        if (!lineId) return;
        const ratio = Number(lineAlloc?.percentage || 0) / 100;
        lineMap.set(lineId, (lineMap.get(lineId) || 0) + (centerAmount * ratio));
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
      const lineAmount = Number(lineAmountMap.get(lineId) || 0);
      const totalQty = Number(lineTotalQty.get(lineId) || 0);
      if (lineAmount <= 0 || totalQty <= 0) return;
      const safeQty = Number(qty || 0);
      rows.push({
        lineId,
        productId,
        amount: lineAmount * (safeQty / totalQty),
      });
    });

    return rows.sort((a, b) => b.amount - a.amount);
  }, [mode, lineBreakdown, productionReports]);

  const periodColumns: Column<{ period: string; amount: number }>[] = [
    { key: 'period', header: 'الفترة', cell: (row) => row.period, sortable: true },
    {
      key: 'amount',
      header: 'قيمة الإهلاك',
      cell: (row) => row.amount.toFixed(2),
      align: 'center',
      sortable: true,
    },
  ];

  const centerColumns: Column<{ centerId: string; centerName: string; amount: number }>[] = [
    { key: 'center', header: 'المركز', cell: (row) => row.centerName, sortable: true },
    {
      key: 'amount',
      header: 'القيمة',
      cell: (row) => row.amount.toFixed(2),
      align: 'center',
      sortable: true,
    },
  ];

  const lineColumns: Column<{ lineId: string; amount: number }>[] = [
    {
      key: 'line',
      header: 'الخط',
      cell: (row) => lineNameMap.get(row.lineId) || row.lineId,
      sortable: true,
    },
    {
      key: 'amount',
      header: 'القيمة',
      cell: (row) => row.amount.toFixed(2),
      align: 'center',
      sortable: true,
    },
  ];

  const productColumns: Column<{ lineId: string; productId: string; amount: number }>[] = [
    {
      key: 'line',
      header: 'الخط',
      cell: (row) => lineNameMap.get(row.lineId) || row.lineId,
      sortable: true,
    },
    {
      key: 'product',
      header: 'المنتج',
      cell: (row) => productNameMap.get(row.productId) || row.productId,
      sortable: true,
    },
    {
      key: 'amount',
      header: 'القيمة',
      cell: (row) => row.amount.toFixed(2),
      align: 'center',
      sortable: true,
    },
  ];

  return (
    <div className="space-y-6 erp-ds-clean">
      <PageHeader
        title="تقرير الإهلاك"
        subtitle="تحليل الإهلاك الشهري والسنوي وربطه بمراكز التكلفة والخطوط والمنتجات"
        icon="receipt_long"
        backAction={false}
        extra={(
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <span>رجوع</span>
            </Button>
            <Select value={mode} onValueChange={(v) => setMode(v as ReportMode)}>
              <SelectTrigger className="h-10 w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm">
                <SelectValue placeholder="الفترة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">شهري</SelectItem>
                <SelectItem value="yearly">سنوي</SelectItem>
              </SelectContent>
            </Select>
            <input
              type="month"
              className="h-10 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          label={`الإهلاك ${mode === 'monthly' ? 'الشهري' : 'السنوي'}`}
          value={totalDepreciation.toFixed(2)}
          iconType="money"
          color="indigo"
        />
        <KPICard
          label="عدد سجلات الإهلاك"
          value={assetDepreciations.length}
          iconType="metric"
          color="green"
        />
        <KPICard
          label="إجمالي الإهلاك (تراكمي بالتقرير)"
          value={monthlyBreakdown.reduce((s, r) => s + r.amount, 0).toFixed(2)}
          iconType="trend"
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="p-4 border-b border-[var(--color-border)] text-sm font-medium">الإهلاك حسب الفترات</div>
          <DataTable
            columns={periodColumns}
            data={monthlyBreakdown}
            emptyMessage="لا توجد بيانات للفترة المحددة"
          />
        </div>

        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="p-4 border-b border-[var(--color-border)] text-sm font-medium">الإهلاك حسب المراكز</div>
          <DataTable
            columns={centerColumns}
            data={centerBreakdown}
            emptyMessage="لا توجد مراكز مرتبطة"
          />
        </div>
      </div>

      {mode === 'monthly' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
            <div className="p-4 border-b border-[var(--color-border)] text-sm font-medium">توزيع الإهلاك على الخطوط</div>
            <DataTable
              columns={lineColumns}
              data={lineBreakdown}
              emptyMessage="لا يوجد توزيع متاح لهذا الشهر"
            />
          </div>

          <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
            <div className="p-4 border-b border-[var(--color-border)] text-sm font-medium">توزيع الإهلاك على المنتجات</div>
            <DataTable
              columns={productColumns}
              data={productBreakdown}
              emptyMessage="لا يوجد توزيع متاح لهذا الشهر"
            />
          </div>
        </div>
      )}
    </div>
  );
};
