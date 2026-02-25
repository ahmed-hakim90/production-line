
import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { formatNumber } from '../../../utils/calculations';
import { buildProductCosts, buildProductAvgCost, formatCost, type ProductCostData } from '../../../utils/costCalculations';
import { FirestoreProduct } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { parseProductsExcel, toProductData, ProductImportResult } from '../../../utils/importProducts';
import { downloadProductsTemplate } from '../../../utils/downloadTemplates';
import { exportAllProducts, PRODUCT_EXPORT_DEFAULTS } from '../../../utils/exportExcel';
import type { ProductExportOptions } from '../../../utils/exportExcel';
import { calculateProductCostBreakdown } from '../../../utils/productCostBreakdown';

type ProductTableColumnKey =
  | 'openingStock'
  | 'totalProduction'
  | 'wasteUnits'
  | 'stockLevel'
  | 'totalCost'
  | 'directIndirect'
  | 'costPerUnit'
  | 'sellingPrice'
  | 'chineseUnitCost'
  | 'chinesePriceCny'
  | 'innerBoxCost'
  | 'outerCartonCost'
  | 'unitsPerCarton';

const COLUMN_PREFS_KEY = 'products_table_visible_columns_v1';

const DEFAULT_VISIBLE_COLUMNS: Record<ProductTableColumnKey, boolean> = {
  openingStock: true,
  totalProduction: true,
  wasteUnits: true,
  stockLevel: true,
  totalCost: true,
  directIndirect: true,
  costPerUnit: true,
  sellingPrice: true,
  chineseUnitCost: true,
  chinesePriceCny: true,
  innerBoxCost: true,
  outerCartonCost: true,
  unitsPerCarton: true,
};

const shortProductName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[1]}`;
};

const emptyForm: Omit<FirestoreProduct, 'id'> = {
  name: '',
  model: '',
  code: '',
  openingBalance: 0,
  chineseUnitCost: 0,
  innerBoxCost: 0,
  outerCartonCost: 0,
  unitsPerCarton: 0,
  sellingPrice: 0,
};

export const Products: React.FC = () => {
  const products = useAppStore((s) => s.products);
  const createProduct = useAppStore((s) => s.createProduct);
  const updateProduct = useAppStore((s) => s.updateProduct);
  const deleteProduct = useAppStore((s) => s.deleteProduct);
  const productsLoading = useAppStore((s) => s.productsLoading);

  const todayReports = useAppStore((s) => s.todayReports);
  const monthlyReports = useAppStore((s) => s.monthlyReports);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const laborSettings = useAppStore((s) => s.laborSettings);

  const { can } = usePermission();
  const canViewCosts = can('costs.view');
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Export customization
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [exportOptions, setExportOptions] = useState<ProductExportOptions>({ ...PRODUCT_EXPORT_DEFAULTS });
  const [visibleColumns, setVisibleColumns] = useState<Record<ProductTableColumnKey, boolean>>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLUMNS;
    try {
      const raw = window.localStorage.getItem(COLUMN_PREFS_KEY);
      if (!raw) return DEFAULT_VISIBLE_COLUMNS;
      return { ...DEFAULT_VISIBLE_COLUMNS, ...(JSON.parse(raw) as Partial<Record<ProductTableColumnKey, boolean>>) };
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });

  // Import from Excel
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<ProductImportResult | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !search ||
        p.name.includes(search) ||
        p.code.toLowerCase().includes(search.toLowerCase());
      const matchCategory = !categoryFilter || p.category === categoryFilter;
      const matchStock = !stockFilter || p.stockStatus === stockFilter;
      return matchSearch && matchCategory && matchStock;
    });
  }, [products, search, categoryFilter, stockFilter]);

  const productCosts = useMemo(() => {
    if (!canViewCosts) return {} as Record<string, ProductCostData>;
    const hourlyRate = laborSettings?.hourlyRate ?? 0;
    const allReports = monthlyReports.length > 0 ? monthlyReports : todayReports;
    const result: Record<string, ProductCostData> = {};
    for (const p of products) {
      result[p.id] = buildProductAvgCost(p.id, allReports, hourlyRate, costCenters, costCenterValues, costAllocations);
    }
    return result;
  }, [canViewCosts, products, monthlyReports, todayReports, laborSettings, costCenters, costCenterValues, costAllocations]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setSaveMsg(null);
    setShowModal(true);
  };

  const openEdit = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const raw = _rawProducts.find((p) => p.id === id);
    setEditId(id);
    setForm({
      name: product.name,
      model: product.category,
      code: product.code,
      openingBalance: product.openingStock,
      chineseUnitCost: raw?.chineseUnitCost ?? 0,
      innerBoxCost: raw?.innerBoxCost ?? 0,
      outerCartonCost: raw?.outerCartonCost ?? 0,
      unitsPerCarton: raw?.unitsPerCarton ?? 0,
      sellingPrice: raw?.sellingPrice ?? 0,
    });
    setSaveMsg(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) return;
    if (!form.model) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      if (editId) {
        await updateProduct(editId, form);
        setSaveMsg({ type: 'success', text: 'تم حفظ تعديلات المنتج بنجاح' });
      } else {
        await createProduct(form);
        setSaveMsg({ type: 'success', text: 'تم إضافة المنتج بنجاح' });
        setForm(emptyForm);
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'تعذر حفظ المنتج. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteProduct(id);
    setDeleteConfirmId(null);
  };

  // ── Import from Excel ──────────────────────────────────────────────────

  const _rawProducts = useAppStore((s) => s._rawProducts);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportParsing(true);
    setShowImportModal(true);
    setImportResult(null);
    try {
      const result = await parseProductsExcel(file, _rawProducts);
      setImportResult(result);
    } catch {
      setImportResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0, newCount: 0, updateCount: 0 });
    } finally {
      setImportParsing(false);
    }
  };

  const handleImportSave = async () => {
    if (!importResult) return;
    const validRows = importResult.rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;

    setImportSaving(true);
    setImportProgress({ done: 0, total: validRows.length });

    let done = 0;
    for (const row of validRows) {
      try {
        if (row.action === 'update' && row.matchedId) {
          await updateProduct(row.matchedId, toProductData(row));
        } else {
          await createProduct(toProductData(row));
        }
      } catch { /* skip failed */ }
      done++;
      setImportProgress({ done, total: validRows.length });
    }

    setImportSaving(false);
    setShowImportModal(false);
    setImportResult(null);
  };

  const doExportProducts = (opts: ProductExportOptions) => {
    const data = products.map((p) => {
      const raw = _rawProducts.find((r) => r.id === p.id);
      const breakdown = raw ? calculateProductCostBreakdown(raw, [], productCosts[p.id]?.costPerUnit ?? 0) : null;
      return { product: p, raw: raw || { name: p.name, model: p.category, code: p.code, openingBalance: p.openingStock }, costBreakdown: breakdown };
    });
    const columnLabels: string[] = ['الكود', 'اسم المنتج', 'الفئة'];
    if (visibleColumns.openingStock) columnLabels.push('الرصيد الافتتاحي');
    if (visibleColumns.totalProduction) columnLabels.push('إجمالي الإنتاج');
    if (visibleColumns.wasteUnits) columnLabels.push('إجمالي الهالك');
    if (visibleColumns.stockLevel) columnLabels.push('الرصيد الحالي');

    if (canViewCosts && visibleColumns.chineseUnitCost) columnLabels.push('تكلفة الوحدة الصينية');
    if (canViewCosts && visibleColumns.chinesePriceCny) columnLabels.push('السعر باليوان');
    if (canViewCosts && visibleColumns.innerBoxCost) columnLabels.push('تكلفة العلبة الداخلية');
    if (canViewCosts && visibleColumns.outerCartonCost) columnLabels.push('تكلفة الكرتونة');
    if (canViewCosts && visibleColumns.unitsPerCarton) columnLabels.push('وحدات/كرتونة');
    if (canViewCosts && visibleColumns.totalCost) columnLabels.push('إجمالي التكلفة المحسوبة');
    if (canViewCosts && visibleColumns.costPerUnit) columnLabels.push('نصيب المصاريف الصناعية (م. وغ.م)');
    if (visibleColumns.sellingPrice) columnLabels.push('سعر البيع');
    if (canViewCosts && visibleColumns.sellingPrice) {
      columnLabels.push('هامش الربح (ج.م)');
      columnLabels.push('نسبة هامش الربح %');
    }

    exportAllProducts(data, canViewCosts, opts, laborSettings?.cnyToEgpRate ?? 0, columnLabels);
  };

  const toggleColumn = (key: ProductTableColumnKey, checked: boolean) => {
    const next = { ...visibleColumns, [key]: checked };
    setVisibleColumns(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(next));
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">إدارة المنتجات</h2>
          <p className="text-sm text-slate-500 font-medium">قائمة تفصيلية بكافة الأصناف والمخزون وحالة الإنتاج.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {products.length > 0 && can("export") && (
            <>
              <Button variant="secondary" onClick={() => {
                const opts: ProductExportOptions = {
                  stock: visibleColumns.openingStock || visibleColumns.totalProduction || visibleColumns.wasteUnits || visibleColumns.stockLevel,
                  productCosts: visibleColumns.chineseUnitCost || visibleColumns.innerBoxCost || visibleColumns.outerCartonCost || visibleColumns.unitsPerCarton || visibleColumns.totalCost || visibleColumns.chinesePriceCny,
                  manufacturingCosts: visibleColumns.costPerUnit,
                  sellingPrice: visibleColumns.sellingPrice,
                  profitMargin: visibleColumns.sellingPrice,
                  chinesePriceCny: visibleColumns.chinesePriceCny,
                };
                setExportOptions(opts);
                doExportProducts(opts);
              }} className="shrink-0">
                <span className="material-icons-round text-sm">download</span>
                <span className="hidden sm:inline">تصدير Excel</span>
              </Button>
              <Button variant="outline" onClick={() => setShowColumnsModal(true)} className="shrink-0">
                <span className="material-icons-round text-sm">view_column</span>
                <span className="hidden sm:inline">الأعمدة</span>
              </Button>
            </>
          )}
          {can("import") && (
            <>
            <Button variant="outline" onClick={downloadProductsTemplate} className="shrink-0">
              <span className="material-icons-round text-sm">file_download</span>
              <span className="hidden sm:inline">تحميل قالب</span>
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="shrink-0">
              <span className="material-icons-round text-sm">upload_file</span>
              <span className="hidden sm:inline">رفع Excel</span>
            </Button>
            </>
          )}
          {can("products.create") && (
            <>
            <Button variant="primary" onClick={openCreate} className="shrink-0">
              <span className="material-icons-round text-sm">add</span>
              إضافة منتج جديد
            </Button>
            </>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-3 sm:gap-4 items-center justify-between shadow-sm">
        <div className="flex flex-1 min-w-0 sm:min-w-[250px] items-center gap-3 relative">
          <span className="material-icons-round absolute right-3 text-slate-400">search</span>
          <input
            className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm font-medium"
            placeholder="ابحث عن منتج..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <select
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm font-bold focus:ring-primary outline-none min-w-[140px]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">كل الفئات</option>
            <option value="منزلي">منزلي</option>
            <option value="سريا">سريا</option>
          </select>
          <select
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm font-bold focus:ring-primary outline-none min-w-[140px]"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
          >
            <option value="">حالة المخزون</option>
            <option value="available">متوفر</option>
            <option value="low">منخفض</option>
            <option value="out">نفذ</option>
          </select>
          <button
            className="p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            onClick={() => { setSearch(''); setCategoryFilter(''); setStockFilter(''); }}
          >
            <span className="material-icons-round">filter_list_off</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <Card className="!p-0 border-none overflow-hidden shadow-xl shadow-slate-200/50">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-5 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400">المنتج</th>
                {visibleColumns.openingStock && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">الرصيد الافتتاحي</th>}
                {visibleColumns.totalProduction && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">الإنتاج</th>}
                {visibleColumns.wasteUnits && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">الهالك</th>}
                {visibleColumns.stockLevel && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">الرصيد الحالي</th>}
                {visibleColumns.sellingPrice && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">سعر البيع</th>}
                {canViewCosts && (
                  <>
                    {visibleColumns.totalCost && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">إجمالي التكلفة</th>}
                    {visibleColumns.directIndirect && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">مباشر / غير مباشر</th>}
                    {visibleColumns.costPerUnit && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">تكلفة الوحدة</th>}
                    {visibleColumns.chineseUnitCost && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">تكلفة الوحدة الصينية</th>}
                    {visibleColumns.chinesePriceCny && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">السعر باليوان</th>}
                    {visibleColumns.innerBoxCost && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">تكلفة العلبة الداخلية</th>}
                    {visibleColumns.outerCartonCost && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">تكلفة الكرتونة الخارجية</th>}
                    {visibleColumns.unitsPerCarton && <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center">عدد الوحدات/كرتونة</th>}
                  </>
                )}
                <th className="px-4 py-3.5 text-xs font-black text-slate-500 dark:text-slate-400 text-center w-28">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={99} className="px-6 py-16 text-center text-slate-400">
                    <span className="material-icons-round text-5xl mb-3 block opacity-30">inventory_2</span>
                    <p className="font-bold text-lg">لا توجد منتجات{search || categoryFilter || stockFilter ? ' مطابقة للبحث' : ' بعد'}</p>
                    <p className="text-sm mt-1">
                      {can("products.create")
                        ? 'اضغط "إضافة منتج جديد" لإضافة أول منتج'
                        : 'لا توجد منتجات لعرضها حالياً'}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 flex items-center justify-center shrink-0 border border-primary/10">
                        <span className="material-icons-round text-primary text-lg">inventory_2</span>
                      </div>
                      <div className="min-w-0">
                        <span
                          className="font-bold text-sm text-slate-700 dark:text-slate-200 hover:text-primary cursor-pointer transition-colors block truncate max-w-[280px]"
                          onClick={() => navigate(`/products/${product.id}`)}
                          title={product.name}
                        >
                          {shortProductName(product.name)}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[11px] text-slate-400">{product.code}</span>
                          {product.category && (
                            <Badge variant="neutral">{product.category}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  {visibleColumns.openingStock && <td className="px-4 py-4 text-center font-bold text-slate-700 dark:text-slate-300 tabular-nums">{formatNumber(product.openingStock)}</td>}
                  {visibleColumns.totalProduction && <td className="px-4 py-4 text-center">
                    <span className="inline-block px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm font-black tabular-nums">
                      {formatNumber(product.totalProduction)}
                    </span>
                  </td>}
                  {visibleColumns.wasteUnits && <td className="px-4 py-4 text-center">
                    {product.wasteUnits > 0 ? (
                      <span className="text-sm font-bold text-rose-500 tabular-nums">{formatNumber(product.wasteUnits)}</span>
                    ) : (
                      <span className="text-sm text-slate-300">0</span>
                    )}
                  </td>}
                  {visibleColumns.stockLevel && <td className="px-4 py-4 text-center">
                    <span className={`text-sm font-black tabular-nums ${product.stockLevel > 100 ? 'text-slate-700 dark:text-slate-200' : product.stockLevel > 0 ? 'text-amber-600' : 'text-rose-500'}`}>
                      {formatNumber(product.stockLevel)}
                    </span>
                  </td>}
                  {visibleColumns.sellingPrice && (
                    <td className="px-4 py-4 text-center text-sm font-black tabular-nums">
                      {formatCost((_rawProducts.find((r) => r.id === product.id)?.sellingPrice ?? 0))} ج.م
                    </td>
                  )}
                  {canViewCosts && (() => {
                    const c = productCosts[product.id];
                    const hasCost = c && c.totalCost > 0;
                    const raw = _rawProducts.find((r) => r.id === product.id);
                    const cnyRate = laborSettings?.cnyToEgpRate ?? 0;
                    const chineseUnitCost = raw?.chineseUnitCost ?? 0;
                    return (
                      <>
                        {visibleColumns.totalCost && <td className="px-4 py-4 text-center">
                          {hasCost ? (
                            <span className="text-sm font-black text-amber-700 dark:text-amber-400 tabular-nums">{formatCost(c.totalCost)} <span className="text-[10px] font-medium opacity-70">ج.م</span></span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>}
                        {visibleColumns.directIndirect && <td className="px-4 py-4 text-center">
                          {hasCost ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-xs tabular-nums text-blue-600 dark:text-blue-400 font-bold">{formatCost(c.laborCost)} <span className="text-[10px] font-normal opacity-70">مباشر</span></span>
                              <span className="text-xs tabular-nums text-slate-500 font-bold">{formatCost(c.indirectCost)} <span className="text-[10px] font-normal opacity-70">غ.مباشر</span></span>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>}
                        {visibleColumns.costPerUnit && <td className="px-4 py-4 text-center">
                          {hasCost ? (
                            <span className="inline-block px-2.5 py-1 rounded-md bg-primary/5 text-primary text-sm font-black tabular-nums ring-1 ring-primary/10">
                              {formatCost(c.costPerUnit)} <span className="text-[10px] font-medium opacity-70">ج.م</span>
                            </span>
                          ) : (
                            <span className="text-sm text-slate-300">—</span>
                          )}
                        </td>}
                        {visibleColumns.chineseUnitCost && (
                          <td className="px-4 py-4 text-center text-sm font-black tabular-nums">
                            {formatCost(chineseUnitCost)} ج.م
                          </td>
                        )}
                        {visibleColumns.chinesePriceCny && (
                          <td className="px-4 py-4 text-center text-sm font-black tabular-nums">
                            {cnyRate > 0 ? `¥ ${formatCost(chineseUnitCost / cnyRate)}` : '—'}
                          </td>
                        )}
                        {visibleColumns.innerBoxCost && (
                          <td className="px-4 py-4 text-center text-sm font-black tabular-nums">
                            {formatCost(raw?.innerBoxCost ?? 0)} ج.م
                          </td>
                        )}
                        {visibleColumns.outerCartonCost && (
                          <td className="px-4 py-4 text-center text-sm font-black tabular-nums">
                            {formatCost(raw?.outerCartonCost ?? 0)} ج.م
                          </td>
                        )}
                        {visibleColumns.unitsPerCarton && (
                          <td className="px-4 py-4 text-center text-sm font-black tabular-nums">
                            {raw?.unitsPerCarton ?? 0}
                          </td>
                        )}
                      </>
                    );
                  })()}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-0.5 justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => navigate(`/products/${product.id}`)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all" title="عرض التفاصيل">
                        <span className="material-icons-round text-[18px]">visibility</span>
                      </button>
                      {can("products.edit") && (
                        <button onClick={() => openEdit(product.id)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all" title="تعديل">
                          <span className="material-icons-round text-[18px]">edit</span>
                        </button>
                      )}
                      {can("products.delete") && (
                        <button onClick={() => setDeleteConfirmId(product.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all" title="حذف">
                          <span className="material-icons-round text-[18px]">delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-sm text-slate-500 font-bold">
            إجمالي <span className="text-primary">{filtered.length}</span> منتج
          </div>
        </div>
      </Card>

      {/* ── Add / Edit Modal ── */}
      {showModal && (can("products.create") || can("products.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); setSaveMsg(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold">{editId ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h3>
              <button onClick={() => { setShowModal(false); setSaveMsg(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {saveMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}>
                  <span className="material-icons-round text-base">{saveMsg.type === 'success' ? 'check_circle' : 'error'}</span>
                  <p className="flex-1">{saveMsg.text}</p>
                  <button onClick={() => setSaveMsg(null)} className="text-current/70 hover:text-current transition-colors">
                    <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اسم المنتج *</label>
                <input
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: محرك هيدروليكي H-400"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الكود *</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="PRD-00001"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الفئة / الموديل</label>
                  <select
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                  >
                    <option value="">اختر الفئة</option>
                    <option value="منزلي">منزلي</option>
                    <option value="سريا">سريا</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الرصيد الافتتاحي</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={0}
                    value={form.openingBalance}
                    onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">سعر البيع (ج.م)</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    type="number"
                    min={0}
                    step="any"
                    value={form.sellingPrice ?? 0}
                    onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* ── Cost Breakdown Fields ── */}
              {canViewCosts && (
                <>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <h4 className="text-sm font-black text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
                      <span className="material-icons-round text-teal-500 text-base">receipt_long</span>
                      تفصيل التكلفة
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">تكلفة الوحدة الصينية (ج.م)</label>
                      <input
                        className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                        type="number" min={0} step="any"
                        value={form.chineseUnitCost ?? 0}
                        onChange={(e) => setForm({ ...form, chineseUnitCost: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">تكلفة العلبة الداخلية (ج.م)</label>
                      <input
                        className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                        type="number" min={0} step="any"
                        value={form.innerBoxCost ?? 0}
                        onChange={(e) => setForm({ ...form, innerBoxCost: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">تكلفة الكرتونة الخارجية (ج.م)</label>
                      <input
                        className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                        type="number" min={0} step="any"
                        value={form.outerCartonCost ?? 0}
                        onChange={(e) => setForm({ ...form, outerCartonCost: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">عدد الوحدات في الكرتونة</label>
                      <input
                        className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                        type="number" min={0} step="1"
                        value={form.unitsPerCarton ?? 0}
                        onChange={(e) => setForm({ ...form, unitsPerCarton: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowModal(false); setSaveMsg(null); }}>إلغاء</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !form.name || !form.code}>
                {saving ? (
                  <span className="material-icons-round animate-spin text-sm">refresh</span>
                ) : (
                  <span className="material-icons-round text-sm">{editId ? 'save' : 'add'}</span>
                )}
                {editId ? 'حفظ التعديلات' : 'إضافة المنتج'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteConfirmId && can("products.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2.5 rounded-lg font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-all flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">delete</span>
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Excel Modal ── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!importSaving) { setShowImportModal(false); setImportResult(null); } }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold">رفع منتجات من Excel</h3>
                <button onClick={downloadProductsTemplate} className="text-primary hover:text-primary/80 text-xs font-bold flex items-center gap-1 underline">
                  <span className="material-icons-round text-sm">download</span>
                  تحميل نموذج
                </button>
              </div>
              <button onClick={() => { if (!importSaving) { setShowImportModal(false); setImportResult(null); } }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {importParsing && (
                <div className="text-center py-12">
                  <span className="material-icons-round animate-spin text-4xl text-primary mb-3 block">refresh</span>
                  <p className="font-bold text-slate-600">جاري تحليل الملف...</p>
                </div>
              )}

              {!importParsing && importResult && importResult.totalRows === 0 && (
                <div className="text-center py-12">
                  <span className="material-icons-round text-5xl text-slate-300 mb-3 block">warning</span>
                  <p className="font-bold text-slate-600">لم يتم العثور على بيانات في الملف</p>
                  <p className="text-sm text-slate-400 mt-1">تأكد من أن الملف يحتوي على أعمدة: اسم المنتج، الكود، الفئة، الرصيد الافتتاحي</p>
                  <button onClick={downloadProductsTemplate} className="text-primary hover:text-primary/80 text-sm font-bold flex items-center gap-1 underline mt-3 mx-auto">
                    <span className="material-icons-round text-sm">download</span>
                    تحميل نموذج المنتجات
                  </button>
                </div>
              )}

              {!importParsing && importResult && importResult.totalRows > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2 text-sm font-bold">
                      الإجمالي: <span className="text-primary">{importResult.totalRows}</span>
                    </div>
                    {importResult.newCount > 0 && (
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-4 py-2 text-sm font-bold text-emerald-600">
                        <span className="material-icons-round text-xs align-middle ml-1">add_circle</span>
                        جديد: {importResult.newCount}
                      </div>
                    )}
                    {importResult.updateCount > 0 && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-2 text-sm font-bold text-amber-600">
                        <span className="material-icons-round text-xs align-middle ml-1">sync</span>
                        تحديث: {importResult.updateCount}
                      </div>
                    )}
                    {importResult.errorCount > 0 && (
                      <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl px-4 py-2 text-sm font-bold text-rose-500">
                        يحتوي أخطاء: {importResult.errorCount}
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-right text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                          <th className="px-3 py-3 text-xs font-black text-slate-500">صف</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">الحالة</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">اسم المنتج</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">الكود</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">الفئة</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">الرصيد</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">الوحدة الصينية</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">العلبة الداخلية</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">الكرتونة</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">وحدات/كرتونة</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">سعر البيع</th>
                          <th className="px-3 py-3 text-xs font-black text-slate-500">التفاصيل</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {importResult.rows.map((row) => (
                          <tr key={row.rowIndex} className={row.errors.length > 0 ? 'bg-rose-50/50 dark:bg-rose-900/10' : ''}>
                            <td className="px-3 py-2.5 text-slate-400 font-mono">{row.rowIndex}</td>
                            <td className="px-3 py-2.5">
                              {row.errors.length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-rose-500 text-xs font-bold">
                                  <span className="material-icons-round text-sm">error</span> خطأ
                                </span>
                              ) : row.action === 'update' ? (
                                <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-bold">
                                  <span className="material-icons-round text-sm">sync</span> تحديث
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold">
                                  <span className="material-icons-round text-sm">add_circle</span> جديد
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">{row.name || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-500">{row.code || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-500">{row.model || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-500">{row.openingBalance}</td>
                            <td className="px-3 py-2.5 text-slate-500 font-mono">{row.chineseUnitCost || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-500 font-mono">{row.innerBoxCost || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-500 font-mono">{row.outerCartonCost || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-500 font-mono">{row.unitsPerCarton || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-500 font-mono">{row.sellingPrice || '—'}</td>
                            <td className="px-3 py-2.5">
                              {row.errors.length > 0 ? (
                                <ul className="text-xs text-rose-500 space-y-0.5">
                                  {row.errors.map((err, i) => <li key={i}>• {err}</li>)}
                                </ul>
                              ) : row.changes && row.changes.length > 0 ? (
                                <p className="text-xs text-amber-600">تحديث: {row.changes.join('، ')}</p>
                              ) : row.action === 'update' ? (
                                <p className="text-xs text-slate-400">لا توجد تغييرات</p>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <Button variant="outline" onClick={() => { setShowImportModal(false); setImportResult(null); }} disabled={importSaving}>إلغاء</Button>
              {importResult && importResult.validCount > 0 && (
                <Button variant="primary" onClick={handleImportSave} disabled={importSaving}>
                  {importSaving ? (
                    <>
                      <span className="material-icons-round animate-spin text-sm">refresh</span>
                      {importProgress.done} / {importProgress.total}
                    </>
                  ) : (
                    <>
                      <span className="material-icons-round text-sm">save</span>
                      حفظ {importResult.newCount > 0 && importResult.updateCount > 0
                        ? `${importResult.newCount} جديد + ${importResult.updateCount} تحديث`
                        : importResult.updateCount > 0
                          ? `تحديث ${importResult.updateCount} منتج`
                          : `${importResult.newCount} منتج جديد`
                      }
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Column Control Modal ── */}
      {showColumnsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowColumnsModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-primary">tune</span>
                <h3 className="text-lg font-bold">إدارة الأعمدة</h3>
              </div>
              <button onClick={() => setShowColumnsModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto flex-1 min-h-0">
              {[
                { key: 'openingStock' as const, label: 'الرصيد الافتتاحي', icon: 'inventory' },
                { key: 'totalProduction' as const, label: 'الإنتاج', icon: 'precision_manufacturing' },
                { key: 'wasteUnits' as const, label: 'الهالك', icon: 'delete_sweep' },
                { key: 'stockLevel' as const, label: 'الرصيد الحالي', icon: 'inventory_2' },
                { key: 'sellingPrice' as const, label: 'سعر البيع', icon: 'sell' },
                { key: 'totalCost' as const, label: 'إجمالي التكلفة', icon: 'payments' },
                { key: 'directIndirect' as const, label: 'مباشر / غير مباشر', icon: 'compare_arrows' },
                { key: 'costPerUnit' as const, label: 'تكلفة الوحدة', icon: 'price_check' },
                { key: 'chineseUnitCost' as const, label: 'تكلفة الوحدة الصينية (ج.م)', icon: 'local_shipping' },
                { key: 'chinesePriceCny' as const, label: 'السعر باليوان', icon: 'currency_yuan' },
                { key: 'innerBoxCost' as const, label: 'تكلفة العلبة الداخلية', icon: 'inventory' },
                { key: 'outerCartonCost' as const, label: 'تكلفة الكرتونة الخارجية', icon: 'package_2' },
                { key: 'unitsPerCarton' as const, label: 'عدد الوحدات/كرتونة', icon: 'view_in_ar' },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    visibleColumns[opt.key]
                      ? 'border-primary/30 bg-primary/5 dark:bg-primary/10'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns[opt.key]}
                    onChange={(e) => toggleColumn(opt.key, e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                  />
                  <span className={`material-icons-round text-lg ${visibleColumns[opt.key] ? 'text-primary' : 'text-slate-400'}`}>{opt.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-700 dark:text-white">{opt.label}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={() => {
                  const empty = Object.keys(DEFAULT_VISIBLE_COLUMNS).reduce((acc, key) => ({ ...acc, [key]: false }), {} as Record<ProductTableColumnKey, boolean>);
                  setVisibleColumns(empty);
                  if (typeof window !== 'undefined') window.localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(empty));
                }}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                إلغاء تحديد الكل
              </button>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setShowColumnsModal(false)}>إغلاق</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
