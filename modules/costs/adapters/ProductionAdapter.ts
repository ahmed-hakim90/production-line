import type { IProductionProvider, ProductionReportData } from '../../shared/contracts/IProductionProvider';

type ProductionReportWithMeta = ProductionReportData & {
  employeeId?: string;
  supervisorIndirectCost?: number;
  productCategory?: string;
};

function getMonthDateRange(month: string): { startDate: string; endDate: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export class ProductionAdapter implements IProductionProvider {
  async getMonthlyReports(month: string, lineIds?: string[]): Promise<ProductionReportData[]> {
    const { reportService } = await import('../../production/services/reportService');
    const { productService } = await import('../../production/services/productService');

    const { startDate, endDate } = getMonthDateRange(month);
    const [reports, products] = await Promise.all([
      reportService.getByDateRange(startDate, endDate),
      productService.getAll(),
    ]);
    const productCategoryById = new Map<string, string>();
    products.forEach((product) => {
      if (!product.id) return;
      productCategoryById.set(String(product.id), String(product.model || '').trim());
    });

    const allowedLineIds = new Set((lineIds || []).map((id) => String(id || '')).filter(Boolean));
    const shouldFilterByLine = allowedLineIds.size > 0;

    return reports
      .filter((report) => !shouldFilterByLine || allowedLineIds.has(String(report.lineId || '')))
      .map((report) => ({
        id: String(report.id || ''),
        date: String(report.date || ''),
        lineId: String(report.lineId || ''),
        productId: String(report.productId || ''),
        quantity: Number(report.quantityProduced || 0),
        workers: Number(report.workersCount || 0),
        hours: Number(report.workHours || 0),
        workOrderId: report.workOrderId,
        employeeId: String(report.employeeId || '') || undefined,
        supervisorIndirectCost: Number(report.supervisorIndirectCost || 0),
        productCategory: String(productCategoryById.get(String(report.productId || '')) || ''),
      } as ProductionReportWithMeta));
  }

  async getProductQuantities(month: string, productIds?: string[]): Promise<Record<string, number>> {
    const reports = await this.getMonthlyReports(month);
    const productIdSet = new Set((productIds || []).map((id) => String(id || '')).filter(Boolean));
    const shouldFilterByProducts = productIdSet.size > 0;

    return reports
      .filter((report) => !shouldFilterByProducts || productIdSet.has(String(report.productId || '')))
      .reduce((acc, report) => {
        const productId = String(report.productId || '');
        if (!productId) return acc;
        acc[productId] = (acc[productId] || 0) + Number(report.quantity || 0);
        return acc;
      }, {} as Record<string, number>);
  }
}

export const productionAdapter = new ProductionAdapter();
