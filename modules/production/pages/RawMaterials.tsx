import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Button } from '../components/UI';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import type { RawMaterial } from '../../inventory/types';
import { usePermission } from '../../../utils/permissions';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { productMaterialService } from '../services/productMaterialService';
import { productService } from '../services/productService';
import type { FirestoreProduct } from '../../../types';

type RawMaterialModalPayload = {
  mode?: 'create' | 'edit';
  rawMaterial?: RawMaterial;
  onSaved?: () => void;
};

type UsageInfo = {
  count: number;
  productNames: string[];
};

const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

export const RawMaterials: React.FC = () => {
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const [rows, setRows] = useState<RawMaterial[]>([]);
  const [usageByMaterialId, setUsageByMaterialId] = useState<Record<string, UsageInfo>>({});
  const [loading, setLoading] = useState(false);
  const [savingDeleteId, setSavingDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');

  const loadRawMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const [data, materials, products] = await Promise.all([
        rawMaterialService.getAll(),
        productMaterialService.getAll(),
        productService.getAll(),
      ]);
      setRows(data);

      const productNameById = new Map<string, string>();
      (products || []).forEach((product: FirestoreProduct) => {
        if (product.id) productNameById.set(product.id, product.name || product.id);
      });

      const usageById = new Map<string, Set<string>>();
      const usageByName = new Map<string, Set<string>>();
      for (const material of materials) {
        const productId = String(material.productId || '').trim();
        if (!productId) continue;
        const materialId = String(material.materialId || '').trim();
        const materialName = normalizeText(String(material.materialName || ''));

        if (materialId) {
          if (!usageById.has(materialId)) usageById.set(materialId, new Set());
          usageById.get(materialId)!.add(productId);
        }
        if (materialName) {
          if (!usageByName.has(materialName)) usageByName.set(materialName, new Set());
          usageByName.get(materialName)!.add(productId);
        }
      }

      const usageRecord: Record<string, UsageInfo> = {};
      for (const rawMaterial of data) {
        if (!rawMaterial.id) continue;
        const byIdSet = usageById.get(rawMaterial.id) ?? new Set<string>();
        const byNameSet = usageByName.get(normalizeText(rawMaterial.name || '')) ?? new Set<string>();
        const productIds = new Set<string>([...byIdSet, ...byNameSet]);
        const productNames = Array.from(productIds)
          .map((id) => productNameById.get(id) || id)
          .sort((a, b) => a.localeCompare(b, 'ar'));
        usageRecord[rawMaterial.id] = {
          count: productIds.size,
          productNames,
        };
      }
      setUsageByMaterialId(usageRecord);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRawMaterials();
  }, [loadRawMaterials]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const count = row.id ? (usageByMaterialId[row.id]?.count || 0) : 0;
      const usageMatch =
        usageFilter === 'all' ||
        (usageFilter === 'used' && count > 0) ||
        (usageFilter === 'unused' && count === 0);
      const searchMatch =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q);
      return usageMatch && searchMatch;
    });
  }, [rows, search, usageByMaterialId, usageFilter]);

  const activeCount = useMemo(
    () => rows.filter((row) => row.isActive !== false).length,
    [rows],
  );
  const linkedCount = useMemo(
    () => rows.filter((row) => row.id && (usageByMaterialId[row.id]?.count || 0) > 0).length,
    [rows, usageByMaterialId],
  );
  const unlinkedCount = useMemo(
    () => rows.filter((row) => row.id && (usageByMaterialId[row.id]?.count || 0) === 0).length,
    [rows, usageByMaterialId],
  );

  const openCreateModal = () => {
    setFeedback(null);
    const payload: RawMaterialModalPayload = {
      mode: 'create',
      onSaved: () => {
        void loadRawMaterials();
        setFeedback({ type: 'success', text: 'تمت إضافة المادة الخام بنجاح.' });
      },
    };
    openModal(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE, payload);
  };

  const openEditModal = (rawMaterial: RawMaterial) => {
    setFeedback(null);
    const payload: RawMaterialModalPayload = {
      mode: 'edit',
      rawMaterial,
      onSaved: () => {
        void loadRawMaterials();
        setFeedback({ type: 'success', text: 'تم تعديل المادة الخام بنجاح.' });
      },
    };
    openModal(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE, payload);
  };

  const handleDelete = async (rawMaterial: RawMaterial) => {
    const rawId = rawMaterial.id;
    if (!rawId) return;
    const usage = usageByMaterialId[rawId];
    if ((usage?.count || 0) > 0) {
      setFeedback({
        type: 'error',
        text: `لا يمكن حذف المادة "${rawMaterial.name}" لأنها مستخدمة في ${usage.count} منتج.`,
      });
      return;
    }
    const ok = window.confirm(`هل تريد حذف المادة الخام "${rawMaterial.name}"؟`);
    if (!ok) return;

    setSavingDeleteId(rawId);
    setFeedback(null);
    try {
      await rawMaterialService.delete(rawId);
      await loadRawMaterials();
      setFeedback({ type: 'success', text: 'تم حذف المادة الخام بنجاح.' });
    } catch (error: any) {
      setFeedback({
        type: 'error',
        text: error?.message || 'تعذر حذف المادة الخام. حاول مرة أخرى.',
      });
    } finally {
      setSavingDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
              <span className="material-icons-round text-indigo-600">science</span>
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">المواد الخام</h2>
              <p className="text-sm text-slate-500 font-medium">تعريف وإدارة المواد الخام المستخدمة في ربط المنتجات.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void loadRawMaterials()} disabled={loading}>
              <span className={`material-icons-round text-sm ${loading ? 'animate-spin' : ''}`}>refresh</span>
              تحديث
            </Button>
            {can('inventory.items.manage') && (
              <Button
                variant="primary"
                data-modal-key={MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE}
                onClick={openCreateModal}
              >
                <span className="material-icons-round text-sm">add</span>
                إضافة مادة خام
              </Button>
            )}
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold border ${
          feedback.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="!p-4">
          <p className="text-xs font-bold text-slate-400">إجمالي المواد</p>
          <p className="text-2xl font-black text-slate-800 dark:text-white">{rows.length}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs font-bold text-slate-400">مواد مستخدمة بمنتجات</p>
          <p className="text-2xl font-black text-blue-600">{linkedCount}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs font-bold text-slate-400">مواد غير مستخدمة</p>
          <p className="text-2xl font-black text-amber-600">{unlinkedCount}</p>
        </Card>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            className="md:col-span-3 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
            placeholder="بحث بالاسم أو الكود"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50 dark:bg-slate-800"
            value={usageFilter}
            onChange={(e) => setUsageFilter(e.target.value as 'all' | 'used' | 'unused')}
          >
            <option value="all">كل المواد</option>
            <option value="used">مستخدمة في منتجات</option>
            <option value="unused">غير مستخدمة</option>
          </select>
          <div className="text-sm text-slate-400 font-bold flex items-center">
            النتائج: {filteredRows.length} / النشطة: {activeCount}
          </div>
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3 text-xs font-black text-slate-500">المادة</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">الكود</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500">الوحدة</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">الحد الأدنى</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">مستخدم في منتجات</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">الحالة</th>
                {can('inventory.items.manage') && (
                  <th className="px-4 py-3 text-xs font-black text-slate-500 text-center">إجراء</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr>
                  <td colSpan={can('inventory.items.manage') ? 7 : 6} className="px-4 py-10 text-center text-slate-400">
                    جاري تحميل المواد الخام...
                  </td>
                </tr>
              )}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={can('inventory.items.manage') ? 7 : 6} className="px-4 py-10 text-center text-slate-400">
                    لا توجد مواد خام مطابقة.
                  </td>
                </tr>
              )}
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">{row.name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">{row.code}</td>
                  <td className="px-4 py-3 text-sm">{row.unit || 'unit'}</td>
                  <td className="px-4 py-3 text-sm text-center font-bold">{row.minStock || 0}</td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const usage = row.id ? usageByMaterialId[row.id] : undefined;
                      const count = usage?.count || 0;
                      if (count === 0) {
                        return <span className="text-xs font-bold text-slate-400">غير مستخدمة</span>;
                      }
                      return (
                        <div className="text-xs">
                          <p className="font-black text-blue-600">{count}</p>
                          <p className="text-slate-400 truncate max-w-[220px]" title={(usage?.productNames || []).join('، ')}>
                            {(usage?.productNames || []).slice(0, 3).join('، ')}
                            {(usage?.productNames || []).length > 3 ? ` +${(usage?.productNames || []).length - 3}` : ''}
                          </p>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${row.isActive === false ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {row.isActive === false ? 'غير نشط' : 'نشط'}
                    </span>
                  </td>
                  {can('inventory.items.manage') && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="p-1.5 text-slate-400 hover:text-primary transition-colors rounded"
                          data-modal-key={MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE}
                          onClick={() => openEditModal(row)}
                          title="تعديل المادة الخام"
                        >
                          <span className="material-icons-round text-sm">edit</span>
                        </button>
                        <button
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded disabled:opacity-40 disabled:hover:text-slate-400"
                          onClick={() => void handleDelete(row)}
                          disabled={savingDeleteId === row.id}
                          title="حذف المادة الخام"
                        >
                          <span className="material-icons-round text-sm">
                            {savingDeleteId === row.id ? 'hourglass_top' : 'delete'}
                          </span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

