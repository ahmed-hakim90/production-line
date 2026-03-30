import type { ProductDetailData } from "./types";

const trendDates = [
  "2026-02-08", "2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12", "2026-02-13", "2026-02-14",
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21",
  "2026-02-22", "2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28",
  "2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07",
  "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14",
];

const trendValues = [
  18.3, 19.1, 20.4, 17.8, 21.1, 22.3, 19.5,
  18.7, 20.1, 21.9, 23.2, 19.4, 18.2, 17.6,
  20.8, 24.1, 26.9, 25.5, 22.1, 19.7, 18.8,
  20.2, 21.7, 23.8, 24.6, 27.2, 29.4, 31.0,
  26.5, 24.3, 22.9, 21.4, 19.8, 18.9, 17.7,
];

const productionValues = [
  320, 410, 360, 290, 530, 610, 420,
  380, 470, 520, 560, 430, 390, 365,
  480, 590, 650, 610, 500, 450, 405,
  950, 520, 600, 680, 710, 790, 840,
  620, 570, 540, 500, 455, 430, 390,
];

const wasteValues = [
  0, 0, 0, 0, 1, 0, 0,
  0, 0, 0, 0, 0, 0, 0,
  0, 1, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 1, 0, 0,
  0, 0, 0, 0, 0, 0, 0,
];

export const PRODUCT_DETAIL_MOCK: ProductDetailData = {
  id: "SK-7033N",
  header: {
    breadcrumb: "الكتالوج › المنتجات › SK-7033N",
    name: "كبه سوكاني استنالس 6.5 لتر 1500 وات",
    code: "7033",
    category: "مرنل",
    status: "out_of_stock",
  },
  activePeriod: "all",
  selectedLine: "كل الخطوط",
  selectedSupervisor: "كل المشرفين",
  periodFrom: "2026-02-08",
  periodTo: "2026-03-14",
  lineOptions: ["كل الخطوط", "خط 1", "خط 2", "خط 3", "خط 4", "خط 5", "خط 6", "خط 12"],
  supervisorOptions: ["كل المشرفين", "رامى ابراهيم اسكندر ابراهيم", "محمد عبدالوهاب علي"],
  kpis: [
    { id: "k1", label: "رصيد مفكك", value: 9000, unit: "وحدة", icon: "grid_view", tone: "teal" },
    { id: "k2", label: "رصيد بعد الإنتاج", value: 8967, unit: "وحدة", icon: "trending_up", tone: "teal" },
    { id: "k3", label: "تم الصنع", value: 33, unit: "وحدة", icon: "stars", tone: "blue" },
    { id: "k4", label: "الهالك", value: 0, unit: "وحدة", icon: "warning", tone: "coral" },
    { id: "k5", label: "منتج تام", value: 714, unit: "وحدة", icon: "check_circle", tone: "teal" },
    { id: "k6", label: "نسبة الهالك", value: "0%", unit: "من الكلي", icon: "schedule", tone: "gray" },
  ],
  performanceCards: [
    { id: "p1", label: "متوسط الإنتاج اليومي", value: "436 وحدة/يوم", tone: "teal" },
    { id: "p2", label: "أفضل خط إنتاج", value: "خط 3", tone: "blue" },
    { id: "p3", label: "وقت التجميع الفعلي", value: "19.73 دقيقة/وحدة", tone: "gray" },
    { id: "p4", label: "وقت التجميع القياسي", value: "غير محدد", tone: "gray" },
  ],
  monthlyCostDate: "مارس 2026",
  monthlyCostColumns: [
    {
      id: "current",
      title: "الشهر الحالي",
      bgColor: "rgb(var(--color-primary) / 0.12)",
      unitCost: 27.81,
      total: 120605,
      units: 4336,
    },
    {
      id: "previous",
      title: "الشهر السابق",
      bgColor: "#F1EFE8",
      unitCost: 17.63,
      total: 197615,
      units: 11209,
    },
    {
      id: "change",
      title: "التغيير",
      bgColor: "#FCEBEB",
      unitCost: "57.8% ↑",
      total: "ارتفاع في تكلفة الوحدة",
      units: "",
      note: "red",
    },
  ],
  costBreakdownRows: [
    { id: "s1", type: "section", label: "تكاليف المنتج (مواد + تغليف)" },
    { id: "r1", type: "row", label: "تكلفة الوحدة الصينية", value: "850.00 ج.م" },
    { id: "r2", type: "row", label: "السعر باليوان الصيني (850 ÷ 8.5)", value: "100.00 ¥" },
    { id: "r3", type: "row", label: "تكلفة المواد الخام (0 مادة)", value: "0.00 ج.م" },
    { id: "r4", type: "row", label: "تكلفة العلبة الداخلية", value: "0.00 ج.م" },
    { id: "r5", type: "row", label: "نصيب الكرتونة (55.00 ÷ 6)", value: "9.17 ج.م" },
    { id: "s2", type: "section", label: "تكاليف صناعية (مباشرة وغير مباشرة)" },
    { id: "r6", type: "row", label: "التكاليف الصناعية المباشرة (متوسط شهري/مرجعي)", value: "16.19 ج.م" },
    { id: "r7", type: "row", label: "التكاليف الصناعية غير المباشرة (متوسط شهري/مرجعي)", value: "11.62 ج.م" },
    {
      id: "t1",
      type: "total",
      label: "إجمالي تكاليف صناعية للمنتج | 27.81 ج.م/مرجعي",
      subLabel: "إجمالي شهري مرجعي: 120,605.40 ج.م",
    },
  ],
  indirectCostRows: [
    { id: "i1", icon: "inventory_2", label: "خط التغليف و الجودة", subLabel: "تكلفة تشغيل غير مباشرة", perUnit: 3.98, monthlyTotal: 17263.14 },
    { id: "i2", icon: "warehouse", label: "ايجار التخزين مرجعي", subLabel: "تشغيل المخازن", perUnit: 2.79, monthlyTotal: 12079.82 },
    { id: "i3", icon: "badge", label: "مرتيبات (مدير+مساعد)", subLabel: "أجور إدارية", perUnit: 2.17, monthlyTotal: 9397.64 },
    { id: "i4", icon: "build", label: "عدد و مهمات", subLabel: "استهلاك أدوات", perUnit: 0.87, monthlyTotal: 3755.59 },
    { id: "i5", icon: "domain", label: "ايجار المصنع", subLabel: "مصروف ثابت", perUnit: 0.34, monthlyTotal: 1456.85 },
    { id: "i6", icon: "precision_manufacturing", label: "اهلاكات 12 مرجعي", subLabel: "اهلاك شهري", perUnit: 0.27, monthlyTotal: 1191.79 },
    { id: "i7", icon: "bolt", label: "كهرباء", subLabel: "استهلاك مرجعي", perUnit: 0.11, monthlyTotal: 461.11 },
    { id: "i8", icon: "air", label: "كمبروسر و ضغط هواء", subLabel: "خدمات مساعدة", perUnit: 0.08, monthlyTotal: 334.08 },
  ],
  grandTotal: "886.98 ج.م",
  rawMaterialsEmptyMessage: "لا توجد مواد خام مسجلة",
  costSummaryItems: [
    { id: "cs1", title: "متوسط تكلفة الوحدة", value: "26.54 ج.م/وحدة", bgColor: "#FFFFFF" },
    { id: "cs2", title: "إجمالي التكلفة التاريخية", value: "532,515.77 ج.م", bgColor: "#FFFFFF" },
    { id: "cs3", title: "اتجاه التكلفة", value: "11% ↑", subtitle: "ارتفاع", bgColor: "#FCEBEB" },
    { id: "cs4", title: "أفضل خط من حيث التكلفة", value: "خط انتاج 6", subtitle: "15.41 ج.م/وحدة", bgColor: "rgb(var(--color-primary) / 0.12)" },
  ],
  productionByLine: [
    { id: "l5", lineName: "خط انتاج 5", producedQty: 5026, totalCost: 99619.1, unitCost: 19.82 },
    { id: "l6", lineName: "خط انتاج 6", producedQty: 480, totalCost: 7397.01, unitCost: 15.41, isBest: true },
    { id: "l3", lineName: "خط انتاج 3", producedQty: 12813, totalCost: 236245.84, unitCost: 18.44 },
    { id: "l4", lineName: "خط انتاج 4", producedQty: 1449, totalCost: 26358.09, unitCost: 18.19 },
    { id: "l12", lineName: "خط انتاج 12", producedQty: 294, totalCost: 5525, unitCost: 18.79 },
  ],
  unitCostTrend: trendDates.map((date, idx) => ({ date, value: trendValues[idx] })),
  productionLog: trendDates.map((date, idx) => ({
    date,
    production: productionValues[idx],
    waste: wasteValues[idx],
    specialBarColor: date === "2026-03-01" ? "#B4B2A9" : undefined,
  })),
  detailedReports: [
    { id: "d1", date: "2026-03-14", line: "خط انتاج 5", employee: "رامى ابراهيم اسكندر ابراهيم", quantity: 432, waste: 0, workers: 21, hours: 6 },
    { id: "d2", date: "2026-03-14", line: "خط انتاج 6", employee: "????????? السيد جوده", quantity: 480, waste: 0, workers: 20, hours: 6 },
    { id: "d3", date: "2026-03-12", line: "خط انتاج 5", employee: "رامى ابراهيم اسكندر ابراهيم", quantity: 360, waste: 0, workers: 18, hours: 6 },
    { id: "d4", date: "2026-03-11", line: "خط انتاج 5", employee: "رامى ابراهيم اسكندر ابراهيم", quantity: 400, waste: 0, workers: 22, hours: 6 },
    { id: "d5", date: "2026-03-10", line: "خط انتاج 5", employee: "رامى ابراهيم اسكندر ابراهيم", quantity: 360, waste: 0, workers: 21, hours: 6 },
    { id: "d6", date: "2026-03-09", line: "خط انتاج 5", employee: "رامى ابراهيم اسكندر ابراهيم", quantity: 333, waste: 0, workers: 22, hours: 6 },
    { id: "d7", date: "2026-03-08", line: "خط انتاج 3", employee: "محمد عبدالوهاب علي", quantity: 612, waste: 0, workers: 26, hours: 7 },
    { id: "d8", date: "2026-03-07", line: "خط انتاج 3", employee: "محمد عبدالوهاب علي", quantity: 701, waste: 1, workers: 27, hours: 7 },
    { id: "d9", date: "2026-03-06", line: "خط انتاج 4", employee: "أيمن صبحي ????", quantity: 280, waste: 0, workers: 14, hours: 6 },
    { id: "d10", date: "2026-03-05", line: "خط انتاج 12", employee: "ياسر ????? عبدالله", quantity: 124, waste: 0, workers: 9, hours: 5 },
    { id: "d11", date: "2026-03-04", line: "خط انتاج 5", employee: "رامى ابراهيم اسكندر ابراهيم", quantity: 355, waste: 0, workers: 20, hours: 6 },
    { id: "d12", date: "2026-03-03", line: "خط انتاج 6", employee: "????????? السيد جوده", quantity: 390, waste: 0, workers: 17, hours: 6 },
  ],
};

export const getMockProductDetail = async (id?: string): Promise<ProductDetailData> => {
  await new Promise((resolve) => setTimeout(resolve, 380));
  if (!id) {
    return PRODUCT_DETAIL_MOCK;
  }
  return { ...PRODUCT_DETAIL_MOCK, id };
};
