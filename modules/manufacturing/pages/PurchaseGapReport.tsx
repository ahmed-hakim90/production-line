import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { PrimaryButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '../../../store/useAppStore';
import { purchaseGapService, type PurchaseGapRow } from '../services/purchaseGapService';
import { exportGenericRows } from '../../../utils/exportExcel';
import { purchaseOrderDraftService } from '../services/purchaseOrderDraftService';

export const PurchaseGapReport: React.FC = () => {
  const systemSettings = useAppStore((s) => s.systemSettings);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PurchaseGapRow[]>([]);
  const [draftMsg, setDraftMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await purchaseGapService.buildGapReport(systemSettings));
    } finally {
      setLoading(false);
    }
  }, [systemSettings]);

  useEffect(() => {
    void load();
  }, [load]);

  const createDraft = async () => {
    const id = await purchaseOrderDraftService.createFromGap(rows);
    setDraftMsg(id ? `تم إنشاء مسودة طلب شراء: ${id}` : 'تعذر إنشاء المسودة');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="فجوة الشراء"
        subtitle="المواد الناقصة مقارنة باحتياجات الخطط في مستودع المواد الخام"
        actions={
          <>
            <PrimaryButton onClick={() => void load()} disabled={loading}>تحديث</PrimaryButton>
            <PrimaryButton
              onClick={() =>
                exportGenericRows(
                  rows.map((r) => ({
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
              disabled={!rows.length}
            >
              Excel
            </PrimaryButton>
            <PrimaryButton onClick={() => void createDraft()} disabled={!rows.length}>
              مسودة طلب شراء
            </PrimaryButton>
          </>
        }
      />
      {draftMsg && <p className="text-sm font-bold text-primary">{draftMsg}</p>}

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>أصناف ناقصة ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
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
                {rows.map((r) => (
                  <tr key={r.materialId}>
                    <td className="px-3 py-2">{r.materialName}</td>
                    <td className="px-3 py-2 tabular-nums">{r.requiredQty}</td>
                    <td className="px-3 py-2 tabular-nums">{r.availableQty}</td>
                    <td className="px-3 py-2 tabular-nums font-bold text-rose-600">{r.gapQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
