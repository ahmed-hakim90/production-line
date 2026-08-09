import React, { useState } from 'react';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { PrimaryButton } from '@/src/components/erp/ActionButton';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '../../../store/useAppStore';
import { purchaseGapService, type PurchaseGapRow } from '../services/purchaseGapService';
import { exportGenericRows } from '../../../utils/exportExcel';
import { purchaseOrderDraftService } from '../services/purchaseOrderDraftService';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';

const PURCHASE_GAP_CACHE_KEY = 'manufacturing:purchase-gap';

export const PurchaseGapReport: React.FC = () => {
  const systemSettings = useAppStore((s) => s.systemSettings);
  const [draftMsg, setDraftMsg] = useState('');

  const {
    data: rows = [],
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<PurchaseGapRow[]>(
    PURCHASE_GAP_CACHE_KEY,
    () => purchaseGapService.buildGapReport(systemSettings),
    { maxAgeMs: 45_000 },
  );

  const load = async () => {
    invalidatePageDataCache(PURCHASE_GAP_CACHE_KEY);
    await reloadCached(true);
  };

  const createDraft = async () => {
    const id = await purchaseOrderDraftService.createFromGap(rows ?? []);
    setDraftMsg(id ? `تم إنشاء مسودة طلب شراء: ${id}` : 'تعذر إنشاء المسودة');
  };

  const list = rows ?? [];

  return (
    <ModuleOpsPageShell
      eyebrow="فجوة الشراء"
      rangeLabel="المواد الناقصة مقارنة باحتياجات الخطط في مستودع المواد الخام"
      onRefresh={() => void load()}
      refreshing={loading}
      actions={(
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            onClick={() =>
              exportGenericRows(
                list.map((r) => ({
                  المادة: r.materialName,
                  المطلوب: r.requiredQty,
                  المتاح: r.availableQty,
                  النقص: r.gapQty,
                  الوحدة: r.unit || '',
                })),
                'purchase-gap',
                'فجوة شراء',
              )
            }
            disabled={!list.length}
            iconName="download"
            tone="export"
          >
            Excel
          </PrimaryButton>
          <PrimaryButton onClick={() => void createDraft()} disabled={!list.length} iconName="add_circle" tone="submit">
            مسودة طلب شراء
          </PrimaryButton>
        </div>
      )}
    >
      {draftMsg && <p className="text-sm font-bold text-primary">{draftMsg}</p>}

      {loading && list.length === 0 ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <OpsDashPanel title={`أصناف ناقصة (${list.length})`} accent="inventory" bodyClassName="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="erp-table w-full text-right text-sm">
              <thead>
                <tr>
                  <th className="erp-th">المادة</th>
                  <th className="erp-th">مطلوب</th>
                  <th className="erp-th">متاح</th>
                  <th className="erp-th">النقص</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.materialId}>
                    <td className="px-3 py-2">{r.materialName}</td>
                    <td className="px-3 py-2 tabular-nums">{r.requiredQty}</td>
                    <td className="px-3 py-2 tabular-nums">{r.availableQty}</td>
                    <td className="px-3 py-2 tabular-nums font-bold text-rose-600">{r.gapQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OpsDashPanel>
      )}
    </ModuleOpsPageShell>
  );
};
