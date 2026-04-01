import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { LowStockEntry } from '../hooks/useLowStockAlert';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

export const LowStockAlert: React.FC<{
  const { dir } = useAppDirection();
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: LowStockEntry[];
}> = ({ open, onOpenChange, entries }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir}>
        <DialogHeader>
          <DialogTitle>تنبيه انخفاض مخزون قطع الغيار</DialogTitle>
          <DialogDescription>
            يعرض هذا التنبيه الأصناف التي وصلت للحد الأدنى أو أقل داخل المخزون الحالي.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-72 overflow-auto">
          {entries.length === 0 && (
            <div className="rounded border p-2 text-sm text-muted-foreground">
              لا توجد أصناف منخفضة المخزون حاليًا.
            </div>
          )}
          {entries.map((e) => (
            <div key={e.partId} className="rounded border p-2 text-sm">
              <div className="font-medium">{e.partName}</div>
              <div className="text-muted-foreground">
                الكمية الحالية: {e.quantity} | الحد الأدنى: {e.minStock}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
