import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  SPARE_PARTS_REPLENISHMENT_STATUS_LABELS,
  canReceiveSparePartsRequest,
} from '../../inventory/lib/sparePartsReplenishment';
import type { SparePartsReplenishmentRequest } from '../../inventory/types';

const fmtQty = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

const fmtDate = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type Props = {
  request: SparePartsReplenishmentRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canReceive?: boolean;
  receiving?: boolean;
  onConfirmReceive?: (requestId: string) => void;
};

export const RepairReplenishmentRequestPreviewModal: React.FC<Props> = ({
  request,
  open,
  onOpenChange,
  canReceive = false,
  receiving = false,
  onConfirmReceive,
}) => {
  const requestId = String(request?.id || '').trim();
  const showReceive = Boolean(
    request
    && canReceive
    && requestId
    && onConfirmReceive
    && canReceiveSparePartsRequest(request),
  );
  const lines = request?.lines || [];

  return (
    <Dialog open={open && Boolean(request)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        {request ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span>معاينة طلب التموين</span>
                <span className="font-mono text-base">{request.referenceNo}</span>
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="secondary">
                  {SPARE_PARTS_REPLENISHMENT_STATUS_LABELS[request.status] || request.status}
                </Badge>
                <span className="text-xs">
                  من {request.fromWarehouseName || '—'} → إلى {request.toWarehouseName || '—'}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">تاريخ الإنشاء</p>
                  <p>{fmtDate(request.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">أنشئ بواسطة</p>
                  <p>{request.createdBy || '—'}</p>
                </div>
                {request.responsibleApprovedAt ? (
                  <div>
                    <p className="text-xs text-muted-foreground">موافقة المسؤول</p>
                    <p>
                      {fmtDate(request.responsibleApprovedAt)}
                      {request.responsibleApprovedBy ? ` — ${request.responsibleApprovedBy}` : ''}
                    </p>
                  </div>
                ) : null}
                {request.receivedAt ? (
                  <div>
                    <p className="text-xs text-muted-foreground">الاستلام</p>
                    <p>
                      {fmtDate(request.receivedAt)}
                      {request.receivedBy ? ` — ${request.receivedBy}` : ''}
                    </p>
                  </div>
                ) : null}
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">ملاحظة</p>
                <p className="rounded-md border bg-muted/30 px-3 py-2">
                  {request.note?.trim() || '—'}
                </p>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-right font-medium">المكوّن</th>
                      <th className="p-2 text-right font-medium">الكود</th>
                      <th className="p-2 text-right font-medium">مطلوب</th>
                      <th className="p-2 text-right font-medium">مجهّز</th>
                      <th className="p-2 text-right font-medium">مستلم</th>
                      <th className="p-2 text-right font-medium">الوحدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-muted-foreground">
                          لا توجد بنود في هذا الطلب.
                        </td>
                      </tr>
                    ) : (
                      lines.map((line) => (
                        <tr key={line.lineId || line.itemId} className="border-t">
                          <td className="p-2">{line.itemName || '—'}</td>
                          <td className="p-2 text-muted-foreground font-mono text-xs">
                            {line.itemCode || '—'}
                          </td>
                          <td className="p-2 tabular-nums">{fmtQty(line.requestedQty)}</td>
                          <td className="p-2 tabular-nums">
                            {fmtQty(line.preparedQty ?? line.requestedQty)}
                          </td>
                          <td className="p-2 tabular-nums">
                            {line.receivedQty != null ? fmtQty(line.receivedQty) : '—'}
                          </td>
                          <td className="p-2 text-muted-foreground">{line.unit || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                إغلاق
              </Button>
              {showReceive ? (
                <Button
                  type="button"
                  disabled={receiving}
                  onClick={() => onConfirmReceive?.(requestId)}
                >
                  {receiving ? 'جاري التأكيد…' : 'تأكيد الاستلام'}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
