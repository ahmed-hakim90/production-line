export interface PalletWorkOrderLabelSource {
  workOrderNumber?: string;
  productId?: string;
  productName?: string;
  productCode?: string;
}

export interface PalletWorkOrderProductName {
  id?: string;
  name?: string;
  code?: string;
}

/**
 * Label shown in the pallet inspection work-order picker.
 * The select value stays the work order id. This text is display only.
 * Product name comes from the work order row when it is already stored,
 * otherwise from the products already loaded for the screen.
 */
export function palletWorkOrderOptionLabel(
  order: PalletWorkOrderLabelSource,
  products: ReadonlyArray<PalletWorkOrderProductName>,
): string {
  const storedName = String(order.productName || '').trim();
  const storedCode = String(order.productCode || '').trim();
  const linked = storedName && storedCode
    ? undefined
    : products.find((product) => product.id && product.id === order.productId);
  const name = storedName || String(linked?.name || '').trim();
  const code = storedCode || String(linked?.code || '').trim();
  if (name) return code ? `${name} (${code})` : name;
  return String(order.workOrderNumber || '').trim() || 'أمر شغل';
}
