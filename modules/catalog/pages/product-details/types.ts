export type ProductStatus = "out_of_stock" | "available";

export interface ProductHeaderData {
  breadcrumb: string;
  name: string;
  code: string;
  category: string;
  status: ProductStatus;
}

export interface KPIItem {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  icon: string;
  tone: "teal" | "blue" | "coral" | "amber" | "red" | "gray";
}

export interface PerfCardData {
  id: string;
  label: string;
  value: string;
  tone: "teal" | "blue" | "coral" | "amber" | "red" | "gray";
}

export interface MonthlyCostColumn {
  id: string;
  title: string;
  bgColor: string;
  unitCost: number | string;
  total: number | string;
  units: number | string;
  note?: string;
}

export interface CostBreakdownRow {
  id: string;
  type: "section" | "row" | "total" | "grand_total";
  label: string;
  value?: string;
  subLabel?: string;
}

export interface IndirectCostRow {
  id: string;
  icon: string;
  label: string;
  subLabel: string;
  perUnit: number;
  monthlyTotal: number;
}

export interface CostSummaryItem {
  id: string;
  title: string;
  value: string;
  subtitle?: string;
  bgColor: string;
}

export interface ProductionLineRow {
  id: string;
  lineName: string;
  producedQty: number;
  totalCost: number;
  unitCost: number;
  isBest?: boolean;
}

export interface UnitCostPoint {
  date: string;
  value: number;
}

export interface ProductionLogPoint {
  date: string;
  production: number;
  waste: number;
  specialBarColor?: string;
}

export interface DetailedReportRow {
  id: string;
  date: string;
  line: string;
  employee: string;
  quantity: number;
  waste: number;
  workers: number;
  hours: number;
}

export interface ProductDetailData {
  id: string;
  header: ProductHeaderData;
  activePeriod: "all" | "today" | "yesterday" | "weekly" | "monthly";
  selectedLine: string;
  selectedSupervisor: string;
  periodFrom: string;
  periodTo: string;
  lineOptions: string[];
  supervisorOptions: string[];
  kpis: KPIItem[];
  performanceCards: PerfCardData[];
  monthlyCostDate: string;
  monthlyCostColumns: MonthlyCostColumn[];
  costBreakdownRows: CostBreakdownRow[];
  indirectCostRows: IndirectCostRow[];
  grandTotal: string;
  rawMaterialsEmptyMessage: string;
  costSummaryItems: CostSummaryItem[];
  productionByLine: ProductionLineRow[];
  unitCostTrend: UnitCostPoint[];
  productionLog: ProductionLogPoint[];
  detailedReports: DetailedReportRow[];
}
