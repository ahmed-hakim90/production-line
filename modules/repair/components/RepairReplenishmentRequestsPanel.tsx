import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { withTenantPath } from '@/lib/tenantPaths';
import { toast } from '../../../components/Toast';
import { sparePartsReplenishmentService } from '../../inventory/services/sparePartsReplenishmentService';
import type { SparePartsReplenishmentRequest } from '../../inventory/types';
import { usePermission } from '../../../utils/permissions';

const STATUS_LABEL: Record<string, string> = {
  submitted: 'طلب جديد',
  approved: 'معتمد',
  prepared: 'تم التجهيز',
  responsible_approved: 'خرج / موافقة مسؤول',
  received: 'مستلم',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
};

type Props = {
  toWarehouseId?: string;
};

export const RepairReplenishmentRequestsPanel: React.FC<Props> = ({ toWarehouseId }) => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const canView = can('sparePartsReplenishment.view') || can('sparePartsReplenishment.create');
  const [rows, setRows] = useState<SparePartsReplenishmentRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canView || !toWarehouseId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void sparePartsReplenishmentService
      .listPaged({ toWarehouseId, limit: 15 })
      .then((res) => {
        if (!cancelled) setRows(res.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'تعذر تحميل طلبات التموين.');
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, toWarehouseId]);

  if (!canView) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">طلبات التموين من المخزن الرئيسي</CardTitle>
          <CardDescription>
            نفس مسار الموافقات: طلب → اعتماد → تجهيز → موافقة مسؤول → استلام.
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={withTenantPath(tenantSlug, '/inventory/spare-parts-replenishment')}>
            فتح التموين
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {!toWarehouseId ? (
          <p className="text-sm text-muted-foreground">اختر فرعًا مربوطًا بمخزن صيانة لعرض الطلبات.</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد طلبات تموين حديثة لهذا المخزن.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="erp-table w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th text-right">المرجع</th>
                  <th className="erp-th text-right">الحالة</th>
                  <th className="erp-th text-right">من</th>
                  <th className="erp-th text-right">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="p-2 font-mono text-xs">{row.referenceNo}</td>
                    <td className="p-2">
                      <Badge variant="outline">{STATUS_LABEL[row.status] || row.status}</Badge>
                    </td>
                    <td className="p-2">{row.fromWarehouseName || '—'}</td>
                    <td className="p-2 tabular-nums">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString('ar-EG') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
