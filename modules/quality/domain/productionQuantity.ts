export interface ProductionQuantityRow {
  date: string;
  lineId: string;
  productId: string;
  quantityProduced: number;
}

/** Sum Hakim production-report quantities. Returns null when no report exists for that key. */
export function reportedProductionQuantity(
  reports: ProductionQuantityRow[],
  date: string,
  lineId: string,
  productId: string,
): number | null {
  const rows = reports.filter((row) => row.date === date && row.lineId === lineId && row.productId === productId);
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + (Number(row.quantityProduced) || 0), 0);
}
