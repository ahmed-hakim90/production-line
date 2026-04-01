import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { withTenantPath } from '@/lib/tenantPaths';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobService } from '../services/repairJobService';
import { repairSalesInvoiceService } from '../services/repairSalesInvoiceService';
import { sparePartsService } from '../services/sparePartsService';
import type { RepairBranch, RepairJob, RepairSalesInvoice, RepairSparePart, RepairSparePartStock } from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(n);

type BranchKpi = {
  branch: RepairBranch;
  totalJobs: number;
  openJobs: number;
  deliveredJobs: number;
  readyJobs: number;
  successRate: number;
  revenue: number;
  partsRevenue: number;
  totalRevenue: number;
  lowStockCount: number;
};

export const RepairAdminDashboard: React.FC = () => {
  const { dir } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<RepairSalesInvoice[]>([]);
  const [partsByBranch, setPartsByBranch] = useState<Record<string, RepairSparePart[]>>({});
  const [stockByBranch, setStockByBranch] = useState<Record<string, RepairSparePartStock[]>>({});

  useEffect(() => {
    void repairBranchService.list().then(setBranches);
    const unsub = repairJobService.subscribeAll(setJobs);
    const unsubInvoices = repairSalesInvoiceService.subscribeAll(setSalesInvoices);
    return () => {
      unsub();
      unsubInvoices();
    };
  }, []);

  useEffect(() => {
    if (branches.length === 0) return;
    void Promise.all(
      branches.map(async (branch) => {
        const branchId = branch.id || '';
        const [parts, stock] = await Promise.all([
          sparePartsService.listParts(branchId),
          sparePartsService.listStock(branchId, branch.warehouseId),
        ]);
        return { branchId, parts, stock };
      }),
    ).then((rows) => {
      const nextParts: Record<string, RepairSparePart[]> = {};
      const nextStock: Record<string, RepairSparePartStock[]> = {};
      rows.forEach((row) => {
        nextParts[row.branchId] = row.parts;
        nextStock[row.branchId] = row.stock;
      });
      setPartsByBranch(nextParts);
      setStockByBranch(nextStock);
    });
  }, [branches]);

  const cards = useMemo<BranchKpi[]>(() => {
    return branches.map((branch) => {
      const branchId = branch.id || '';
      const branchJobs = jobs.filter((j) => j.branchId === branchId);
      const totalJobs = branchJobs.length;
      const openJobs = branchJobs.filter((j) => !['delivered', 'unrepairable'].includes(j.status)).length;
      const deliveredJobs = branchJobs.filter((j) => j.status === 'delivered').length;
      const readyJobs = branchJobs.filter((j) => j.status === 'ready').length;
      const successRate = totalJobs > 0 ? (deliveredJobs / totalJobs) * 100 : 0;
      const revenue = branchJobs
        .filter((j) => j.status === 'delivered')
        .reduce((sum, j) => sum + Number(j.finalCost || 0), 0);
      const partsRevenue = salesInvoices
        .filter((invoice) => invoice.branchId === branchId)
        .reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
      const totalRevenue = revenue + partsRevenue;

      const parts = partsByBranch[branchId] || [];
      const stock = stockByBranch[branchId] || [];
      const stockMap = new Map(stock.map((s) => [s.partId, Number(s.quantity || 0)]));
      const lowStockCount = parts.filter((p) => Number(stockMap.get(p.id || '') || 0) <= Number(p.minStock || 0)).length;

      return {
        branch,
        totalJobs,
        openJobs,
        deliveredJobs,
        readyJobs,
        successRate,
        revenue,
        partsRevenue,
        totalRevenue,
        lowStockCount,
      };
    });
  }, [branches, jobs, salesInvoices, partsByBranch, stockByBranch]);

  const overview = useMemo(() => {
    const totalJobs = cards.reduce((sum, card) => sum + card.totalJobs, 0);
    const openJobs = cards.reduce((sum, card) => sum + card.openJobs, 0);
    const readyJobs = cards.reduce((sum, card) => sum + card.readyJobs, 0);
    const deliveredJobs = cards.reduce((sum, card) => sum + card.deliveredJobs, 0);
    const revenue = cards.reduce((sum, card) => sum + card.revenue, 0);
    const partsRevenue = cards.reduce((sum, card) => sum + card.partsRevenue, 0);
    const totalRevenue = cards.reduce((sum, card) => sum + card.totalRevenue, 0);
    const lowStockCount = cards.reduce((sum, card) => sum + card.lowStockCount, 0);
    const successRate = totalJobs > 0 ? (deliveredJobs / totalJobs) * 100 : 0;
    return { totalJobs, openJobs, readyJobs, deliveredJobs, revenue, partsRevenue, totalRevenue, lowStockCount, successRate };
  }, [cards]);

  const rankedCards = useMemo(
    () => [...cards].sort((a, b) => b.successRate - a.successRate || b.revenue - a.revenue),
    [cards],
  );

  return (
    <div className="space-y-5" dir={dir}>
      <Card className="border-primary/20 bg-gradient-to-l from-primary/10 via-sky-50 to-white shadow-sm">
        <CardContent className="pt-6 pb-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">لوحة أوامر الصيانة - الإدارة</h1>
              <p className="text-sm text-muted-foreground mt-1">
                رؤية تنفيذية موحّدة لأداء الفروع، الطلبات، الإيراد، وحالة المخزون في الوقت الفعلي.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="w-fit text-xs">
                عدد الفروع النشطة: {fmt(cards.length)}
              </Badge>
              <Link to={withTenantPath(tenantSlug, '/repair/admin-orders')}>
                <Button size="sm" variant="outline">عرض طلبات الأدمن</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="shadow-sm">
          <CardContent className="pt-5 space-y-1">
            <p className="text-xs text-muted-foreground">إجمالي الطلبات</p>
            <p className="text-2xl font-bold">{fmt(overview.totalJobs)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 space-y-1">
            <p className="text-xs text-muted-foreground">طلبات قيد التنفيذ</p>
            <p className="text-2xl font-bold text-amber-600">{fmt(overview.openJobs)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 space-y-1">
            <p className="text-xs text-muted-foreground">جاهز للتسليم</p>
            <p className="text-2xl font-bold text-indigo-600">{fmt(overview.readyJobs)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 space-y-1">
            <p className="text-xs text-muted-foreground">إيراد الصيانة</p>
            <p className="text-2xl font-bold text-emerald-600">{fmt(overview.revenue)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 space-y-1">
            <p className="text-xs text-muted-foreground">مبيعات قطع الغيار</p>
            <p className="text-2xl font-bold text-sky-600">{fmt(overview.partsRevenue)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground mb-1">نسبة النجاح العامة</p>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">{overview.successRate.toFixed(1)}%</span>
                <span className="text-xs text-muted-foreground">
                  {fmt(overview.deliveredJobs)} من {fmt(overview.totalJobs)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(100, Math.max(0, overview.successRate))}%` }}
                />
              </div>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground mb-1">الطلبات الجاهزة للتسليم</p>
              <p className="text-xl font-bold">{fmt(overview.readyJobs)}</p>
              <p className="text-xs text-muted-foreground mt-1">الطلبات المكتملة فنياً وتنتظر إنهاء التسليم.</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground mb-1">تنبيه المخزون</p>
              <p className={`text-xl font-bold ${overview.lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {fmt(overview.lowStockCount)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">عدد الأصناف تحت الحد الأدنى عبر كل الفروع.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {rankedCards.map((card) => (
          <Card key={card.branch.id} className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{card.branch.name}</span>
                  {card.branch.isMain && <Badge>الفرع الرئيسي</Badge>}
                </div>
                <Badge variant={card.successRate >= 75 ? 'default' : 'secondary'}>
                  أداء {card.successRate.toFixed(0)}%
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div className="rounded-lg border p-2.5 bg-slate-50/70">
                  <div className="text-muted-foreground">إجمالي الطلبات</div>
                  <div className="font-bold">{fmt(card.totalJobs)}</div>
                </div>
                <div className="rounded-lg border p-2.5 bg-amber-50/60">
                  <div className="text-muted-foreground">طلبات مفتوحة</div>
                  <div className="font-bold">{fmt(card.openJobs)}</div>
                </div>
                <div className="rounded-lg border p-2.5 bg-indigo-50/60">
                  <div className="text-muted-foreground">جاهز للتسليم</div>
                  <div className="font-bold">{fmt(card.readyJobs)}</div>
                </div>
                <div className="rounded-lg border p-2.5 bg-emerald-50/60">
                  <div className="text-muted-foreground">طلبات منجزة</div>
                  <div className="font-bold">{fmt(card.deliveredJobs)}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg border p-2.5">
                  <div className="text-muted-foreground">نسبة النجاح</div>
                  <div className="font-bold">{card.successRate.toFixed(1)}%</div>
                </div>
                <div className="rounded-lg border p-2.5">
                  <div className="text-muted-foreground">إيراد الصيانة</div>
                  <div className="font-bold text-emerald-600">{fmt(card.revenue)}</div>
                </div>
                <div className="rounded-lg border p-2.5">
                  <div className="text-muted-foreground">مبيعات قطع الغيار</div>
                  <div className="font-bold text-sky-600">{fmt(card.partsRevenue)}</div>
                </div>
                <div className="rounded-lg border p-2.5">
                  <div className="text-muted-foreground">الإجمالي التشغيلي</div>
                  <div className="font-bold text-emerald-700">{fmt(card.totalRevenue)}</div>
                </div>
                <div className="rounded-lg border p-2.5">
                  <div className="text-muted-foreground">منخفض المخزون</div>
                  <div className={`font-bold ${card.lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {fmt(card.lowStockCount)}
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>معدل الإنجاز</span>
                  <span>{card.successRate.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/80"
                    style={{ width: `${Math.min(100, Math.max(0, card.successRate))}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">ترتيب الفروع حسب الأداء</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">الفرع</th>
                  <th className="text-right py-2 px-2 font-medium">الطلبات</th>
                  <th className="text-right py-2 px-2 font-medium">المنجز</th>
                  <th className="text-right py-2 px-2 font-medium">نسبة النجاح</th>
                  <th className="text-right py-2 px-2 font-medium">إيراد الصيانة</th>
                  <th className="text-right py-2 px-2 font-medium">مبيعات قطع الغيار</th>
                  <th className="text-right py-2 px-2 font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {rankedCards.map((card) => (
                  <tr key={`${card.branch.id}-row`} className="border-b last:border-b-0">
                    <td className="py-2 px-2 font-medium">{card.branch.name}</td>
                    <td className="py-2 px-2">{fmt(card.totalJobs)}</td>
                    <td className="py-2 px-2">{fmt(card.deliveredJobs)}</td>
                    <td className="py-2 px-2">{card.successRate.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-emerald-600">{fmt(card.revenue)}</td>
                    <td className="py-2 px-2 text-sky-600">{fmt(card.partsRevenue)}</td>
                    <td className="py-2 px-2 text-emerald-700">{fmt(card.totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RepairAdminDashboard;
