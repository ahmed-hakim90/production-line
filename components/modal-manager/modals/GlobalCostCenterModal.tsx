import React, { useEffect, useState } from 'react';
import { getDocs } from 'firebase/firestore';
import { Loader2, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import type { CostCenter } from '../../../types';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { departmentsRef } from '../../../modules/hr/collections';
import type { FirestoreDepartment } from '../../../modules/hr/types';
import { useTranslation } from 'react-i18next';

type CostCenterPayload = {
  costCenter?: CostCenter;
};

export const GlobalCostCenterModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.COST_CENTERS_CREATE);
  const createCostCenter = useAppStore((s) => s.createCostCenter);
  const updateCostCenter = useAppStore((s) => s.updateCostCenter);
  const products = useAppStore((s) => s.products);
  const employees = useAppStore((s) => s._rawEmployees);
  const { can } = usePermission();
  const canManage = can('costs.manage');

  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [departmentNameMap, setDepartmentNameMap] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '',
    type: 'indirect' as 'indirect' | 'direct',
    allocationBasis: 'by_qty' as 'line_percentage' | 'by_qty',
    productScope: 'selected' as 'all' | 'selected' | 'category',
    productIds: [] as string[],
    productCategories: [] as string[],
    valueSource: 'manual' as 'manual' | 'salaries' | 'combined',
    employeeScope: 'selected' as 'selected' | 'department',
    employeeIds: [] as string[],
    employeeDepartmentIds: [] as string[],
    manualAdjustment: 0,
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  const modalPayload = payload as CostCenterPayload | undefined;

  useEffect(() => {
    if (!isOpen) return;
    const cc = modalPayload?.costCenter || null;
    setEditingCostCenter(cc);
    if (cc) {
      setForm({
        name: cc.name,
        type: cc.type,
        allocationBasis: cc.allocationBasis || 'by_qty',
        productScope: cc.productScope || 'selected',
        productIds: cc.productIds || [],
        productCategories: cc.productCategories || [],
        valueSource: cc.valueSource || 'manual',
        employeeScope: cc.employeeScope || 'selected',
        employeeIds: cc.employeeIds || [],
        employeeDepartmentIds: cc.employeeDepartmentIds || [],
        manualAdjustment: Number(cc.manualAdjustment || 0),
        isActive: cc.isActive,
      });
    } else {
      setForm({
        name: '',
        type: 'indirect',
        allocationBasis: 'by_qty',
        productScope: 'selected',
        productIds: [],
        productCategories: [],
        valueSource: 'manual',
        employeeScope: 'selected',
        employeeIds: [],
        employeeDepartmentIds: [],
        manualAdjustment: 0,
        isActive: true,
      });
    }
    setProductSearch('');
    setCategorySearch('');
    setEmployeeSearch('');
    setDepartmentSearch('');
  }, [isOpen, modalPayload]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      try {
        const snap = await getDocs(departmentsRef());
        if (!active) return;
        const nextMap: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as FirestoreDepartment;
          nextMap[d.id] = String(data?.name || '').trim() || d.id;
        });
        setDepartmentNameMap(nextMap);
      } catch {
        if (!active) return;
        setDepartmentNameMap({});
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen || !canManage) return null;

  const handleClose = () => {
    if (saving) return;
    close();
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (form.type === 'indirect' && form.productScope === 'selected' && form.productIds.length === 0) return;
    if (form.type === 'indirect' && form.productScope === 'category' && form.productCategories.length === 0) return;
    if (
      form.type === 'indirect'
      && ['salaries', 'combined'].includes(form.valueSource)
      && form.employeeScope === 'selected'
      && form.employeeIds.length === 0
    ) return;
    if (
      form.type === 'indirect'
      && ['salaries', 'combined'].includes(form.valueSource)
      && form.employeeScope === 'department'
      && form.employeeDepartmentIds.length === 0
    ) return;
    setSaving(true);
    try {
      if (editingCostCenter?.id) {
        await updateCostCenter(editingCostCenter.id, form);
      } else {
        await createCostCenter(form);
      }
      close();
    } finally {
      setSaving(false);
    }
  };

  const visibleProducts = products.filter((p) => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return true;
    return `${p.name} ${p.code}`.toLowerCase().includes(q);
  });
  const categoryOptions = Array.from(
    new Set(products.map((p) => String(p.category || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'ar'));
  const visibleCategories = categoryOptions.filter((category) => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return true;
    return category.toLowerCase().includes(q);
  });
  const visibleEmployees = employees
    .filter((e) => e.isActive)
    .filter((e) => {
      const q = employeeSearch.trim().toLowerCase();
      if (!q) return true;
      return `${e.name} ${e.code || ''}`.toLowerCase().includes(q);
    });
  const departmentOptions = Array.from(
    new Set(
      employees
        .filter((e) => e.isActive)
        .map((e) => String(e.departmentId || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => {
    const aName = departmentNameMap[a] || a;
    const bName = departmentNameMap[b] || b;
    return aName.localeCompare(bName, 'ar');
  });
  const visibleDepartments = departmentOptions.filter((dept) => {
    const q = departmentSearch.trim().toLowerCase();
    if (!q) return true;
    const label = (departmentNameMap[dept] || dept).toLowerCase();
    return label.includes(q);
  });

  const toggleListValue = (
    key: 'productIds' | 'productCategories' | 'employeeIds' | 'employeeDepartmentIds',
    value: string
  ) => {
    setForm((prev) => {
      const list = new Set(prev[key]);
      if (list.has(value)) list.delete(value);
      else list.add(value);
      return { ...prev, [key]: Array.from(list) };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold">{editingCostCenter ? t('modalManager.costCenter.editTitle') : t('modalManager.costCenter.createTitle')}</h3>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.nameRequired')}</label>
            <input
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('modalManager.costCenter.namePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.typeRequired')}</label>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'indirect' | 'direct' })}
            >
              <option value="indirect">{t('modalManager.costCenter.typeIndirect')}</option>
              <option value="direct">{t('modalManager.costCenter.typeDirect')}</option>
            </select>
          </div>
          {form.type === 'indirect' && (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.allocationBasis')}</label>
                <select
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.allocationBasis}
                  onChange={(e) => setForm({ ...form, allocationBasis: e.target.value as 'line_percentage' | 'by_qty' })}
                >
                  <option value="by_qty">{t('modalManager.costCenter.allocationByQty')}</option>
                  <option value="line_percentage">{t('modalManager.costCenter.allocationByLinePercentage')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.productScope')}</label>
                <select
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.productScope}
                  onChange={(e) => setForm({ ...form, productScope: e.target.value as 'all' | 'selected' | 'category' })}
                >
                  <option value="selected">{t('modalManager.costCenter.productScopeSelected')}</option>
                  <option value="category">{t('modalManager.costCenter.productScopeCategory')}</option>
                  <option value="all">{t('modalManager.costCenter.productScopeAll')}</option>
                </select>
              </div>
              {form.productScope === 'selected' && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.selectProducts')}</label>
                  <input
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-2.5 outline-none"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder={t('modalManager.costCenter.searchProduct')}
                  />
                  <div className="max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-2 space-y-1">
                    {visibleProducts.map((p) => {
                      const checked = form.productIds.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleListValue('productIds', p.id)}
                          />
                          <span>{p.name} ({p.code || p.id})</span>
                        </label>
                      );
                    })}
                    {visibleProducts.length === 0 && (
                      <p className="text-xs text-[var(--color-text-muted)]">{t('modalManager.costCenter.noMatchingProducts')}</p>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">{t('modalManager.costCenter.selectedProductsCount', { count: form.productIds.length })}</p>
                </div>
              )}
              {form.productScope === 'category' && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.selectProductCategory')}</label>
                  <input
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-2.5 outline-none"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder={t('modalManager.costCenter.searchCategory')}
                  />
                  <div className="max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-2 space-y-1">
                    {visibleCategories.map((category) => {
                      const checked = form.productCategories.includes(category);
                      return (
                        <label key={category} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleListValue('productCategories', category)}
                          />
                          <span>{category}</span>
                        </label>
                      );
                    })}
                    {visibleCategories.length === 0 && (
                      <p className="text-xs text-[var(--color-text-muted)]">{t('modalManager.costCenter.noMatchingCategories')}</p>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">{t('modalManager.costCenter.selectedCategoriesCount', { count: form.productCategories.length })}</p>
                </div>
              )}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.valueSource')}</label>
                <select
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.valueSource}
                  onChange={(e) => setForm({ ...form, valueSource: e.target.value as 'manual' | 'salaries' | 'combined' })}
                >
                  <option value="manual">{t('modalManager.costCenter.valueSourceManual')}</option>
                  <option value="salaries">{t('modalManager.costCenter.valueSourceSalaries')}</option>
                  <option value="combined">{t('modalManager.costCenter.valueSourceCombined')}</option>
                </select>
              </div>
              {(form.valueSource === 'salaries' || form.valueSource === 'combined') && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.employeeScope')}</label>
                  <select
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.employeeScope}
                    onChange={(e) => setForm({ ...form, employeeScope: e.target.value as 'selected' | 'department' })}
                  >
                    <option value="selected">{t('modalManager.costCenter.employeeScopeSelected')}</option>
                    <option value="department">{t('modalManager.costCenter.employeeScopeDepartment')}</option>
                  </select>
                  {form.employeeScope === 'selected' ? (
                    <>
                      <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.selectEmployees')}</label>
                      <input
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-2.5 outline-none"
                        value={employeeSearch}
                        onChange={(e) => setEmployeeSearch(e.target.value)}
                        placeholder={t('modalManager.costCenter.searchEmployee')}
                      />
                      <div className="max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-2 space-y-1">
                        {visibleEmployees.map((e) => {
                          const checked = form.employeeIds.includes(String(e.id || ''));
                          return (
                            <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleListValue('employeeIds', String(e.id || ''))}
                              />
                              <span>{e.name} ({e.code || e.id})</span>
                            </label>
                          );
                        })}
                        {visibleEmployees.length === 0 && (
                          <p className="text-xs text-[var(--color-text-muted)]">{t('modalManager.costCenter.noMatchingEmployees')}</p>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">{t('modalManager.costCenter.selectedEmployeesCount', { count: form.employeeIds.length })}</p>
                    </>
                  ) : (
                    <>
                      <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.selectDepartment')}</label>
                      <input
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-2.5 outline-none"
                        value={departmentSearch}
                        onChange={(e) => setDepartmentSearch(e.target.value)}
                        placeholder={t('modalManager.costCenter.searchDepartment')}
                      />
                      <div className="max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-2 space-y-1">
                        {visibleDepartments.map((dept) => {
                          const checked = form.employeeDepartmentIds.includes(dept);
                          const label = departmentNameMap[dept] || dept;
                          return (
                            <label key={dept} className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleListValue('employeeDepartmentIds', dept)}
                              />
                              <span>{label}</span>
                            </label>
                          );
                        })}
                        {visibleDepartments.length === 0 && (
                          <p className="text-xs text-[var(--color-text-muted)]">{t('modalManager.costCenter.noMatchingDepartments')}</p>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">{t('modalManager.costCenter.selectedDepartmentsCount', { count: form.employeeDepartmentIds.length })}</p>
                    </>
                  )}
                </div>
              )}
              {form.valueSource === 'combined' && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.monthlyManualAdjustment')}</label>
                  <input
                    type="number"
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none"
                    value={form.manualAdjustment || ''}
                    onChange={(e) => setForm({ ...form, manualAdjustment: Number(e.target.value || 0) })}
                    placeholder="0"
                  />
                </div>
              )}
            </>
          )}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="w-5 h-5 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
            />
            <span className="text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.costCenter.active')}</span>
          </label>
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={handleClose}>{t('ui.cancel')}</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={
              saving
              || !form.name.trim()
              || (form.type === 'indirect' && form.productScope === 'selected' && form.productIds.length === 0)
              || (form.type === 'indirect' && form.productScope === 'category' && form.productCategories.length === 0)
              || (
                form.type === 'indirect'
                && ['salaries', 'combined'].includes(form.valueSource)
                && form.employeeScope === 'selected'
                && form.employeeIds.length === 0
              )
              || (
                form.type === 'indirect'
                && ['salaries', 'combined'].includes(form.valueSource)
                && form.employeeScope === 'department'
                && form.employeeDepartmentIds.length === 0
              )
            }
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t('ui.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

