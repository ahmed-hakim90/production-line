import React from 'react';
import { ProductBomSection } from '../../manufacturing/components/ProductBomSection';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';

export type ProductModalMaterialsSectionProps = {
  productId: string | null;
  enabled: boolean;
  onMaterialsChanged?: (productId: string) => void;
};

/** BOM editor for product create/edit modal — delegates to manufacturing module. */
export const ProductModalMaterialsSection: React.FC<ProductModalMaterialsSectionProps> = ({
  productId,
  enabled,
  onMaterialsChanged,
}) => {
  const uid = useAppStore((s) => s.uid) || '';
  const { can } = usePermission();
  const canManage = can('bom.manage') || can('costs.manage') || can('products.edit');

  if (!enabled || !productId) {
    return (
      <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-5 text-center text-sm text-muted-foreground">
        احفظ بيانات المنتج أولاً، ثم سينتقل المودال مباشرة إلى تعريف مواد الـ BOM والكميات.
      </p>
    );
  }

  return (
    <ProductBomSection
      productId={productId}
      canManage={canManage}
      userId={uid}
    />
  );
};
