
import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { formatNumber } from '../utils/calculations';
import { FirestoreProduct } from '../types';
import { usePermission } from '../utils/permissions';
import { parseProductsExcel, toProductData, ProductImportResult } from '../utils/importProducts';
import { downloadProductsTemplate } from '../utils/downloadTemplates';

const emptyForm: Omit<FirestoreProduct, 'id'> = {
  name: '',
  model: '',
  code: '',
  openingBalance: 0,
};

export const Products: React.FC = () => {
  const products = useAppStore((s) => s.products);
  const createProduct = useAppStore((s) => s.createProduct);
  const updateProduct = useAppStore((s) => s.updateProduct);
  const deleteProduct = useAppStore((s) => s.deleteProduct);
  const productsLoading = useAppStore((s) => s.productsLoading);

  const { can } = usePermission();
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setEditId(id);
    setForm({
      name: product.name,
      model: product.category,
      code: product.code,
      openingBalance: product.openingStock,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) return;
    setSaving(true);
    if (editId) {
      await updateProduct(editId, form);
    } else {
      await createProduct(form);
    }
    setSaving(false);
    setShowModal(false);
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
      setImportResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0 });
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
        await createProduct(toProductData(row));
      } catch { /* skip failed */ }
      done++;
      setImportProgress({ done, total: validRows.length });
    }

    setImportSaving(false);
    setShowImportModal(false);
    setImportResult(null);
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
        {can("products.create") && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="shrink-0">
              <span className="material-icons-round text-sm">upload_file</span>
              <span className="hidden sm:inline">رفع Excel</span>
            </Button>
            <Button variant="primary" onClick={openCreate} className="shrink-0">
              <span className="material-icons-round text-sm">add</span>
              إضافة منتج جديد
            </Button>
          </div>
        )}
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
            <option value="المواد الخام">المواد الخام</option>
            <option value="المنتجات النهائية">المنتجات النهائية</option>
            <option value="نصف مصنع">نصف مصنع</option>
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
                <th className="px-6 py-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">اسم المنتج</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">الكود</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] text-center">الرصيد الافتتاحي</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] text-center">إجمالي الإنتاج</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] text-center">إجمالي الهالك</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] text-center">متوسط وقت التجميع</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] text-left">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
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
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200/50 flex items-center justify-center">
                        <span className="material-icons-round text-slate-300 text-2xl">inventory_2</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-700 dark:text-slate-200 hover:text-primary cursor-pointer transition-colors" onClick={() => navigate(`/products/${product.id}`)}>{product.name}</span>
                        {product.category && (
                          <p className="text-xs text-slate-400 mt-0.5">{product.category}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-slate-500 dark:text-slate-400 font-mono text-sm font-medium">{product.code}</td>
                  <td className="px-6 py-5 text-center font-black text-slate-700 dark:text-slate-300">{formatNumber(product.openingStock)}</td>
                  <td className="px-6 py-5 text-center">
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm font-black ring-1 ring-emerald-500/20">
                      {formatNumber(product.totalProduction)}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-center text-rose-500 font-bold">{formatNumber(product.wasteUnits)} <span className="text-[10px] font-normal opacity-70">وحدة</span></td>
                  <td className="px-6 py-5 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-slate-500">
                      <span className="material-icons-round text-sm text-slate-400">schedule</span>
                      <span className="text-sm font-bold">{product.avgAssemblyTime} دقيقة</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-left">
                    <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => navigate(`/products/${product.id}`)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all" title="عرض التفاصيل">
                        <span className="material-icons-round text-lg">visibility</span>
                      </button>
                      {can("products.edit") && (
                        <button onClick={() => openEdit(product.id)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all">
                          <span className="material-icons-round text-lg">edit</span>
                        </button>
                      )}
                      {can("products.delete") && (
                        <button onClick={() => setDeleteConfirmId(product.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all">
                          <span className="material-icons-round text-lg">delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-sm text-slate-500 font-bold">
            إجمالي <span className="text-primary">{filtered.length}</span> منتج
          </div>
        </div>
      </Card>

      {/* ── Add / Edit Modal ── */}
      {showModal && (can("products.create") || can("products.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editId ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
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
                    <option value="المواد الخام">المواد الخام</option>
                    <option value="المنتجات النهائية">المنتجات النهائية</option>
                    <option value="نصف مصنع">نصف مصنع</option>
                  </select>
                </div>
              </div>
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
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowModal(false)}>إلغاء</Button>
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-4 py-2 text-sm font-bold text-emerald-600">
                      صالح: {importResult.validCount}
                    </div>
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
                          <th className="px-4 py-3 text-xs font-black text-slate-500">صف</th>
                          <th className="px-4 py-3 text-xs font-black text-slate-500">الحالة</th>
                          <th className="px-4 py-3 text-xs font-black text-slate-500">اسم المنتج</th>
                          <th className="px-4 py-3 text-xs font-black text-slate-500">الكود</th>
                          <th className="px-4 py-3 text-xs font-black text-slate-500">الفئة</th>
                          <th className="px-4 py-3 text-xs font-black text-slate-500">الرصيد</th>
                          <th className="px-4 py-3 text-xs font-black text-slate-500">الأخطاء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {importResult.rows.map((row) => (
                          <tr key={row.rowIndex} className={row.errors.length > 0 ? 'bg-rose-50/50 dark:bg-rose-900/10' : ''}>
                            <td className="px-4 py-2.5 text-slate-400 font-mono">{row.rowIndex}</td>
                            <td className="px-4 py-2.5">
                              {row.errors.length === 0 ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold">
                                  <span className="material-icons-round text-sm">check_circle</span> صالح
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-500 text-xs font-bold">
                                  <span className="material-icons-round text-sm">error</span> خطأ
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{row.name || '—'}</td>
                            <td className="px-4 py-2.5 font-mono text-slate-500">{row.code || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-500">{row.model || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-500">{row.openingBalance}</td>
                            <td className="px-4 py-2.5">
                              {row.errors.length > 0 && (
                                <ul className="text-xs text-rose-500 space-y-0.5">
                                  {row.errors.map((err, i) => <li key={i}>• {err}</li>)}
                                </ul>
                              )}
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
                      حفظ {importResult.validCount} منتج
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
