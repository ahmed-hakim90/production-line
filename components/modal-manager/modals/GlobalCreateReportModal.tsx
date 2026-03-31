import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, Info, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
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

const WORK_ORDER_NONE = '__work_order_none__';

export const GlobalCreateReportModal: React.FC = () => {
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.REPORTS_CREATE);
  const { openModal } = useGlobalModalManager();
  const { can } = usePermission();
  const {
    createReport,
    employees,
    rawEmployees,
    uid,
    lines,
    products,
    injectionCategoryKeywords,
    lineStatuses,
    workOrders,
  } = useAppStore(
    useShallow((s) => ({
      createReport: s.createReport,
      employees: s.employees,
      rawEmployees: s._rawEmployees,
      uid: s.uid,
      lines: s._rawLines,
      products: s._rawProducts,
      injectionCategoryKeywords: s.systemSettings.planSettings.injectionRawMaterialCategoryKeywords,
      lineStatuses: s.lineStatuses,
      workOrders: s.workOrders,
    })),
  );
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

  const fieldInputClass =
    'w-full border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus-visible:border-primary focus-visible:ring-primary/20 font-medium transition-all';

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeModal();
      }}
    >
      <DialogContent
        dir="rtl"
        className={cn(
          'relative flex max-h-[90vh] max-w-xl flex-col gap-0 overflow-hidden border-[var(--color-border)] bg-[var(--color-card)] p-0 shadow-2xl sm:rounded-[var(--border-radius-xl)]',
          '[&>button.absolute]:hidden',
        )}
        onPointerDownOutside={(e) => {
          if (showErrorOverlay) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (showErrorOverlay) e.preventDefault();
        }}
      >
        {showErrorOverlay && feedback?.type === 'error' ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-md space-y-4 rounded-[var(--border-radius-xl)] border border-rose-200 bg-[var(--color-card)] p-5 shadow-2xl">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="text-rose-500" />
                <h4 className="text-base font-extrabold text-rose-700">تعذر الحفظ</h4>
              </div>
              <p className="text-sm font-bold text-[var(--color-text)]">{feedback.text}</p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={closeErrorOverlay}>
                  إغلاق التنبيه
                </Button>
                <Button variant="danger" onClick={clearFormAndCloseError}>
                  <Trash2 size={14} />
                  مسح البيانات
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <DialogHeader className="shrink-0 space-y-0 border-b border-[var(--color-border)] px-6 py-5 text-start">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-lg font-bold">
              {form.reportType === 'component_injection' ? 'إنشاء تقرير مكون حقن' : 'إنشاء تقرير إنتاج'}
            </DialogTitle>
            <button
              type="button"
              onClick={closeModal}
              className="text-[var(--color-text-muted)] transition-colors hover:text-slate-600"
              aria-label="إغلاق"
            >
              <X size={20} />
            </button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
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
          {canChooseReportType ? (
            <div className="space-y-2">
              <Label className="block text-sm font-bold text-[var(--color-text-muted)]">نوع التقرير</Label>
              <Select
                value={form.reportType}
                onValueChange={(v) => {
                  const nextType = v === 'component_injection' ? 'component_injection' : 'finished_product';
                  setForm((prev) => ({ ...prev, reportType: nextType, workOrderId: '' }));
                }}
              >
                <SelectTrigger
                  className={cn(
                    fieldInputClass,
                    'h-auto min-h-10 border bg-[var(--color-card)] py-3 font-bold',
                  )}
                >
                  <SelectValue placeholder="نوع التقرير" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availableReportTypes.includes('finished_product') ? (
                    <SelectItem value="finished_product">تقرير إنتاج عادي</SelectItem>
                  ) : null}
                  {availableReportTypes.includes('component_injection') ? (
                    <SelectItem value="component_injection">تقرير مكون حقن</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label className="block text-sm font-bold text-[var(--color-text-muted)]">أمر شغل (اختياري)</Label>
            <Select
              value={form.workOrderId ? form.workOrderId : WORK_ORDER_NONE}
              onValueChange={(value) => {
                if (value === WORK_ORDER_NONE) {
                  setForm((prev) => ({ ...prev, workOrderId: '' }));
                  return;
                }
                const wo = activeWorkOrders.find((w) => w.id === value);
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
              <SelectTrigger
                className={cn(
                  fieldInputClass,
                  'h-auto min-h-10 border bg-[var(--color-card)] py-3 font-bold',
                )}
              >
                <SelectValue placeholder="اختر أمر شغل لتعبئة البيانات تلقائياً" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value={WORK_ORDER_NONE}>اختر أمر شغل لتعبئة البيانات تلقائياً</SelectItem>
                {activeWorkOrders.map((wo) => (
                  <SelectItem key={wo.id} value={wo.id!}>
                    {`${productNameById.get(wo.productId) ?? 'منتج غير معروف'} — المتبقي: ${Math.max(0, Number(wo.quantity || 0) - Number(wo.producedQuantity || 0))} وحدة`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="block text-sm font-bold text-[var(--color-text-muted)]">التاريخ *</Label>
              <Input
                type="date"
                className={cn(fieldInputClass, 'h-auto border bg-[var(--color-card)] py-3')}
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="block text-sm font-bold text-[var(--color-text-muted)]">المشرف *</Label>
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
              <Label className="block text-sm font-bold text-[var(--color-text-muted)]">
                {form.reportType === 'component_injection' ? 'الخط *' : 'خط الإنتاج *'}
              </Label>
              <SearchableSelect
                placeholder="اختر الخط"
                options={selectableLines.map((l) => ({ value: l.id!, label: l.name }))}
                value={form.lineId}
                onChange={(v) => setForm((prev) => ({ ...prev, lineId: v, workOrderId: '' }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="block text-sm font-bold text-[var(--color-text-muted)]">
                {form.reportType === 'component_injection' ? 'اسم المكون *' : 'المنتج *'}
              </Label>
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
              <Label className="block text-sm font-bold text-[var(--color-text-muted)]">الكمية المنتجة *</Label>
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
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">هالك المكونات</Label>
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
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">هالك المكونات</Label>
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
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">إجمالي العمالة</Label>
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
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">ساعات العمل *</Label>
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
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">إجمالي العمالة *</Label>
                <input
                  type="number"
                  readOnly
                  className="w-full border border-[var(--color-border)] bg-[#f0f2f5]/70 rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-black text-primary"
                  value={workersTotal || ''}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة إنتاج</Label>
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
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة تغليف</Label>
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
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة جودة</Label>
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
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة صيانة</Label>
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
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة خارجية</Label>
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
                <Label className="block text-sm font-bold text-[var(--color-text-muted)]">ساعات العمل *</Label>
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
            <Label className="block text-sm font-bold text-[var(--color-text-muted)]">ملحوظة</Label>
            <textarea
              rows={3}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all resize-y"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="اكتب أي ملاحظة إضافية للتقرير..."
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4">
          <Button variant="outline" onClick={closeModal}>
            إلغاء
          </Button>
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
      </DialogContent>
    </Dialog>
  );
};

