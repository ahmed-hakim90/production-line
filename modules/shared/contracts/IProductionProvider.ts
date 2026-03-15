export interface ProductionReportData {
  id: string;
  date: string;
  lineId: string;
  productId: string;
  quantity: number;
  workers: number;
  hours: number;
  workOrderId?: string;
}

export interface IProductionProvider {
  getMonthlyReports(month: string, lineIds?: string[]): Promise<ProductionReportData[]>;
  getProductQuantities(month: string, productIds?: string[]): Promise<Record<string, number>>;
}
