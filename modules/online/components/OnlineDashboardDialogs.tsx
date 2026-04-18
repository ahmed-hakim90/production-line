import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type OnlineDashboardDialogsProps = {
  cancelTarget: { id: string; barcode: string } | null;
  cancelBusy: boolean;
  onCancelClose: () => void;
  onCancelConfirm: () => void;

  bulkCancelIds: string[] | null;
  bulkBusy: boolean;
  onBulkClose: () => void;
  onBulkConfirm: () => void;

  deleteTarget: { id: string; barcode: string } | null;
  deleteBusy: boolean;
  onDeleteClose: () => void;
  onDeleteConfirm: () => void;
};

export const OnlineDashboardDialogs: React.FC<OnlineDashboardDialogsProps> = ({
  cancelTarget,
  cancelBusy,
  onCancelClose,
  onCancelConfirm,
  bulkCancelIds,
  bulkBusy,
  onBulkClose,
  onBulkConfirm,
  deleteTarget,
  deleteBusy,
  onDeleteClose,
  onDeleteConfirm,
}) => {
  return (
    <>
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && !cancelBusy && onCancelClose()}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إلغاء من التسليم</DialogTitle>
            <DialogDescription className="text-right">
              تُسجَّل الشحنة بحالة «تم الإلغاء من التسليم» ولن تُحسب في انتظار تسليم البوسطة (مناسب مثلًا بعد إلغاء
              الطلب في بوسطة). الباركود:{' '}
              <span className="font-mono font-semibold">{cancelTarget?.barcode}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button
              type="button"
              variant="destructive"
              disabled={cancelBusy}
              onClick={() => void onCancelConfirm()}
            >
              {cancelBusy ? 'جاري…' : 'تأكيد الإلغاء من التسليم'}
            </Button>
            <Button type="button" variant="outline" disabled={cancelBusy} onClick={onCancelClose}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bulkCancelIds} onOpenChange={(open) => !open && !bulkBusy && onBulkClose()}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إلغاء من التسليم — دفعة</DialogTitle>
            <DialogDescription className="text-right space-y-2">
              <span>
                سيتم تطبيق الإجراء على{' '}
                <strong className="tabular-nums">{bulkCancelIds?.length ?? 0}</strong> شحنة محددة.
              </span>
              <span className="block text-xs leading-relaxed">
                تُسجَّل الشحنات بحالة «تم الإلغاء من التسليم» ولن تُحسب في انتظار تسليم البوسطة.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button type="button" variant="destructive" disabled={bulkBusy} onClick={() => void onBulkConfirm()}>
              {bulkBusy ? 'جاري…' : 'تأكيد'}
            </Button>
            <Button type="button" variant="outline" disabled={bulkBusy} onClick={onBulkClose}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleteBusy && onDeleteClose()}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>حذف نهائي من قاعدة البيانات</DialogTitle>
            <DialogDescription className="text-right space-y-2">
              <span>
                سيتم <strong className="text-destructive">حذف المستند بالكامل</strong> لهذا الباركود بلا استرجاع،
                بغض النظر عن الحالة (انتظار مخزن، عند المخزن، أو تم للبوسطة).
              </span>
              <span className="block font-mono font-semibold">{deleteTarget?.barcode}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button type="button" variant="destructive" disabled={deleteBusy} onClick={() => void onDeleteConfirm()}>
              {deleteBusy ? 'جاري…' : 'تأكيد الحذف النهائي'}
            </Button>
            <Button type="button" variant="outline" disabled={deleteBusy} onClick={onDeleteClose}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
