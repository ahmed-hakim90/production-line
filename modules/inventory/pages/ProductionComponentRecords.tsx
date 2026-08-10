import React, { useEffect, useMemo, useState } from 'react';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { componentReturnService } from '../services/componentReturnService';
import { componentScrapService } from '../services/componentScrapService';
import { productionIssueService } from '../services/productionIssueService';
import type { ComponentReturnRecord, ComponentScrapRecord } from '../types';
import { usePermission } from '../../../utils/permissions';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_SIZE = 20;
const COMPONENT_RECORDS_CACHE_KEY = 'inventory:production-component-records';

type ComponentRecordsPageData = {
  returns: ComponentReturnRecord[];
  scraps: ComponentScrapRecord[];
  issueWarehouseById: Record<string, string>;
};

export const ProductionComponentRecords: React.FC = () => {
  const { can } = usePermission();
  const { scoped, warehouseIds } = useMaterialsWarehouseScope();
  const allowedWarehouseIds = useMemo(() => new Set(warehouseIds), [warehouseIds]);
  const [returnsPage, setReturnsPage] = useState(1);
  const [scrapsPage, setScrapsPage] = useState(1);

  const {
    data,
    loading,
  } = useCachedPageLoad<ComponentRecordsPageData>(
    COMPONENT_RECORDS_CACHE_KEY,
    async () => {
      const [returnRows, scrapRows, issueRows] = await Promise.all([
        componentReturnService.getAll(),
        componentScrapService.getAll(),
        productionIssueService.getAll(),
      ]);
      const issueWarehouseById: Record<string, string> = {};
      issueRows.forEach((order) => {
        if (order.id) issueWarehouseById[order.id] = order.sourceWarehouseId;
      });
      return {
        returns: returnRows,
        scraps: scrapRows,
        issueWarehouseById,
      };
    },
    { maxAgeMs: 45_000 },
  );

  const returns = useMemo(() => {
    const rows = data?.returns ?? [];
    if (!scoped) return rows;
    if (allowedWarehouseIds.size === 0) return [];
    return rows.filter((row) => allowedWarehouseIds.has(row.warehouseId));
  }, [data, scoped, allowedWarehouseIds]);

  const scraps = useMemo(() => {
    const rows = data?.scraps ?? [];
    if (!scoped) return rows;
    if (allowedWarehouseIds.size === 0) return [];
    const issueWarehouseById = data?.issueWarehouseById ?? {};
    const allowedIssueIds = new Set(
      Object.entries(issueWarehouseById)
        .filter(([, warehouseId]) => allowedWarehouseIds.has(warehouseId))
        .map(([issueId]) => issueId),
    );
    return rows.filter((row) => allowedIssueIds.has(row.issueOrderId));
  }, [data, scoped, allowedWarehouseIds]);

  useEffect(() => { setReturnsPage(1); }, [returns.length]);
  useEffect(() => { setScrapsPage(1); }, [scraps.length]);

  const returnsTotalPages = Math.max(1, Math.ceil(returns.length / PAGE_SIZE));
  const scrapsTotalPages = Math.max(1, Math.ceil(scraps.length / PAGE_SIZE));
  const safeReturnsPage = Math.min(returnsPage, returnsTotalPages);
  const safeScrapsPage = Math.min(scrapsPage, scrapsTotalPages);
  const pagedReturns = useMemo(
    () => returns.slice((safeReturnsPage - 1) * PAGE_SIZE, safeReturnsPage * PAGE_SIZE),
    [returns, safeReturnsPage],
  );
  const pagedScraps = useMemo(
    () => scraps.slice((safeScrapsPage - 1) * PAGE_SIZE, safeScrapsPage * PAGE_SIZE),
    [scraps, safeScrapsPage],
  );

  if (!can('inventory.view')) return <p className="p-6 text-sm text-[var(--color-text-muted)]">لا تملك صلاحية عرض المخازن.</p>;

  if (loading && !data) {
    return (
      <ModuleOpsPageShell
        eyebrow="سجلات مكونات الإنتاج"
        rangeLabel="عرض سجلات المرتجعات والهالك الفعلي المرتبطة بأوامر الصرف"
      >
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </ModuleOpsPageShell>
    );
  }

  return (
    <ModuleOpsPageShell
      eyebrow="سجلات مكونات الإنتاج"
      rangeLabel="عرض سجلات المرتجعات والهالك الفعلي المرتبطة بأوامر الصرف"
    >
      <OpsDashPanel title="مرتجعات المكونات" accent="inventory" bodyClassName="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table w-full text-sm text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">المرجع</th>
                <th className="erp-th">المكون</th>
                <th className="erp-th text-center">الكمية</th>
                <th className="erp-th text-center">السبب</th>
                <th className="erp-th">اللوكيشن</th>
                <th className="erp-th">المستلم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {returns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--color-text-muted)]">لا توجد مرتجعات.</td>
                </tr>
              ) : (
                pagedReturns.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--color-bg)]/70/40">
                    <td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td>
                    <td className="px-4 py-3 font-semibold">{row.line.itemName}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{row.quantity}</td>
                    <td className="px-4 py-3 text-center">{row.reason}</td>
                    <td className="px-4 py-3">{row.locationCode}</td>
                    <td className="px-4 py-3">{row.receivedBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safeReturnsPage}
          totalPages={returnsTotalPages}
          totalItems={returns.length}
          onPageChange={setReturnsPage}
          itemLabel="مرتجع"
        />
      </OpsDashPanel>

      <OpsDashPanel title="الهالك الفعلي" accent="inventory" bodyClassName="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table w-full text-sm text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">المرجع</th>
                <th className="erp-th">المكون</th>
                <th className="erp-th text-center">الكمية</th>
                <th className="erp-th text-center">السبب</th>
                <th className="erp-th text-center">تعويض؟</th>
                <th className="erp-th">المسجل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {scraps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--color-text-muted)]">لا توجد سجلات هالك.</td>
                </tr>
              ) : (
                pagedScraps.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--color-bg)]/70/40">
                    <td className="px-4 py-3 font-mono text-xs">{row.referenceNo}</td>
                    <td className="px-4 py-3 font-semibold">{row.line.itemName}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{row.quantity}</td>
                    <td className="px-4 py-3 text-center">{row.reason}</td>
                    <td className="px-4 py-3 text-center">{row.needsCompensation ? 'نعم' : 'لا'}</td>
                    <td className="px-4 py-3">{row.createdBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safeScrapsPage}
          totalPages={scrapsTotalPages}
          totalItems={scraps.length}
          onPageChange={setScrapsPage}
          itemLabel="سجل"
        />
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
