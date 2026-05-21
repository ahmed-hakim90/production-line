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
      <p className="text-sm text-muted-foreground py-4">
        احفظ المنتج أولاً ثم أضف مواد الـ BOM من تبويب BOM والمواد.
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
