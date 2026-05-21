/** Pure helpers for production inventory (testable without Firebase). */

export type PackagingLineInput = {
  productId?: string;
  quantityPieces?: number;
};

export function aggregatePackagingQuantities(params: {
  packagingLines?: PackagingLineInput[];
  productId: string;
  quantityProduced: number;
}): Map<string, number> {
  const qtyByProduct = new Map<string, number>();
  const sourceLines =
    Array.isArray(params.packagingLines) && params.packagingLines.length > 0
      ? params.packagingLines
      : [{ productId: params.productId, quantityPieces: params.quantityProduced }];

  sourceLines.forEach((line) => {
    const productId = String(line?.productId || '').trim();
    const quantity = Number(line?.quantityPieces || 0);
    if (!productId || quantity <= 0) return;
    qtyByProduct.set(productId, Number(qtyByProduct.get(productId) || 0) + quantity);
  });

  return qtyByProduct;
}

export function shouldPostAggregateWaste(params: {
  wasteQty: number;
  wasteWarehouseId?: string;
  hasProducedLine: boolean;
  hasExplicitScrapList: boolean;
}): boolean {
  if (params.hasExplicitScrapList) return false;
  return params.wasteQty > 0 && Boolean(params.wasteWarehouseId) && params.hasProducedLine;
}
