import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, Info, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button, SearchableSelect } from '../../../modules/production/components/UI';
import { ComponentScrapModal } from '../../../modules/production/components/ComponentScrapModal';
import { useAppStore } from '../../../store/useAppStore';
import { getOperationalDateString } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { getReportDuplicateMessage } from '../../../modules/production/utils/reportDuplicateError';
import { resolveReportType, workOrderMatchesReportType } from '../../../modules/production/utils/reportTypes';
import { canonicalPackagingLine } from '../../../modules/production/utils/packagingLine';
import { cn } from '@/lib/utils';
import { hideZeroForInput } from '@/lib/inputDisplayValue';
import { catalogRawMaterialService } from '../../../modules/catalog/services/catalogRawMaterialService';
import { ProductionLineStatus, type PackagingReportLine, type ReportComponentScrapItem } from '../../../types';
import { useTranslation } from 'react-i18next';

type ReportFormState = {
  reportType: 'finished_product' | 'component_injection' | 'packaging';
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
  packagingLines: PackagingReportLine[];
};

type FeedbackState = {
  text: string;
  type: 'success' | 'error';
};

const newEmptyPackagingLine = (): PackagingReportLine => ({
  productId: '',
  quantityPieces: 0,
  quantityCartons: 0,
  remainderPieces: 0,
});

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
  packagingLines: [],
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
  const { t } = useTranslation();
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.REPORTS_CREATE);
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
  const [componentScrapModalOpen, setComponentScrapModalOpen] = useState(false);
  const [rawMaterialOptions, setRawMaterialOptions] = useState<Array<{ id: string; name: string; code: string; categoryName?: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [showErrorOverlay, setShowErrorOverlay] = useState(false);
  const injectionCategoryTokens = useMemo(
    () => parseInjectionCategoryTokens(injectionCategoryKeywords),
    [injectionCategoryKeywords],
  );

  const canCreateFinishedReportsBase = can('reports.create');
  const canCreatePackagingReports = can('reports.create') || can('reports.packaging.create');
  const forcePackagingOnly = can('reports.packaging.only');
  const forceInjectionOnly = can('reports.componentInjection.only') && !canCreateFinishedReportsBase;
  const canCreateFinishedReports = canCreateFinishedReportsBase && !forceInjectionOnly;
  const canManageComponentInjectionReports = can('reports.componentInjection.manage') || forceInjectionOnly;
  const isComponentEntryLocked = payload?.reportType === 'component_injection';
  const availableReportTypes = useMemo<Array<ReportFormState['reportType']>>(() => {
    if (isComponentEntryLocked) return ['component_injection'];
    if (forcePackagingOnly) return ['packaging'];
    const types: Array<ReportFormState['reportType']> = [];
    if (canCreateFinishedReports) types.push('finished_product');
    if (canManageComponentInjectionReports) types.push('component_injection');
    if (canCreatePackagingReports) types.push('packaging');
    return types;
  }, [isComponentEntryLocked, forcePackagingOnly, canCreateFinishedReports, canManageComponentInjectionReports, canCreatePackagingReports]);
  const canChooseReportType = availableReportTypes.length > 1;

  const currentEmployee = useMemo(
    () => rawEmployees.find((e) => e.userId === uid) ?? null,
    [rawEmployees, uid],
  );
  const isSupervisorReporter = currentEmployee?.level === 2;
  const shouldLockEmployeeToCurrent = Boolean(currentEmployee?.id)
    && (isSupervisorReporter || forceInjectionOnly || forcePackagingOnly);

  const activeWorkOrders = useMemo(
    () =>
      workOrders.filter((w) => {
        if (w.status !== 'pending' && w.status !== 'in_progress') return false;
        if (!workOrderMatchesReportType(w, resolveReportType(form.reportType))) return false;
        if (!shouldLockEmployeeToCurrent || !currentEmployee?.id) return true;
        return w.supervisorId === currentEmployee.id;
      }),
    [workOrders, shouldLockEmployeeToCurrent, currentEmployee?.id, form.reportType],
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
    : form.reportType === 'packaging'
      ? Number(form.workersCount || 0)
      : workersTotal;
  const isPackagingLineForm = useMemo(
    () => lines.some((l) => l.id === form.lineId && l.isPackagingLine),
    [lines, form.lineId],
  );
  const packagingLaborOptional = form.reportType === 'packaging'
    || (form.reportType === 'finished_product' && isPackagingLineForm);
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

  const selectableLines = useMemo(() => {
    if (form.reportType === 'component_injection') {
      return lines.filter((line) => line.id && injectionLineIds.has(line.id));
    }
    if (form.reportType === 'packaging') {
      return lines.filter((line) => line.id && line.isPackagingLine);
    }
    return lines;
  }, [form.reportType, lines, injectionLineIds]);

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
  const getUnitsPerCarton = useCallback((productId: string) => {
    const n = Math.floor(Number(products.find((p) => p.id === productId)?.unitsPerCarton ?? 0));
    return n > 0 ? n : undefined;
  }, [products]);

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((product) => {
      if (!product.id) return;
      map.set(product.id, product.name || t('modalManager.createReport.unknownProduct'));
    });
    return map;
  }, [products, t]);

  useEffect(() => {
    if (!isOpen || !shouldLockEmployeeToCurrent || !currentEmployee?.id) return;
    setForm((prev) => (
      prev.employeeId === currentEmployee.id
        ? prev
        : { ...prev, employeeId: currentEmployee.id }
    ));
  }, [isOpen, shouldLockEmployeeToCurrent, currentEmployee?.id, form.reportType]);

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
    if (form.reportType !== 'packaging') return;
    if (form.lineId && !lines.some((l) => l.id === form.lineId && l.isPackagingLine)) {
      setForm((prev) => ({ ...prev, lineId: '', workOrderId: '' }));
    }
  }, [form.reportType, form.lineId, lines]);

  useEffect(() => {
    if (!isOpen || form.reportType !== 'packaging') return;
    const valid = Boolean(form.lineId) && selectableLines.some((l) => l.id === form.lineId);
    if (valid) return;
    if (selectableLines.length !== 1) return;
    const only = selectableLines[0];
    if (!only?.id) return;
    setForm((prev) => ({ ...prev, lineId: only.id! }));
  }, [isOpen, form.reportType, form.lineId, selectableLines]);

  useEffect(() => {
    if (!isOpen) return;
    const requestedType: ReportFormState['reportType'] =
      payload?.reportType === 'component_injection'
        ? 'component_injection'
        : payload?.reportType === 'packaging'
          ? 'packaging'
          : 'finished_product';

    const initialType = availableReportTypes.includes(requestedType)
      ? requestedType
      : (availableReportTypes[0] ?? 'finished_product');

    setForm((prev) => (
      prev.reportType === initialType
        ? prev
        : {
          ...prev,
          reportType: initialType,
          workOrderId: '',
          lineId: '',
          packagingLines: initialType === 'packaging' ? [newEmptyPackagingLine()] : [],
        }
    ));
  }, [isOpen, payload?.reportType, availableReportTypes]);

  useEffect(() => {
    if (!isOpen) setComponentScrapModalOpen(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || form.reportType !== 'packaging') return;
    setForm((prev) => (
      (prev.packagingLines && prev.packagingLines.length > 0)
        ? prev
        : { ...prev, packagingLines: [newEmptyPackagingLine()] }
    ));
  }, [isOpen, form.reportType]);

  if (!isOpen) return null;
  if (!canCreateFinishedReports && !can('reports.edit') && !canManageComponentInjectionReports && !can('reports.packaging.create')) return null;

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
    if (forcePackagingOnly && form.reportType !== 'packaging') {
      openErrorOverlay(t('modalManager.createReport.packagingOnlyUser'));
      return;
    }
    if (form.reportType === 'packaging' && !canCreatePackagingReports) {
      openErrorOverlay(t('modalManager.createReport.packagingPermissionDenied'));
      return;
    }
    if (form.reportType === 'finished_product' && forceInjectionOnly) {
      openErrorOverlay(t('modalManager.createReport.injectionOnlyUser'));
      return;
    }
    if (form.reportType === 'component_injection' && !canManageComponentInjectionReports) {
      openErrorOverlay(t('modalManager.createReport.injectionPermissionDenied'));
      return;
    }
    const workersRequired = requiresWorkers && effectiveWorkersCount <= 0 && !packagingLaborOptional;
    const validPackagingLines = (form.packagingLines || [])
      .map((l) => canonicalPackagingLine(l, getUnitsPerCarton))
      .map(({ productId, quantityPieces }) => ({ productId, quantityPieces }))
      .filter((l) => l.productId && l.quantityPieces > 0);
    const packagingLinesOk = form.reportType !== 'packaging' || validPackagingLines.length > 0;
    const baseFieldsOk = form.reportType === 'packaging'
      ? Boolean(form.lineId && form.employeeId && form.workHours && packagingLinesOk)
      : Boolean(form.lineId && form.productId && form.employeeId && form.quantityProduced && form.workHours);
    if (!baseFieldsOk || workersRequired) {
      openErrorOverlay(
        form.reportType === 'packaging' && !packagingLinesOk
          ? t('modalManager.createReport.completeRequiredFieldsPackagingMulti')
          : requiresWorkers
            ? (packagingLaborOptional
              ? t('modalManager.createReport.completeRequiredFieldsPackaging')
              : t('modalManager.createReport.completeRequiredFields'))
            : t('modalManager.createReport.completeRequiredFieldsInjection'),
      );
      return;
    }
    setSaving(true);
    setFeedback(null);
    setShowErrorOverlay(false);
    try {
      const payload = form.reportType === 'packaging' && validPackagingLines.length > 0
        ? {
          ...form,
          workersCount: effectiveWorkersCount,
          packagingLines: validPackagingLines,
          productId: validPackagingLines[0].productId,
          quantityProduced: validPackagingLines.reduce((s, l) => s + l.quantityPieces, 0),
        }
        : { ...form, workersCount: effectiveWorkersCount };
      const created = await createReport(payload);
      if (!created) {
        const storeError = useAppStore.getState().error;
        openErrorOverlay(getReportDuplicateMessage(storeError, t('modalManager.createReport.saveError')));
        return;
      }
      setFeedback({ text: t('modalManager.createReport.saveSuccess'), type: 'success' });
      setForm(emptyForm());
    } catch (error) {
      const errorMessage = getReportDuplicateMessage(error, t('modalManager.createReport.saveError'));
      openErrorOverlay(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
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
                <h4 className="text-base font-extrabold text-rose-700">{t('modalManager.createReport.saveFailedTitle')}</h4>
              </div>
              <p className="text-sm font-bold text-[var(--color-text)]">{feedback.text}</p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={closeErrorOverlay}>{t('modalManager.createReport.closeAlert')}</Button>
                <Button variant="danger" onClick={clearFormAndCloseError}>
                  <Trash2 size={14} />
                  {t('modalManager.createReport.clearData')}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold">
            {form.reportType === 'component_injection'
              ? t('modalManager.createReport.createInjectionTitle')
              : form.reportType === 'packaging'
                ? t('modalManager.createReport.createPackagingTitle')
                : t('modalManager.createReport.createProductionTitle')}
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
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.reportType')}</label>
              <select
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-bold transition-all"
                value={form.reportType}
                onChange={(e) => {
                  const v = e.target.value;
                  const nextType: ReportFormState['reportType'] = v === 'component_injection'
                    ? 'component_injection'
                    : v === 'packaging'
                      ? 'packaging'
                      : 'finished_product';
                  if (!availableReportTypes.includes(nextType)) return;
                  setForm((prev) => ({
                    ...prev,
                    reportType: nextType,
                    workOrderId: '',
                    lineId: '',
                    packagingLines: nextType === 'packaging' ? [newEmptyPackagingLine()] : [],
                  }));
                }}
              >
                {availableReportTypes.includes('finished_product') && (
                  <option value="finished_product">{t('modalManager.createReport.reportTypeFinished')}</option>
                )}
                {availableReportTypes.includes('component_injection') && (
                  <option value="component_injection">{t('modalManager.createReport.reportTypeInjection')}</option>
                )}
                {availableReportTypes.includes('packaging') && (
                  <option value="packaging">{t('modalManager.createReport.reportTypePackaging')}</option>
                )}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.workOrderOptional')}</label>
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
                  employeeId: shouldLockEmployeeToCurrent && currentEmployee?.id ? currentEmployee.id : wo.supervisorId,
                  packagingLines: prev.reportType === 'packaging'
                    ? [{ ...newEmptyPackagingLine(), productId: wo.productId }]
                    : prev.packagingLines,
                }));
              }}
            >
              <option value="">{t('modalManager.createReport.selectWorkOrder')}</option>
              {activeWorkOrders.map((wo) => (
                <option key={wo.id} value={wo.id!}>
                  {`${productNameById.get(wo.productId) ?? t('modalManager.createReport.unknownProduct')} — ${t('modalManager.createReport.remaining')}: ${Math.max(0, Number(wo.quantity || 0) - Number(wo.producedQuantity || 0))} ${t('modalManager.createReport.units')}`}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.dateRequired')}</label>
              <input
                type="date"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                {form.reportType === 'packaging'
                  ? t('modalManager.createReport.packagingSupervisorRequired')
                  : t('modalManager.createReport.supervisorRequired')}
              </label>
              {shouldLockEmployeeToCurrent && currentEmployee ? (
                <input
                  type="text"
                  readOnly
                  value={currentEmployee.name}
                  className="w-full border border-[var(--color-border)] bg-[#f0f2f5]/70 rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-bold text-[var(--color-text-muted)]"
                />
              ) : (
                <SearchableSelect
                  placeholder={t('modalManager.createReport.selectSupervisor')}
                  options={employees.filter((s) => s.level === 2).map((s) => ({ value: s.id, label: s.name }))}
                  value={form.employeeId}
                  onChange={(v) => setForm((prev) => ({ ...prev, employeeId: v }))}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`space-y-2 ${form.reportType === 'packaging' ? 'sm:col-span-2' : ''}`}>
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                {form.reportType === 'component_injection'
                  ? t('modalManager.createReport.lineRequired')
                  : (form.reportType === 'packaging' || isPackagingLineForm
                    ? t('modalManager.createReport.packagingLineRequired')
                    : t('modalManager.createReport.productionLineRequired'))}
              </label>
              <SearchableSelect
                placeholder={t('modalManager.createReport.selectLine')}
                options={selectableLines.map((l) => ({
                  value: l.id!,
                  label: l.isPackagingLine ? `${l.name} (${t('modalManager.createReport.packagingLineTag')})` : l.name,
                }))}
                value={form.lineId}
                onChange={(v) => setForm((prev) => ({ ...prev, lineId: v, workOrderId: '' }))}
              />
            </div>
            {form.reportType !== 'packaging' && (
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                  {form.reportType === 'component_injection' ? t('modalManager.createReport.componentNameRequired') : t('modalManager.createReport.productRequired')}
                </label>
                <SearchableSelect
                  placeholder={form.reportType === 'component_injection' ? t('modalManager.createReport.selectComponent') : t('modalManager.createReport.selectProduct')}
                  options={selectableProducts}
                  value={form.productId}
                  onChange={(v) => setForm((prev) => ({ ...prev, productId: v, workOrderId: '' }))}
                />
              </div>
            )}
          </div>

          {form.reportType === 'packaging' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                    {t('modalManager.createReport.packagingProductsPacked')}
                  </label>
                  <p className="text-[11px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                    {t('modalManager.createReport.packagingAddRowExplainer')}
                  </p>
                  <p className="text-[11px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                    {t('modalManager.createReport.packagingQuantityModeRule')}
                  </p>
                </div>
                <button
                  type="button"
                  title={t('modalManager.createReport.packagingAddProductButtonTitle')}
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    packagingLines: [...(prev.packagingLines || []), newEmptyPackagingLine()],
                  }))}
                  className="shrink-0 inline-flex items-center gap-1 rounded-[var(--border-radius-lg)] border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                >
                  <Plus size={14} aria-hidden />
                  {t('modalManager.createReport.packagingAddProduct')}
                </button>
              </div>
              {(form.packagingLines || []).map((row, idx) => {
                const hasProduct = Boolean(String(row.productId || '').trim());
                const upc = hasProduct
                  ? Math.floor(Number(getUnitsPerCarton(row.productId) ?? 0))
                  : 0;
                const cartonMode = upc > 0;
                const productSpan = !hasProduct
                  ? 'sm:col-span-6'
                  : cartonMode
                    ? (upc > 1 ? 'sm:col-span-5' : 'sm:col-span-6')
                    : 'sm:col-span-6';
                const cartonSpan = upc > 1 ? 'sm:col-span-3' : 'sm:col-span-4';
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:items-end rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 bg-[#f8f9fa]/40"
                  >
                    <div className={cn('space-y-2', productSpan)}>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.productRequired')}</label>
                      <SearchableSelect
                        placeholder={t('modalManager.createReport.selectProduct')}
                        options={selectableProducts}
                        value={row.productId}
                        onChange={(v) => {
                          setForm((prev) => {
                            const next = [...(prev.packagingLines || [])];
                            next[idx] = { ...newEmptyPackagingLine(), productId: v };
                            return { ...prev, packagingLines: next };
                          });
                        }}
                      />
                    </div>
                    {!hasProduct ? (
                      <div className="sm:col-span-4 space-y-2">
                        <label className="block text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.packagingQuantityLabel')}</label>
                        <p className="text-[10px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                          {t('modalManager.createReport.packagingSelectProductFirstHint')}
                        </p>
                      </div>
                    ) : cartonMode ? (
                      <>
                        <div className={cn('space-y-2', cartonSpan)}>
                          <label className="block text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.packagingCartons')}</label>
                          <p className="text-[10px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                            {t('modalManager.createReport.packagingCartonRowHint', { units: upc })}
                          </p>
                          <input
                            type="number"
                            min={0}
                            className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                            value={hideZeroForInput(row.quantityCartons ?? 0) as number | string}
                            onChange={(e) => {
                              setForm((prev) => {
                                const next = [...(prev.packagingLines || [])];
                                const raw = e.target.value === '' ? 0 : Number(e.target.value);
                                next[idx] = {
                                  ...next[idx],
                                  quantityCartons: Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0)),
                                };
                                return { ...prev, packagingLines: next };
                              });
                            }}
                            placeholder="0"
                          />
                        </div>
                        {upc > 1 ? (
                          <div className="sm:col-span-2 space-y-2">
                            <label className="block text-xs font-bold text-[var(--color-text-muted)]">
                              {t('modalManager.createReport.packagingRemainderHint', { max: upc - 1 })}
                            </label>
                            <p className="text-[10px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                              {t('modalManager.createReport.packagingRemainderRowHint')}
                            </p>
                            <input
                              type="number"
                              min={0}
                              max={upc - 1}
                              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                              value={hideZeroForInput(row.remainderPieces ?? 0) as number | string}
                              onChange={(e) => {
                                setForm((prev) => {
                                  const next = [...(prev.packagingLines || [])];
                                  const num = e.target.value === '' ? 0 : Number(e.target.value);
                                  const raw = Math.floor(num);
                                  const rem = Math.max(0, Math.min(upc - 1, Number.isFinite(raw) ? raw : 0));
                                  next[idx] = { ...next[idx], remainderPieces: rem };
                                  return { ...prev, packagingLines: next };
                                });
                              }}
                              placeholder="0"
                            />
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="sm:col-span-4 space-y-2">
                        <label className="block text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.packagingPiecesRowLabel')} *</label>
                        <p className="text-[10px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                          {t('modalManager.createReport.packagingPiecesOnlyRowHint')}
                        </p>
                        <input
                          type="number"
                          min={0}
                          className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                          value={row.quantityPieces || ''}
                          onChange={(e) => {
                            setForm((prev) => {
                              const next = [...(prev.packagingLines || [])];
                              next[idx] = { ...next[idx], quantityPieces: Number(e.target.value) };
                              return { ...prev, packagingLines: next };
                            });
                          }}
                          placeholder="0"
                        />
                      </div>
                    )}
                    <div className="sm:col-span-2 flex sm:justify-end">
                      <button
                        type="button"
                        disabled={(form.packagingLines || []).length <= 1}
                        className="text-sm font-bold text-rose-600 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1"
                        onClick={() => setForm((prev) => ({
                          ...prev,
                          packagingLines: (prev.packagingLines || []).filter((_, i) => i !== idx),
                        }))}
                      >
                        {t('modalManager.createReport.packagingDeleteRow')}
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-center border-t border-[var(--color-border)] pt-3 mt-1">
                <button
                  type="button"
                  title={t('modalManager.createReport.packagingAddProductButtonTitle')}
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    packagingLines: [...(prev.packagingLines || []), newEmptyPackagingLine()],
                  }))}
                  className="inline-flex items-center gap-1 rounded-[var(--border-radius-lg)] border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                >
                  <Plus size={14} aria-hidden />
                  {t('modalManager.createReport.packagingAddProduct')}
                </button>
              </div>
              <p className="text-[11px] font-semibold text-[var(--color-text-muted)] leading-relaxed">
                {t('modalManager.createReport.packagingLinesHint')}
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                {isPackagingLineForm && form.reportType === 'finished_product'
                  ? t('modalManager.createReport.packagedQuantityRequired')
                  : t('modalManager.createReport.producedQuantityRequired')}
              </label>
              <input
                type="number"
                min={0}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.quantityProduced || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, quantityProduced: Number(e.target.value) }))}
                placeholder="0"
              />
              {(isPackagingLineForm && form.reportType === 'finished_product') ? (
                <p className="text-[11px] font-semibold text-[var(--color-text-muted)] leading-relaxed">
                  {t('modalManager.createReport.packagingLineReportHint')}
                </p>
              ) : null}
            </div>
            {form.reportType === 'component_injection' ? (
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.componentScrap')}</label>
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
                        componentScrapItems: [{ materialId: '__total__', materialName: t('modalManager.createReport.componentScrapName'), quantity: qty }],
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
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.componentScrap')}</label>
                <button
                  type="button"
                  onClick={() => {
                    if (!form.productId) return;
                    setComponentScrapModalOpen(true);
                  }}
                  disabled={!form.productId}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] bg-[#f8f9fa] hover:bg-[#f0f2f5] disabled:opacity-60 disabled:cursor-not-allowed text-sm p-3.5 outline-none font-bold transition-all flex items-center justify-between gap-2"
                >
                  <span className="truncate text-right">
                    {totalComponentScrapQty > 0
                      ? t('modalManager.createReport.totalScrap', { value: totalComponentScrapQty })
                      : (form.productId ? t('modalManager.createReport.defineComponentScrap') : t('modalManager.createReport.selectProductFirst'))}
                  </span>
                  <ExternalLink size={16} />
                </button>
              </div>
            )}
          </div>
          )}

          {form.reportType === 'component_injection' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.totalWorkers')}</label>
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
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.workHoursRequired')}</label>
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
          ) : (isPackagingLineForm || form.reportType === 'packaging') ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {form.reportType === 'packaging' && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.packagingTotalWorkersOptional')}</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.workersCount || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, workersCount: Number(e.target.value) }))}
                    placeholder="0"
                  />
                </div>
              )}
              <div className={`space-y-2 ${form.reportType === 'packaging' ? '' : 'sm:col-span-2'}`}>
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.workHoursRequired')}</label>
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
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.totalWorkersRequired')}</label>
                <input
                  type="number"
                  readOnly
                  className="w-full border border-[var(--color-border)] bg-[#f0f2f5]/70 rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-black text-primary"
                  value={workersTotal || ''}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.productionWorkers')}</label>
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
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.packagingWorkers')}</label>
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
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.qualityWorkers')}</label>
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
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.maintenanceWorkers')}</label>
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
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.externalWorkers')}</label>
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
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.workHoursRequired')}</label>
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
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createReport.note')}</label>
            <textarea
              rows={3}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all resize-y"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder={t('modalManager.createReport.notePlaceholder')}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={closeModal}>{t('ui.cancel')}</Button>
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
              || (
                form.reportType !== 'component_injection'
                && effectiveWorkersCount <= 0
                && !packagingLaborOptional
              )
            }
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Plus size={14} />
            {t('modalManager.createReport.saveReport')}
          </Button>
        </div>
      </div>
    </div>
    <ComponentScrapModal
      open={componentScrapModalOpen}
      onClose={() => setComponentScrapModalOpen(false)}
      productId={form.productId}
      initialItems={form.componentScrapItems}
      onSave={(items) => setForm((prev) => ({ ...prev, componentScrapItems: items }))}
    />
    </>
  );
};

