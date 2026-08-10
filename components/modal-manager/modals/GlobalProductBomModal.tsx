import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { ProductBomSection } from '../../../modules/manufacturing/components/ProductBomSection';

type BomModalPayload = {
  productId?: string;
  productName?: string;
  source?: string;
};

/**
 * Dedicated product BOM modal — components only (add / edit / delete).
 * Does not open the full product create/edit form.
 */
export const GlobalProductBomModal: React.FC = () => {
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.PRODUCTS_BOM_MANAGE);
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid) || '';
  const products = useAppStore((s) => s.products);

  const modalPayload = (payload || {}) as BomModalPayload;
  const productId = typeof modalPayload.productId === 'string' ? modalPayload.productId : '';

  const product = useMemo(
    () => (productId ? products.find((p) => p.id === productId) : undefined),
    [productId, products],
  );

  const titleName = modalPayload.productName || product?.name || '';
  const subtitleCode = product?.code ? `الكود: ${product.code}` : '';

  const canOpen = can('bom.view') || can('bom.manage');
  const canManage = can('bom.manage') || can('products.edit');
  const canViewCosts = can('costs.view');

  if (!isOpen) return null;

  if (!canOpen) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>مكونات المنتج</DialogTitle>
            <DialogDescription>ليس لديك صلاحية عرض مكونات المنتج.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close()}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!productId) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>مكونات المنتج</DialogTitle>
            <DialogDescription>لم يتم تحديد المنتج.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close()}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl" dir="rtl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 text-right">
          <DialogTitle>مكونات المنتج</DialogTitle>
          <DialogDescription>
            {titleName
              ? `${titleName}${subtitleCode ? ` · ${subtitleCode}` : ''} — ${canManage ? 'إضافة أو تعديل أو حذف المكونات' : 'عرض المكونات فقط'}`
              : canManage
                ? 'إضافة أو تعديل أو حذف المكونات فقط (بدون تعديل بيانات المنتج)'
                : 'عرض مكونات المنتج فقط'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ProductBomSection
            productId={productId}
            canManage={canManage}
            canViewCosts={canViewCosts}
            userId={uid}
            showRequirements={false}
          />
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-5 py-3 sm:justify-start">
          <Button type="button" variant="outline" onClick={() => close()}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
