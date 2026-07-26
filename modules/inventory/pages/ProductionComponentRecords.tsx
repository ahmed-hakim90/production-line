import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '../components/UI';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { componentReturnService } from '../services/componentReturnService';
import { componentScrapService } from '../services/componentScrapService';
import { productionIssueService } from '../services/productionIssueService';
import type { ComponentReturnRecord, ComponentScrapRecord } from '../types';
import { usePermission } from '../../../utils/permissions';
import { useMaterialsWarehouseScope } from '../hooks/useMaterialsWarehouseScope';

const PAGE_SIZE = 20;

export const ProductionComponentRecords: React.FC = () => {
  const { can } = usePermission();
  const { scoped, warehouseIds } = useMaterialsWarehouseScope();
  const allowedWarehouseIds = useMemo(() => new Set(warehouseIds), [warehouseIds]);
  const [returns, setReturns] = useState<ComponentReturnRecord[]>([]);
  const [scraps, setScraps] = useState<ComponentScrapRecord[]>([]);
  const [returnsPage, setReturnsPage] = useState(1);
  const [scrapsPage, setScrapsPage] = useState(1);

  useEffect(() => {
    void Promise.all([
      componentReturnService.getAll(),
      componentScrapService.getAll(),
      productionIssueService.getAll(),
    ]).then(([returnRows, scrapRows, issueRows]) => {
      if (!scoped) {
        setReturns(returnRows);
        setScraps(scrapRows);
        return;
      }
      if (allowedWarehouseIds.size === 0) {
        setReturns([]);
        setScraps([]);
        return;
      }
      const allowedIssueIds = new Set(
        issueRows
          .filter((order) => allowedWarehouseIds.has(order.sourceWarehouseId))
          .map((order) => order.id)
          .filter(Boolean) as string[],
      );
      setReturns(returnRows.filter((row) => allowedWarehouseIds.has(row.warehouseId)));
      setScraps(scrapRows.filter((row) => allowedIssueIds.has(row.issueOrderId)));
    });
  }, [scoped, allowedWarehouseIds]);

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

  if (!can('inventory.view')) return <p className="p-6 text-sm text-slate-500">لا تملك صلاحية عرض المخازن.</p>;

  return (
    <div className="erp-ds-clean space-y-5">
      <PageHeader title="سجلات مكونات الإنتاج" subtitle="عرض سجلات المرتجعات والهالك الفعلي المرتبطة بأوامر الصرف." icon="receipt_long" />

      <Card className="!p-0 overflow-hidden" title="مرتجعات المكونات">
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
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">لا توجد مرتجعات.</td>
                </tr>
              ) : (
                pagedReturns.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
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
      </Card>

      <Card className="!p-0 overflow-hidden" title="الهالك الفعلي">
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
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">لا توجد سجلات هالك.</td>
                </tr>
              ) : (
                pagedScraps.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
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
      </Card>
    </div>
  );
};
