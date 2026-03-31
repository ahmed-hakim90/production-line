import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, Info, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button, SearchableSelect } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { getOperationalDateString } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { useGlobalModalManager } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { getReportDuplicateMessage } from '../../../modules/production/utils/reportDuplicateError';
import { catalogRawMaterialService } from '../../../modules/catalog/services/catalogRawMaterialService';
import { ProductionLineStatus, type ReportComponentScrapItem } from '../../../types';

type ReportFormState = {
  reportType: 'finished_product' | 'component_injection';
  employeeId: string;
  productId: string;
  lineId: string;
  workOrderId: string;
  date: string;
  quantityProduced: number;
  workersCount: number;
  workersProductionCount: number;
  workersPackagingCount: number;
  workersQualityCount: number;
  workersMaintenanceCount: number;
  workersExternalCount: number;
  componentScrapItems: ReportComponentScrapItem[];
  workHours: number;
  notes: string;
};

type FeedbackState = {
  text: string;
  type: 'success' | 'error';
};

const emptyForm = (): ReportFormState => ({
  reportType: 'finished_product',
  employeeId: '',
  productId: '',
  lineId: '',
  workOrderId: '',
  date: getOperationalDateString(8),
  quantityProduced: 0,
  workersCount: 0,
  workersProductionCount: 0,
  workersPackagingCount: 0,
  workersQualityCount: 0,
  workersMaintenanceCount: 0,
  workersExternalCount: 0,
  componentScrapItems: [],
  workHours: 0,
  notes: '',
});

const normalizeArabic = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

const parseInjectionCategoryTokens = (value?: string) =>
  String(value || 'حقن')
    .split(',')
    .map((part) => normalizeArabic(part))
    .filter(Boolean);

const isInjectionCategory = (value: string | undefined, tokens: string[]) => {
  const normalized = normalizeArabic(value || '');
  if (!normalized) return false;
  const strictTokens = tokens.filter((token) => token.includes('حقن'));
  const effectiveTokens = strictTokens.length > 0 ? strictTokens : ['حقن'];
  return effectiveTokens.some((token) => normalized.includes(token));
};

export const GlobalCreateReportModal: React.FC = () => {
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.REPORTS_CREATE);
  const { openModal } = useGlobalModalManager();
  const { can } = usePermission();
  const createReport = useAppStore((s) => s.createReport);
  const employees = useAppStore((s) => s.employees);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const lines = useAppStore((s) => s._rawLines);
  const products = useAppStore((s) => s._rawProducts);
  const injectionCategoryKeywords = useAppStore((s) => s.systemSettings.planSettings.injectionRawMaterialCategoryKeywords);
  const lineStatuses = useAppStore((s) => s.lineStatuses);
  const workOrders = useAppStore((s) => s.workOrders);
  const [form, setForm] = useState<ReportFormState>(emptyForm());
  const [rawMaterialOptions, setRawMaterialOptions] = useState<Array<{ id: string; name: string; code: string; categoryName?: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [showErrorOverlay, setShowErrorOverlay] = useState(false);
  const injectionCategoryTokens = useMemo(
    () => parseInjectionCategoryTokens(injectionCategoryKeywords),
    [injectionCategoryKeywords],
  );

  const canCreateFinishedReportsBase = can('reports.create');
  const forceInjectionOnly = can('reports.componentInjection.only') && !canCreateFinishedReportsBase;
  const canCreateFinishedReports = canCreateFinishedReportsBase && !forceInjectionOnly;
  const canManageComponentInjectionReports = can('reports.componentInjection.manage') || forceInjectionOnly;
  const isComponentEntryLocked = payload?.reportType === 'component_injection';
  const availableReportTypes = useMemo<Array<ReportFormState['reportType']>>(() => {
    if (isComponentEntryLocked) return ['component_injection'];
    const types: Array<ReportFormState['reportType']> = [];
    if (canCreateFinishedReports) types.push('finished_product');
    if (canManageComponentInjectionReports) types.push('component_injection');
    return types;
  }, [isComponentEntryLocked, canCreateFinishedReports, canManageComponentInjectionReports]);
  const canChooseReportType = availableReportTypes.length > 1;

  const currentEmployee = useMemo(
    () => rawEmployees.find((e) => e.userId === uid) ?? null,
    [rawEmployees, uid],
  );
  const isSupervisorReporter = currentEmployee?.level === 2;

  const activeWorkOrders = useMemo(
    () =>
      workOrders.filter((w) => {
        if (w.status !== 'pending' && w.status !== 'in_progress') return false;
        const woType = w.workOrderType === 'component_injection' ? 'component_injection' : 'finished_product';
        if (woType !== form.reportType) return false;
        if (!isSupervisorReporter || !currentEmployee?.id) return true;
        return w.supervisorId === currentEmployee.id;
      }),
    [workOrders, isSupervisorReporter, currentEmployee?.id, form.reportType],
  );

  const workersTotal = useMemo(() => (
    (form.workersProductionCount || 0)
    + (form.workersPackagingCount || 0)
    + (form.workersQualityCount || 0)
    + (form.workersMaintenanceCount || 0)
    + (form.workersExternalCount || 0)
  ), [
    form.workersProductionCount,
    form.workersPackagingCount,
    form.workersQualityCount,
    form.workersMaintenanceCount,
    form.workersExternalCount,
  ]);
  const effectiveWorkersCount = form.reportType === 'component_injection'
    ? Number(form.workersCount || 0)
    : workersTotal;
  const totalComponentScrapQty = useMemo(
    () => (form.componentScrapItems || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [form.componentScrapItems],
  );

  const injectionLineIds = useMemo(
    () => {
      const ids = new Set<string>();
      lines.forEach((line) => {
        if (line.id && line.status === ProductionLineStatus.INJECTION) ids.add(line.id);
      });
      lineStatuses.forEach((status) => {
        if (status.isInjectionLine && status.lineId) ids.add(status.lineId);
      });
      return ids;
    },
    [lines, lineStatuses],
  );

  const selectableLines = useMemo(
    () => (
      form.reportType === 'component_injection'
        ? lines.filter((line) => line.id && injectionLineIds.has(line.id))
        : lines
    ),
    [form.reportType, lines, injectionLineIds],
  );

  const injectionRawMaterialOptions = useMemo(() => {
    const categoryMatched = rawMaterialOptions.filter((row) => isInjectionCategory(row.categoryName, injectionCategoryTokens));
    const injCodeOnly = categoryMatched.filter((row) => /^INJ[-_]?/i.test(String(row.code || '').trim()));
    return injCodeOnly.length > 0 ? injCodeOnly : categoryMatched;
  }, [rawMaterialOptions, injectionCategoryTokens]);

  const selectableProducts = useMemo(
    () => (
      form.reportType === 'component_injection'
        ? injectionRawMaterialOptions.map((m) => ({ value: m.id, label: m.code ? `${m.name} (${m.code})` : m.name }))
        : products.map((p) => ({ value: p.id!, label: p.name }))
    ),
    [form.reportType, injectionRawMaterialOptions, products],
  );
  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((product) => {
      if (!product.id) return;
      map.set(product.id, product.name || 'منتج غير معروف');
    });
    return map;
  }, [products]);

  useEffect(() => {
    if (!isOpen || !isSupervisorReporter || !currentEmployee?.id) return;
    setForm((prev) => (
      prev.employeeId === currentEmployee.id
        ? prev
        : { ...prev, employeeId: currentEmployee.id }
    ));
  }, [isOpen, isSupervisorReporter, currentEmployee?.id]);

  useEffect(() => {
    let mounted = true;
    catalogRawMaterialService.getAll()
      .then((rows) => {
        if (!mounted) return;
        setRawMaterialOptions(
          rows
            .filter((row) => Boolean(row.id))
            .map((row) => ({
              id: String(row.id),
              name: String(row.name || '').trim(),
              code: String(row.code || '').trim(),
              categoryName: String(row.categoryName || '').trim(),
            })),
        );
      })
      .catch(() => {
        if (!mounted) return;
        setRawMaterialOptions([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (form.reportType !== 'component_injection' || !form.productId) return;
    const isAllowed = injectionRawMaterialOptions.some((item) => item.id === form.productId);
    if (isAllowed) return;
    setForm((prev) => ({ ...prev, productId: '', workOrderId: '' }));
  }, [form.reportType, form.productId, injectionRawMaterialOptions]);

  useEffect(() => {
    if (form.reportType !== 'component_injection') return;
    if (form.lineId && !injectionLineIds.has(form.lineId)) {
      setForm((prev) => ({ ...prev, lineId: '', workOrderId: '' }));
    }
  }, [form.reportType, form.lineId, injectionLineIds]);

  useEffect(() => {
    if (!isOpen) return;
    const requestedType: ReportFormState['reportType'] =
      payload?.reportType === 'component_injection' ? 'component_injection' : 'finished_product';

    const initialType = availableReportTypes.includes(requestedType)
      ? requestedType
      : (availableReportTypes[0] ?? 'finished_product');

    setForm((prev) => (
      prev.reportType === initialType
        ? prev
        : { ...prev, reportType: initialType, workOrderId: '' }
    ));
  }, [isOpen, payload?.reportType, availableReportTypes]);

  if (!isOpen) return null;
  if (!canCreateFinishedReports && !can('reports.edit') && !canManageComponentInjectionReports) return null;

  const closeModal = () => {
    setFeedback(null);
    setShowErrorOverlay(false);
    close();
  };

  const openErrorOverlay = (text: string) => {
    setFeedback({ text, type: 'error' });
    setShowErrorOverlay(true);
  };

  const closeErrorOverlay = () => {
    setShowErrorOverlay(false);
  };

  const clearFormAndCloseError = () => {
    setForm(emptyForm());
    setShowErrorOverlay(false);
  };

  const handleSave = async () => {
    if (saving) return;
    const requiresWorkers = form.reportType !== 'component_injection';
    if (form.reportType === 'finished_product' && forceInjectionOnly) {
      openErrorOverlay('هذا المستخدم مخصص لتقارير الحقن فقط');
      return;
    }
    if (form.reportType === 'component_injection' && !canManageComponentInjectionReports) {
      openErrorOverlay('غير مصرح بإنشاء تقرير مكونات الحقن');
      return;
    }
    if (
      !form.lineId
      || !form.productId
      || !form.employeeId
      || !form.quantityProduced
      || !form.workHours
      || (requiresWorkers && effectiveWorkersCount <= 0)
    ) {
      openErrorOverlay(requiresWorkers ? 'أكمل الحقول المطلوبة أولاً' : 'أكمل الحقول المطلوبة أولاً (بدون إلزام تفاصيل العمالة في تقرير الحقن)');
      return;
    }
    setSaving(true);
    setFeedback(null);
    setShowErrorOverlay(false);
    try {
      const created = await createReport({ ...form, workersCount: effectiveWorkersCount });
      if (!created) {
        const storeError = useAppStore.getState().error;
        openErrorOverlay(getReportDuplicateMessage(storeError, 'تعذر حفظ التقرير'));
        return;
      }
      setFeedback({ text: 'تم حفظ التقرير بنجاح', type: 'success' });
      setForm(emptyForm());
    } catch (error) {
      const errorMessage = getReportDuplicateMessage(error, 'تعذر حفظ التقرير');
      openErrorOverlay(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={closeModal}
    >
      <div
        className="relative bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-xl border border-[var(--color-border)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {showErrorOverlay && feedback?.type === 'error' && (
          <div className="absolute inset-0 z-30 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[var(--color-card)] border border-rose-200 rounded-[var(--border-radius-xl)] shadow-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="text-rose-500" />
                <h4 className="text-base font-extrabold text-rose-700">تعذر الحفظ</h4>
              </div>
              <p className="text-sm font-bold text-[var(--color-text)]">{feedback.text}</p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={closeErrorOverlay}>إغلاق التنبيه</Button>
                <Button variant="danger" onClick={clearFormAndCloseError}>
                  <Trash2 size={14} />
                  مسح البيانات
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold">
            {form.reportType === 'component_injection' ? 'إنشاء تقرير مكون حقن' : 'إنشاء تقرير إنتاج'}
          </h3>
          <button onClick={closeModal} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
          {feedback?.type === 'success' && (
            <div
              className={`rounded-[var(--border-radius-lg)] p-3 flex items-center gap-2 border ${
                'bg-emerald-50 border-emerald-200'
              }`}
            >
              <Info size={18} className="text-emerald-500" />
              <p
                className={`text-sm font-bold flex-1 ${
                  'text-emerald-700'
                }`}
              >
                {feedback.text}
              </p>
            </div>
          )}
          {canChooseReportType && (
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">نوع التقرير</label>
              <select
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-bold transition-all"
                value={form.reportType}
                onChange={(e) => {
                  const nextType = e.target.value === 'component_injection' ? 'component_injection' : 'finished_product';
                  setForm((prev) => ({ ...prev, reportType: nextType, workOrderId: '' }));
                }}
              >
                {availableReportTypes.includes('finished_product') && (
                  <option value="finished_product">تقرير إنتاج عادي</option>
                )}
                {availableReportTypes.includes('component_injection') && (
                  <option value="component_injection">تقرير مكون حقن</option>
                )}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">أمر شغل (اختياري)</label>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-bold transition-all"
              value={form.workOrderId}
              onChange={(e) => {
                const wo = activeWorkOrders.find((w) => w.id === e.target.value);
                if (!wo) {
                  setForm((prev) => ({ ...prev, workOrderId: '' }));
                  return;
                }
                setForm((prev) => ({
                  ...prev,
                  workOrderId: wo.id ?? '',
                  reportType: wo.workOrderType === 'component_injection' ? 'component_injection' : prev.reportType,
                  lineId: wo.lineId,
                  productId: wo.productId,
                  employeeId: isSupervisorReporter && currentEmployee?.id ? currentEmployee.id : wo.supervisorId,
                }));
              }}
            >
              <option value="">اختر أمر شغل لتعبئة البيانات تلقائياً</option>
              {activeWorkOrders.map((wo) => (
                <option key={wo.id} value={wo.id!}>
                  {`${productNameById.get(wo.productId) ?? 'منتج غير معروف'} — المتبقي: ${Math.max(0, Number(wo.quantity || 0) - Number(wo.producedQuantity || 0))} وحدة`}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">التاريخ *</label>
              <input
                type="date"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">المشرف *</label>
              {isSupervisorReporter && currentEmployee ? (
                <input
                  type="text"
                  readOnly
                  value={currentEmployee.name}
                  className="w-full border border-[var(--color-border)] bg-[#f0f2f5]/70 rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-bold text-[var(--color-text-muted)]"
                />
              ) : (
                <SearchableSelect
                  placeholder="اختر المشرف"
                  options={employees.filter((s) => s.level === 2).map((s) => ({ value: s.id, label: s.name }))}
                  value={form.employeeId}
                  onChange={(v) => setForm((prev) => ({ ...prev, employeeId: v }))}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                {form.reportType === 'component_injection' ? 'الخط *' : 'خط الإنتاج *'}
              </label>
              <SearchableSelect
                placeholder="اختر الخط"
                options={selectableLines.map((l) => ({ value: l.id!, label: l.name }))}
                value={form.lineId}
                onChange={(v) => setForm((prev) => ({ ...prev, lineId: v, workOrderId: '' }))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                {form.reportType === 'component_injection' ? 'اسم المكون *' : 'المنتج *'}
              </label>
              <SearchableSelect
                placeholder={form.reportType === 'component_injection' ? 'اختر المكون' : 'اختر المنتج'}
                options={selectableProducts}
                value={form.productId}
                onChange={(v) => setForm((prev) => ({ ...prev, productId: v, workOrderId: '' }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">الكمية المنتجة *</label>
              <input
                type="number"
                min={0}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.quantityProduced || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, quantityProduced: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
            {form.reportType === 'component_injection' ? (
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">هالك المكونات</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={totalComponentScrapQty || ''}
                  onChange={(e) => {
                    const qty = Number(e.target.value || 0);
                    if (qty > 0) {
                      setForm((prev) => ({
                        ...prev,
                        componentScrapItems: [{ materialId: '__total__', materialName: 'هالك مكونات', quantity: qty }],
                      }));
                      return;
                    }
                    setForm((prev) => ({ ...prev, componentScrapItems: [] }));
                  }}
                  placeholder="0"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">هالك المكونات</label>
                <button
                  type="button"
                  onClick={() => {
                    if (!form.productId) return;
                    openModal(MODAL_KEYS.REPORTS_COMPONENT_SCRAP, {
                      productId: form.productId,
                      items: form.componentScrapItems,
                      onSave: (items: ReportComponentScrapItem[]) => {
                        setForm((prev) => ({ ...prev, componentScrapItems: items }));
                      },
                    });
                  }}
                  disabled={!form.productId}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] bg-[#f8f9fa] hover:bg-[#f0f2f5] disabled:opacity-60 disabled:cursor-not-allowed text-sm p-3.5 outline-none font-bold transition-all flex items-center justify-between gap-2"
                >
                  <span className="truncate text-right">
                    {totalComponentScrapQty > 0
                      ? `إجمالي الهالك: ${totalComponentScrapQty}`
                      : (form.productId ? 'تحديد هالك المكونات' : 'اختر المنتج أولاً')}
                  </span>
                  <ExternalLink size={16} />
                </button>
              </div>
            )}
          </div>

          {form.reportType === 'component_injection' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">إجمالي العمالة</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.workersCount || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, workersCount: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">ساعات العمل *</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.workHours || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, workHours: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">إجمالي العمالة *</label>
                <input
                  type="number"
                  readOnly
                  className="w-full border border-[var(--color-border)] bg-[#f0f2f5]/70 rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-black text-primary"
                  value={workersTotal || ''}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة إنتاج</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.workersProductionCount || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, workersProductionCount: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة تغليف</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.workersPackagingCount || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, workersPackagingCount: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة جودة</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.workersQualityCount || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, workersQualityCount: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة صيانة</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.workersMaintenanceCount || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, workersMaintenanceCount: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة خارجية</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.workersExternalCount || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, workersExternalCount: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">ساعات العمل *</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.workHours || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, workHours: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">ملحوظة</label>
            <textarea
              rows={3}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all resize-y"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="اكتب أي ملاحظة إضافية للتقرير..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={closeModal}>إلغاء</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={
              saving
              || !form.lineId
              || !form.productId
              || !form.employeeId
              || !form.quantityProduced
              || !form.workHours
              || (form.reportType !== 'component_injection' && effectiveWorkersCount <= 0)
            }
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Plus size={14} />
            حفظ التقرير
          </Button>
        </div>
      </div>
    </div>
  );
};

