import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { Plus } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, SearchableSelect } from '../components/UI';
import { usePermission } from '../../../utils/permissions';
import {
  exportAsImage,
  exportToPDF,
  getShareResultFeedbackMessage,
  waitForExportPaint,
  ShareResult,
} from '../../../utils/reportExport';
import { formatProductionReportShareCaption } from '../../../utils/productionReportShareCaption';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import {
  buildWorkersCountAutoFillFromAssignments,
  countOperatorsFromAssignments,
  shouldApplyWorkersCountAutoFill,
  sumWorkersCountPatch,
} from '../utils/lineAssignmentWorkersCount';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import { formatNumber, getOperationalDateString } from '../../../utils/calculations';
import {
  buildShareStandardVarianceBanner,
  computeProductionReportStandardQtyVariance,
} from '../../../utils/productionReportStandardVariance';
import type { LineWorkerAssignment, PackagingReportLine, ProductionReport, ProductionReportShift, ProductionReportWorkerOutput, ReportComponentScrapItem } from '../../../types';
import { resolveReportType, workOrderMatchesReportType } from '../utils/reportTypes';
import {
  INJECTION_SHIFT_OPTIONS,
  isInjectionShiftSelected,
} from '../utils/injectionReportShift';
import { canonicalPackagingLine, effectivePackagingPieces, isPackagingLineId } from '../utils/packagingLine';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS, ProductionLineStatus } from '../../../types';
import {
  SingleReportPrint,
  ReportPrintRow,
  buildPackagingPrintLinesFromReport,
} from '../components/ProductionReportPrint';
import { ProductionReportShareCard } from '../components/ProductionReportShareCard';
import { ReportWorkerOutputsSection } from '../components/ReportWorkerOutputsSection';
import { reportService } from '../services/reportService';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { getReportDuplicateMessage } from '../utils/reportDuplicateError';
import { PageHeader } from '../../../components/PageHeader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { hideZeroForInput } from '@/lib/inputDisplayValue';
import {
  isInjectionCategory,
  parseInjectionCategoryTokens,
} from '../utils/injectionMaterialFilter';
import { showAppToast } from '@/src/shared/ui/feedback/appToast';

const newEmptyPackagingLine = (): PackagingReportLine => ({
  productId: '',
  quantityPieces: 0,
  quantityCartons: 0,
  remainderPieces: 0,
});

const QUICK_ACTION_DRAFT_VERSION = 1;
const quickActionStorageKey = (tenantId?: string, uid?: string | null) =>
  `production.quickAction.v${QUICK_ACTION_DRAFT_VERSION}.${tenantId || 'tenant'}.${uid || 'user'}`;

type QuickActionFormDraft = {
  employeeId: string;
  lineId: string;
  productId: string;
  reportType: NonNullable<ProductionReport['reportType']>;
  quantity: string;
  workersProduction: string;
  workersPackaging: string;
  workersQuality: string;
  workersMaintenance: string;
  workersExternal: string;
  injectionWorkersCount: string;
  injectionShift: ProductionReportShift | '';
  packagingWorkersCount: string;
  packagingLines: PackagingReportLine[];
  hours: string;
  notes: string;
  componentScrapItems: ReportComponentScrapItem[];
  selectedWorkOrderId: string;
  workerOutputs: ProductionReportWorkerOutput[];
};

type QuickActionSavedShareDraft = {
  printReport: ReportPrintRow;
  productId: string;
  lineId: string;
  reportType: NonNullable<ProductionReport['reportType']>;
  savedAt: number;
};

type QuickActionStoredState = {
  form?: QuickActionFormDraft;
  savedShare?: QuickActionSavedShareDraft;
};

const readQuickActionStoredState = (key: string): QuickActionStoredState => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as QuickActionStoredState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeQuickActionStoredState = (key: string, state: QuickActionStoredState) => {
  if (typeof window === 'undefined') return;
  try {
    if (!state.form && !state.savedShare) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private mode; never block report entry.
  }
};

const isQuickActionFormDraftEmpty = (draft: QuickActionFormDraft) => (
  !draft.lineId
  && !draft.productId
  && !draft.quantity
  && !draft.workersProduction
  && !draft.workersPackaging
  && !draft.workersQuality
  && !draft.workersMaintenance
  && !draft.workersExternal
  && !draft.injectionWorkersCount
  && !draft.injectionShift
  && !draft.packagingWorkersCount
  && draft.packagingLines.every((line) => (
    !String(line.productId || '').trim()
    && Number(line.quantityPieces || 0) <= 0
    && Number(line.quantityCartons || 0) <= 0
    && Number(line.remainderPieces || 0) <= 0
  ))
  && !draft.hours
  && !draft.notes.trim()
  && draft.componentScrapItems.length === 0
  && !draft.selectedWorkOrderId
  && draft.workerOutputs.every((row) => Number(row.outputQty || 0) <= 0 && !row.notes?.trim())
);

export const QuickAction: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const createReport = useAppStore((s) => s.createReport);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const lineStatuses = useAppStore((s) => s.lineStatuses);
  const employees = useAppStore((s) => s.employees);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const tenantId = useAppStore((s) => s.userProfile?.tenantId);
  const saveErrorFromStore = useAppStore((s) => s.error);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const injectionCategoryKeywords = useAppStore((s) => s.systemSettings.planSettings.injectionRawMaterialCategoryKeywords);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const routingVarianceBasisSecondsByProduct = useAppStore((s) => s.routingVarianceBasisSecondsByProduct);
  const routingPlanTargetUnitSecondsByProduct = useAppStore((s) => s.routingTargetUnitSecondsByProduct);
  const routingProductTargetUnitSecondsByProduct = useAppStore((s) => s.routingProductTargetUnitSecondsByProduct);
  const productionWorkerSettings = useAppStore(
    (s) => s.systemSettings.productionWorkerSettings ?? DEFAULT_PRODUCTION_WORKER_SETTINGS,
  );

  const [employeeId, setEmployeeId] = useState('');
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [reportType, setReportType] = useState<NonNullable<ProductionReport['reportType']>>('finished_product');
  const [quantity, setQuantity] = useState('');
  const [workersProduction, setWorkersProduction] = useState('');
  const [workersPackaging, setWorkersPackaging] = useState('');
  const [workersQuality, setWorkersQuality] = useState('');
  const [workersMaintenance, setWorkersMaintenance] = useState('');
  const [workersExternal, setWorkersExternal] = useState('');
  const [injectionWorkersCount, setInjectionWorkersCount] = useState('');
  const [injectionShift, setInjectionShift] = useState<ProductionReportShift | ''>('');
  const [packagingWorkersCount, setPackagingWorkersCount] = useState('');
  const [packagingLines, setPackagingLines] = useState<PackagingReportLine[]>([]);
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');
  const [componentScrapItems, setComponentScrapItems] = useState<ReportComponentScrapItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printReport, setPrintReport] = useState<ReportPrintRow | null>(null);
  const [shareCardRow, setShareCardRow] = useState<ReportPrintRow | null>(null);
  const [sharingImage, setSharingImage] = useState(false);
  const [lineWorkers, setLineWorkers] = useState<LineWorkerAssignment[]>([]);
  const [assignedLineIds, setAssignedLineIds] = useState<Set<string>>(new Set());
  const [supervisorLinesLoaded, setSupervisorLinesLoaded] = useState(false);
  const [showLineWorkers, setShowLineWorkers] = useState(false);
  const [loadingWorkersCount, setLoadingWorkersCount] = useState(false);
  const [workerPickerId, setWorkerPickerId] = useState('');
  const [workerActionBusy, setWorkerActionBusy] = useState(false);
  const [workerActionError, setWorkerActionError] = useState<string | null>(null);
  const [rawMaterialOptions, setRawMaterialOptions] = useState<Array<{ id: string; name: string; code: string; categoryName?: string }>>([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');
  const [workerOutputs, setWorkerOutputs] = useState<ProductionReportWorkerOutput[]>([]);

  const printRef = useRef<HTMLDivElement>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  /** Prevents duplicate WhatsApp image sharing from rapid taps before React re-disables the button. */
  const shareWhatsAppLockRef = useRef(false);
  const lastAutoFilledWorkersCountRef = useRef<number | null>(null);
  const restoredStorageKeyRef = useRef<string | null>(null);
  const didShowDraftToastRef = useRef(false);

  const [today, setToday] = useState(() => getOperationalDateString(8));
  const storageKey = useMemo(() => quickActionStorageKey(tenantId, uid), [tenantId, uid]);
  const canCreateFinishedReportsBase = can('reports.create');
  const canCreatePackagingReports = can('reports.create') || can('reports.packaging.create');
  const forcePackagingOnly = can('reports.packaging.only');
  const canManageComponentInjectionReports = can('reports.componentInjection.manage') || can('reports.componentInjection.only');
  const forceInjectionOnly = can('reports.componentInjection.only') && !canCreateFinishedReportsBase;
  const canCreateFinishedReports = canCreateFinishedReportsBase && !forceInjectionOnly;
  const injectionCategoryTokens = useMemo(
    () => parseInjectionCategoryTokens(injectionCategoryKeywords),
    [injectionCategoryKeywords],
  );

  const availableReportTypes = useMemo((): NonNullable<ProductionReport['reportType']>[] => {
    if (forcePackagingOnly) return ['packaging'];
    const list: NonNullable<ProductionReport['reportType']>[] = [];
    if (canCreateFinishedReports) list.push('finished_product');
    if (canManageComponentInjectionReports) list.push('component_injection');
    if (canCreatePackagingReports) list.push('packaging');
    return list;
  }, [forcePackagingOnly, canCreateFinishedReports, canManageComponentInjectionReports, canCreatePackagingReports]);
  const canChooseReportType = availableReportTypes.length > 1;

  const applyFormDraft = useCallback((draft: QuickActionFormDraft) => {
    const nextReportType = availableReportTypes.includes(draft.reportType)
      ? draft.reportType
      : (availableReportTypes[0] ?? 'finished_product');
    setEmployeeId(draft.employeeId);
    setLineId(draft.lineId);
    setProductId(draft.productId);
    setReportType(nextReportType);
    setQuantity(draft.quantity);
    setWorkersProduction(draft.workersProduction);
    setWorkersPackaging(draft.workersPackaging);
    setWorkersQuality(draft.workersQuality);
    setWorkersMaintenance(draft.workersMaintenance);
    setWorkersExternal(draft.workersExternal);
    setInjectionWorkersCount(draft.injectionWorkersCount);
    setInjectionShift(draft.injectionShift);
    setPackagingWorkersCount(draft.packagingWorkersCount);
    setPackagingLines(draft.packagingLines);
    setHours(draft.hours);
    setNotes(draft.notes);
    setComponentScrapItems(draft.componentScrapItems);
    setSelectedWorkOrderId(draft.selectedWorkOrderId);
    setWorkerOutputs(draft.workerOutputs);
  }, [availableReportTypes]);

  const clearQuickActionStorage = useCallback(() => {
    writeQuickActionStoredState(storageKey, {});
  }, [storageKey]);

  useEffect(() => {
    if (restoredStorageKeyRef.current === storageKey) return;
    if (availableReportTypes.length === 0) return;

    const stored = readQuickActionStoredState(storageKey);
    const savedShare = stored.savedShare;
    if (savedShare?.printReport && availableReportTypes.includes(savedShare.reportType)) {
      setProductId(savedShare.productId);
      setLineId(savedShare.lineId);
      setReportType(savedShare.reportType);
      setPrintReport(savedShare.printReport);
      setSaved(true);
      restoredStorageKeyRef.current = storageKey;
      return;
    }

    if (stored.form && !isQuickActionFormDraftEmpty(stored.form)) {
      applyFormDraft(stored.form);
      restoredStorageKeyRef.current = storageKey;
      if (!didShowDraftToastRef.current) {
        didShowDraftToastRef.current = true;
        showAppToast('info', 'تم استعادة آخر مسودة في الإدخال السريع', { duration: 5000 });
      }
      return;
    }

    restoredStorageKeyRef.current = storageKey;
  }, [applyFormDraft, availableReportTypes, storageKey]);

  useEffect(() => {
    if (restoredStorageKeyRef.current !== storageKey) return;

    const draft: QuickActionFormDraft = {
      employeeId,
      lineId,
      productId,
      reportType,
      quantity,
      workersProduction,
      workersPackaging,
      workersQuality,
      workersMaintenance,
      workersExternal,
      injectionWorkersCount,
      injectionShift,
      packagingWorkersCount,
      packagingLines,
      hours,
      notes,
      componentScrapItems,
      selectedWorkOrderId,
      workerOutputs,
    };

    const nextState: QuickActionStoredState = {};
    if (saved && printReport) {
      nextState.savedShare = {
        printReport,
        productId,
        lineId,
        reportType,
        savedAt: Date.now(),
      };
    } else if (!isQuickActionFormDraftEmpty(draft)) {
      nextState.form = draft;
    }
    writeQuickActionStoredState(storageKey, nextState);
  }, [
    storageKey,
    saved,
    printReport,
    employeeId,
    lineId,
    productId,
    reportType,
    quantity,
    workersProduction,
    workersPackaging,
    workersQuality,
    workersMaintenance,
    workersExternal,
    injectionWorkersCount,
    injectionShift,
    packagingWorkersCount,
    packagingLines,
    hours,
    notes,
    componentScrapItems,
    selectedWorkOrderId,
    workerOutputs,
  ]);

  useEffect(() => {
    if (availableReportTypes.length === 0) return;
    if (availableReportTypes.includes(reportType)) return;
    setReportType(availableReportTypes[0]);
  }, [availableReportTypes, reportType]);

  useEffect(() => {
    if (!forceInjectionOnly) return;
    if (reportType === 'component_injection') return;
    setReportType('component_injection');
    setSelectedWorkOrderId('');
  }, [forceInjectionOnly, reportType]);

  useEffect(() => {
    if (!forcePackagingOnly) return;
    if (reportType === 'packaging') return;
    setReportType('packaging');
    setSelectedWorkOrderId('');
    setLineId('');
    setProductId('');
    setPackagingWorkersCount('');
    setPackagingLines([newEmptyPackagingLine()]);
  }, [forcePackagingOnly, reportType]);

  useEffect(() => {
    if (reportType !== 'packaging') {
      setPackagingLines([]);
      return;
    }
    setPackagingLines((prev) => (prev.length > 0 ? prev : [newEmptyPackagingLine()]));
  }, [reportType]);

  useEffect(() => {
    let mounted = true;
    rawMaterialService.getAll().then((list) => {
      if (!mounted) return;
      setRawMaterialOptions(
        list
          .filter((m) => m.id && m.isActive !== false)
          .map((m) => ({
            id: m.id!,
            name: m.name,
            code: m.code || '',
            categoryName: String(m.categoryName || '').trim(),
          }))
      );
    }).catch(() => {
      if (mounted) setRawMaterialOptions([]);
    });
    return () => { mounted = false; };
  }, []);

  const injectionLineIds = useMemo(() => {
    const ids = new Set<string>();
    _rawLines.forEach((line) => {
      if (line.id && line.status === ProductionLineStatus.INJECTION) ids.add(line.id);
    });
    lineStatuses.forEach((status) => {
      if (status.isInjectionLine && status.lineId) ids.add(status.lineId);
    });
    return ids;
  }, [_rawLines, lineStatuses]);

  const injectionRawMaterialOptions = useMemo(
    () => rawMaterialOptions.filter((row) => isInjectionCategory(row.categoryName, injectionCategoryTokens)),
    [rawMaterialOptions, injectionCategoryTokens],
  );

  const selectableProducts = useMemo(() => (
    reportType === 'component_injection'
      ? injectionRawMaterialOptions.map((m) => ({ value: m.id, label: m.code ? `${m.name} (${m.code})` : m.name }))
      : _rawProducts.map((p) => ({ value: p.id!, label: p.name }))
  ), [reportType, injectionRawMaterialOptions, _rawProducts]);

  useEffect(() => {
    if (reportType !== 'component_injection') return;
    if (_rawLines.length === 0 && lineStatuses.length === 0) return;
    if (lineId && !injectionLineIds.has(lineId)) setLineId('');
  }, [reportType, lineId, injectionLineIds, _rawLines.length, lineStatuses.length]);

  useEffect(() => {
    if (reportType !== 'component_injection' || !productId) return;
    const isAllowed = injectionRawMaterialOptions.some((item) => item.id === productId);
    if (isAllowed) return;
    setProductId('');
  }, [reportType, productId, injectionRawMaterialOptions]);

  useEffect(() => {
    const syncOperationalDate = () => {
      const next = getOperationalDateString(8);
      setToday((prev) => (prev === next ? prev : next));
    };
    syncOperationalDate();
    const timer = window.setInterval(syncOperationalDate, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchWorkersFromLineAssignments = useCallback(async () => {
    if (!lineId) {
      setLineWorkers([]);
      return;
    }
    setLoadingWorkersCount(true);
    try {
      const list = await lineAssignmentService.getByLineAndDate(lineId, today);
      setLineWorkers(list);
    } catch {
      // Keep current manual value if fetch fails.
    } finally {
      setLoadingWorkersCount(false);
    }
  }, [lineId, today]);

  useEffect(() => {
    fetchWorkersFromLineAssignments();
  }, [fetchWorkersFromLineAssignments]);

  useEffect(() => {
    lastAutoFilledWorkersCountRef.current = null;
  }, [lineId, today, reportType]);

  const workersTotal = useMemo(() => (
    (Number(workersProduction) || 0)
    + (Number(workersPackaging) || 0)
    + (Number(workersQuality) || 0)
    + (Number(workersMaintenance) || 0)
    + (Number(workersExternal) || 0)
  ), [workersProduction, workersPackaging, workersQuality, workersMaintenance, workersExternal]);

  useEffect(() => {
    if (!lineId) return;

    const patch = buildWorkersCountAutoFillFromAssignments(
      lineWorkers,
      {
        reportType: reportType === 'packaging'
          ? 'packaging'
          : reportType === 'component_injection'
            ? 'component_injection'
            : 'finished_product',
        isPackagingLine: isPackagingLineId(lineId, _rawLines),
      },
      employeeId,
    );
    if (Object.keys(patch).length === 0) return;

    const currentTotal = reportType === 'component_injection'
      ? Number(injectionWorkersCount || 0)
      : reportType === 'packaging'
        ? Number(packagingWorkersCount || 0)
        : workersTotal;

    if (!shouldApplyWorkersCountAutoFill(currentTotal, lastAutoFilledWorkersCountRef.current)) {
      return;
    }

    lastAutoFilledWorkersCountRef.current = sumWorkersCountPatch(patch);

    if (patch.workersCount !== undefined) {
      const value = String(patch.workersCount);
      if (reportType === 'component_injection') setInjectionWorkersCount(value);
      else if (reportType === 'packaging') setPackagingWorkersCount(value);
    }
    if (patch.workersProductionCount !== undefined) {
      setWorkersProduction(String(patch.workersProductionCount));
      setWorkersPackaging(String(patch.workersPackagingCount || 0));
      setWorkersQuality(String(patch.workersQualityCount || 0));
      setWorkersMaintenance(String(patch.workersMaintenanceCount || 0));
      setWorkersExternal(String(patch.workersExternalCount || 0));
    } else if (patch.workersPackagingCount !== undefined) {
      setWorkersPackaging(String(patch.workersPackagingCount));
    }
  }, [
    lineId,
    today,
    reportType,
    lineWorkers,
    employeeId,
    _rawLines,
    workersTotal,
    injectionWorkersCount,
    packagingWorkersCount,
  ]);

  const packagingLaborOptionalQuick = useMemo(
    () => reportType === 'packaging' || (reportType === 'finished_product' && isPackagingLineId(lineId, _rawLines)),
    [reportType, lineId, _rawLines],
  );
  const getUnitsPerCarton = useCallback((productId: string) => {
    const n = Number(_rawProducts.find((p) => p.id === productId)?.unitsPerCarton ?? 0);
    return n > 0 ? n : undefined;
  }, [_rawProducts]);
  const packagingFormValid = useMemo(() => {
    if (reportType !== 'packaging') return true;
    return (packagingLines || []).some(
      (l) => String(l?.productId || '').trim() && effectivePackagingPieces(l, getUnitsPerCarton) > 0,
    );
  }, [reportType, packagingLines, getUnitsPerCarton]);

  const getLineName = useCallback(
    (id: string) => _rawLines.find((l) => l.id === id)?.name ?? '—',
    [_rawLines]
  );
  const getProductName = useCallback(
    (id: string) => {
      if (reportType === 'component_injection') return rawMaterialOptions.find((m) => m.id === id)?.name ?? '—';
      return _rawProducts.find((p) => p.id === id)?.name ?? '—';
    },
    [_rawProducts, rawMaterialOptions, reportType]
  );
  const getProductNameForPrint = useCallback(
    (id: string, rt?: ProductionReport['reportType']) => {
      if (rt === 'component_injection') return rawMaterialOptions.find((m) => m.id === id)?.name ?? '—';
      return _rawProducts.find((p) => p.id === id)?.name ?? '—';
    },
    [_rawProducts, rawMaterialOptions],
  );
  const getEmployeeName = useCallback(
    (id: string) => employees.find((s) => s.id === id)?.name ?? '—',
    [employees]
  );
  const assignableEmployees = useMemo(
    () => employees.filter((e) => e.isActive),
    [employees],
  );

  const addableWorkerOptions = useMemo(
    () => assignableEmployees
      .filter((e) => !lineWorkers.some((w) => w.employeeId === e.id))
      .map((e) => ({
        value: e.id,
        label: e.code ? `${e.name} (${e.code})` : e.name,
      })),
    [assignableEmployees, lineWorkers],
  );

  const currentEmployee = useMemo(
    () => _rawEmployees.find((e) => e.userId === uid) ?? null,
    [_rawEmployees, uid],
  );
  const isSupervisorReporter = currentEmployee?.level === 2;
  const shouldLockEmployeeToCurrent = Boolean(currentEmployee?.id)
    && (isSupervisorReporter || forceInjectionOnly || forcePackagingOnly);

  useEffect(() => {
    let mounted = true;
    if (!isSupervisorReporter || !currentEmployee?.id) {
      setAssignedLineIds(new Set());
      setSupervisorLinesLoaded(true);
      return () => { mounted = false; };
    }
    setSupervisorLinesLoaded(false);
    supervisorLineAssignmentService.getActiveByDate(today)
      .then((rows) => {
        if (!mounted) return;
        const ids = new Set(
          rows
            .filter((row) => String(row.supervisorId || '').trim() === currentEmployee.id)
            .map((row) => String(row.lineId || '').trim())
            .filter(Boolean),
        );
        setAssignedLineIds(ids);
        setSupervisorLinesLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setAssignedLineIds(new Set());
        setSupervisorLinesLoaded(true);
      });
    return () => { mounted = false; };
  }, [isSupervisorReporter, currentEmployee?.id, today]);

  const allowedLinesForUser = useMemo(
    () => (
      isSupervisorReporter
        ? _rawLines.filter((line) => Boolean(line.id) && assignedLineIds.has(String(line.id)))
        : _rawLines
    ),
    [_rawLines, isSupervisorReporter, assignedLineIds],
  );

  const selectableLines = useMemo(() => {
    if (reportType === 'component_injection') {
      return allowedLinesForUser.filter((line) => line.id && injectionLineIds.has(line.id));
    }
    if (reportType === 'packaging') {
      return allowedLinesForUser.filter((line) => line.id && line.isPackagingLine);
    }
    return allowedLinesForUser;
  }, [reportType, allowedLinesForUser, injectionLineIds]);

  useEffect(() => {
    if (reportType !== 'packaging') return;
    if (_rawLines.length === 0) return;
    if (lineId && !isPackagingLineId(lineId, _rawLines)) {
      setLineId('');
      setSelectedWorkOrderId('');
    }
  }, [reportType, lineId, _rawLines]);

  useEffect(() => {
    if (reportType !== 'packaging') return;
    const valid = Boolean(lineId) && selectableLines.some((l) => l.id === lineId);
    if (valid) return;
    if (selectableLines.length !== 1) return;
    const only = selectableLines[0];
    if (!only?.id) return;
    setLineId(only.id);
  }, [reportType, lineId, selectableLines]);

  useEffect(() => {
    if (!shouldLockEmployeeToCurrent || !currentEmployee?.id) return;
    setEmployeeId((prev) => (prev === currentEmployee.id ? prev : currentEmployee.id));
  }, [shouldLockEmployeeToCurrent, currentEmployee?.id, reportType]);

  useEffect(() => {
    if (!lineId) return;
    if (_rawLines.length === 0) return;
    if (isSupervisorReporter && !supervisorLinesLoaded) return;
    if (allowedLinesForUser.some((line) => line.id === lineId)) return;
    setLineId('');
    setSelectedWorkOrderId('');
  }, [lineId, allowedLinesForUser, _rawLines.length, isSupervisorReporter, supervisorLinesLoaded]);

  const handleQuickAddWorker = useCallback(async () => {
    if (!lineId || !workerPickerId) return;
    const selected = assignableEmployees.find((e) => e.id === workerPickerId);
    if (!selected) return;

    setWorkerActionBusy(true);
    setWorkerActionError(null);
    try {
      const dayAssignments = await lineAssignmentService.getByDate(today);
      const sameLine = dayAssignments.find((a) => a.employeeId === selected.id && a.lineId === lineId);
      if (sameLine) {
        setWorkerActionError('العامل مسجل بالفعل على هذا الخط اليوم.');
        return;
      }
      const otherLine = dayAssignments.find((a) => a.employeeId === selected.id && a.lineId !== lineId);
      if (otherLine) {
        setWorkerActionError(`العامل مسجل على خط آخر اليوم (${getLineName(otherLine.lineId)}).`);
        return;
      }

      await lineAssignmentService.create({
        lineId,
        employeeId: selected.id,
        employeeCode: selected.code ?? '',
        employeeName: selected.name,
        date: today,
        assignedBy: uid || '',
      });
      setWorkerPickerId('');
      await fetchWorkersFromLineAssignments();
    } catch {
      setWorkerActionError('تعذر إضافة العامل الآن. حاول مرة أخرى.');
    } finally {
      setWorkerActionBusy(false);
    }
  }, [assignableEmployees, fetchWorkersFromLineAssignments, getLineName, lineId, today, uid, workerPickerId]);

  const handleQuickRemoveWorker = useCallback(async (assignmentId?: string) => {
    if (!assignmentId) return;
    setWorkerActionBusy(true);
    setWorkerActionError(null);
    try {
      await lineAssignmentService.delete(assignmentId);
      await fetchWorkersFromLineAssignments();
    } catch {
      setWorkerActionError('تعذر حذف العامل الآن. حاول مرة أخرى.');
    } finally {
      setWorkerActionBusy(false);
    }
  }, [fetchWorkersFromLineAssignments]);

  const handleSave = async () => {
    const requiresWorkers = reportType !== 'component_injection';
    const canSaveCurrentType = reportType === 'component_injection'
      ? canManageComponentInjectionReports
      : reportType === 'packaging'
        ? canCreatePackagingReports
        : canCreateFinishedReports;
    if (!canSaveCurrentType) return;
    const validPackagingLines = (packagingLines || [])
      .map((l) => canonicalPackagingLine(l, getUnitsPerCarton))
      .map(({ productId, quantityPieces }) => ({ productId, quantityPieces }))
      .filter((l) => l.productId && l.quantityPieces > 0);
    if (!lineId || !employeeId) {
      showAppToast('error', 'أكمل بيانات الخط والمشرف أولاً.');
      return;
    }
    if (reportType === 'packaging') {
      if (validPackagingLines.length === 0) {
        showAppToast('error', 'أضف سطر منتج واحد على الأقل بكمية صحيحة (كراتين إن وُجد حجم كرتونة للمنتج، وإلا قطع).');
        return;
      }
    } else if (!productId) {
      showAppToast('error', 'أكمل بيانات الخط والمنتج والمشرف أولاً.');
      return;
    }
    if (reportType === 'component_injection' && !isInjectionShiftSelected(injectionShift)) {
      showAppToast('error', 'اختر الوردية (صباحي أو مسائي) قبل الحفظ');
      return;
    }
    if (Number(hours || 0) <= 0) {
      showAppToast('error', 'أكمل ساعات العمل.');
      return;
    }
    if (reportType !== 'packaging' && Number(quantity || 0) <= 0) {
      showAppToast('error', 'أكمل الحقول الإلزامية أولاً (الكمية وساعات العمل).');
      return;
    }
    if (requiresWorkers && workersTotal <= 0 && !packagingLaborOptionalQuick) {
      showAppToast('error', 'أكمل الحقول الإلزامية أولاً (الكمية، تفاصيل العمالة، وساعات العمل).');
      return;
    }
    const workerOutputTotal = workerOutputs.reduce((sum, row) => sum + Number(row.outputQty || 0), 0);
    if (
      productionWorkerSettings.performance.productionWorkerOutputMustMatchReportQty
      && reportType === 'finished_product'
      && Number(quantity || 0) > 0
      && workerOutputs.length > 0
      && workerOutputTotal !== Number(quantity)
    ) {
      showAppToast('error', 'مجموع إنتاج العمال يجب أن يطابق كمية التقرير');
      return;
    }
    setSaving(true);

    const data = {
      employeeId,
      lineId,
      productId: reportType === 'packaging' ? validPackagingLines[0].productId : productId,
      reportType,
      date: today,
      quantityProduced: reportType === 'packaging'
        ? validPackagingLines.reduce((s, l) => s + l.quantityPieces, 0)
        : Number(quantity),
      ...(reportType === 'packaging' ? { packagingLines: validPackagingLines } : {}),
      workersCount:
        reportType === 'component_injection'
          ? (Number(injectionWorkersCount) || 0)
          : reportType === 'packaging'
            ? (Number(packagingWorkersCount) || 0)
            : workersTotal,
      workersProductionCount: reportType === 'finished_product' ? (Number(workersProduction) || 0) : 0,
      workersPackagingCount: reportType === 'finished_product' ? (Number(workersPackaging) || 0) : 0,
      workersQualityCount: reportType === 'finished_product' ? (Number(workersQuality) || 0) : 0,
      workersMaintenanceCount: reportType === 'finished_product' ? (Number(workersMaintenance) || 0) : 0,
      workersExternalCount: reportType === 'finished_product' ? (Number(workersExternal) || 0) : 0,
      workHours: Number(hours),
      notes: notes.trim(),
      componentScrapItems: reportType === 'packaging' ? [] : componentScrapItems,
      ...(reportType === 'component_injection' && isInjectionShiftSelected(injectionShift)
        ? { shift: injectionShift }
        : {}),
      ...(reportType === 'finished_product' && workerOutputs.length > 0 ? { workerOutputs } : {}),
    };

    const id = await createReport(data);

    if (id) {
      if (reportType === 'packaging') {
        setProductId(validPackagingLines[0].productId);
      }
      const saved = await reportService.getById(id);
      const packagingPrintLines = reportType === 'packaging'
        ? buildPackagingPrintLinesFromReport(
          {
            ...data,
            id: typeof id === 'string' ? id : undefined,
            reportType: 'packaging',
          } as ProductionReport,
          { getProductName: getProductNameForPrint, getUnitsPerCarton },
        )
        : undefined;
      const row: ReportPrintRow = {
        reportId: id,
        reportCode: saved?.reportCode,
        date: today,
        sourceReportType: resolveReportType(reportType),
        shift: reportType === 'component_injection' && isInjectionShiftSelected(injectionShift)
          ? injectionShift
          : undefined,
        lineName: getLineName(lineId),
        productName: getProductName(reportType === 'packaging' ? validPackagingLines[0].productId : productId),
        employeeName: getEmployeeName(employeeId),
        quantityProduced: data.quantityProduced,
        wasteQuantity: totalComponentScrapQty,
        workersCount: data.workersCount,
        workersProductionCount: data.workersProductionCount,
        workersPackagingCount: data.workersPackagingCount,
        workersQualityCount: data.workersQualityCount,
        workersMaintenanceCount: data.workersMaintenanceCount,
        workersExternalCount: data.workersExternalCount,
        workHours: data.workHours,
        notes: data.notes,
        packagingPrintLines,
      };
      setPrintReport(row);
      setSaved(true);
      writeQuickActionStoredState(storageKey, {
        savedShare: {
          printReport: row,
          productId: reportType === 'packaging' ? validPackagingLines[0].productId : productId,
          lineId,
          reportType,
          savedAt: Date.now(),
        },
      });
      showAppToast('success', 'تم حفظ التقرير بنجاح');
    } else {
      showAppToast('error', getReportDuplicateMessage(saveErrorFromStore, 'تعذر حفظ التقرير'));
    }
    setSaving(false);
  };

  const handleReset = () => {
    setEmployeeId(shouldLockEmployeeToCurrent && currentEmployee?.id ? currentEmployee.id : '');
    setLineId('');
    setProductId('');
    setReportType(
      forcePackagingOnly
        ? 'packaging'
        : (availableReportTypes.includes('finished_product')
          ? 'finished_product'
          : (availableReportTypes[0] ?? 'finished_product'))
    );
    setQuantity('');
    setWorkersProduction('');
    setWorkersPackaging('');
    setWorkersQuality('');
    setWorkersMaintenance('');
    setWorkersExternal('');
    setInjectionWorkersCount('');
    setInjectionShift('');
    setPackagingWorkersCount('');
    setPackagingLines(forcePackagingOnly ? [newEmptyPackagingLine()] : []);
    setHours('');
    setNotes('');
    setComponentScrapItems([]);
    setWorkerOutputs([]);
    setSaved(false);
    setPrintReport(null);
    setShareCardRow(null);
    clearQuickActionStorage();
  };

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      await waitForExportPaint(150);
      await exportToPDF(printRef.current, `تقرير-سريع-${today}`, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: printTemplate?.copies,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportImage = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      await waitForExportPaint(150);
      await exportAsImage(printRef.current, `تقرير-سريع-${today}`);
    } finally {
      setExporting(false);
    }
  };

  const showShareFeedback = (result: ShareResult) => {
    const msg = getShareResultFeedbackMessage(result, { downloadEntityLabel: 'التقرير' });
    if (!msg) return;
    showAppToast('info', msg, { duration: 8000 });
  };

  const reportNumberOf = (report: ReportPrintRow) =>
    report.reportCode?.trim()
      || (report.reportId ? `RPT-${report.reportId.slice(-6).toUpperCase()}` : 'RPT-NA');

  const handleShareWhatsApp = async () => {
    if (!printReport) return;
    if (shareWhatsAppLockRef.current) return;
    shareWhatsAppLockRef.current = true;
    setExporting(true);
    setSharingImage(true);
    const packagingShareMulti = printReport.sourceReportType === 'packaging'
      && (printReport.packagingPrintLines?.length ?? 0) > 1;
    const variance = computeProductionReportStandardQtyVariance({
      productId,
      lineId,
      quantityProduced: printReport.quantityProduced,
      workersCount: printReport.workersCount,
      workHours: printReport.workHours,
      lineProductConfigs,
      routingVarianceBasisSecondsByProduct,
      routingPlanTargetUnitSecondsByProduct,
      routingProductTargetUnitSecondsByProduct,
    });
    const rowForShare: ReportPrintRow = {
      ...printReport,
      ...(printReport.sourceReportType === 'packaging' ? { packagingShareImage: true } : {}),
      ...(!packagingShareMulti
        ? { shareStandardVariance: buildShareStandardVarianceBanner(variance) }
        : {}),
    };
    const caption = formatProductionReportShareCaption(rowForShare, printTemplate);
    const reportNumber = reportNumberOf(rowForShare);
    writeQuickActionStoredState(storageKey, {
      savedShare: {
        printReport,
        productId,
        lineId,
        reportType,
        savedAt: Date.now(),
      },
    });
    flushSync(() => {
      setShareCardRow(rowForShare);
    });
    try {
      if (!shareCardRef.current) {
        showAppToast('error', 'تعذر تجهيز صورة التقرير للمشاركة. حاول مرة أخرى.', { duration: 8000 });
        return;
      }
      const { captureNodeAndShareToWhatsApp } = await import('@/src/shared/utils/exportNodeToImage');
      const result = await captureNodeAndShareToWhatsApp(
        shareCardRef.current,
        `production-report-${reportNumber}`,
        { caption },
      );
      showShareFeedback(result);
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };
      if (err?.name !== 'AbortError') {
        showAppToast('error',
          err?.message === 'capture_timeout'
            ? 'استغرق تجهيز الصورة وقتاً طويلاً. حاول مرة أخرى.'
            : 'تعذر تجهيز صورة التقرير للمشاركة. حاول مرة أخرى.',
          { duration: 8000 },
        );
      }
    } finally {
      shareWhatsAppLockRef.current = false;
      setExporting(false);
      setSharingImage(false);
      setShareCardRow(null);
    }
  };

  const workOrders = useAppStore((s) => s.workOrders);
  const activeEmployees = employees.filter((s) => s.isActive && s.level === 2);
  const activeWOs = useMemo(
    () => {
      const activeOnly = workOrders.filter((w) => w.status === 'pending' || w.status === 'in_progress');
      if (!shouldLockEmployeeToCurrent || !currentEmployee?.id) return activeOnly;

      const currentName = (currentEmployee.name || '').trim().toLowerCase();
      return activeOnly.filter((w) => {
        if (w.supervisorId === currentEmployee.id) return true;
        return (w.supervisorId || '').trim().toLowerCase() === currentName;
      });
    },
    [workOrders, shouldLockEmployeeToCurrent, currentEmployee?.id, currentEmployee?.name],
  );

  const scopedActiveWOs = useMemo(() => {
    const selectedSupervisorId = shouldLockEmployeeToCurrent ? currentEmployee?.id : employeeId;
    const bySupervisor = !selectedSupervisorId
      ? activeWOs
      : activeWOs.filter(
        (wo) => String(wo.supervisorId || '').trim().toLowerCase() === String(selectedSupervisorId).trim().toLowerCase(),
      );
    return bySupervisor.filter((wo) => workOrderMatchesReportType(wo, resolveReportType(reportType)));
  }, [activeWOs, shouldLockEmployeeToCurrent, currentEmployee?.id, employeeId, reportType]);

  const handleSelectWO = useCallback((woId: string) => {
    const wo = scopedActiveWOs.find((w) => w.id === woId);
    if (!wo) return;
    if (wo.workOrderType === 'component_injection') {
      if (canManageComponentInjectionReports) setReportType('component_injection');
    } else if (reportType === 'packaging') {
      setReportType('packaging');
    } else if (canCreateFinishedReports) {
      setReportType('finished_product');
    }
    setLineId(wo.lineId);
    setProductId(wo.productId);
    if (reportType === 'packaging') {
      setPackagingLines([{ ...newEmptyPackagingLine(), productId: wo.productId }]);
    }
    setEmployeeId(shouldLockEmployeeToCurrent && currentEmployee?.id ? currentEmployee.id : wo.supervisorId);
  }, [
    scopedActiveWOs,
    shouldLockEmployeeToCurrent,
    currentEmployee?.id,
    canManageComponentInjectionReports,
    canCreateFinishedReports,
    reportType,
  ]);

  useEffect(() => {
    if (!selectedWorkOrderId) return;
    if (scopedActiveWOs.some((wo) => wo.id === selectedWorkOrderId)) return;
    setSelectedWorkOrderId('');
  }, [selectedWorkOrderId, scopedActiveWOs]);

  const totalComponentScrapQty = useMemo(
    () => componentScrapItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [componentScrapItems],
  );

  return (
    <div className="erp-ds-clean space-y-6">
      <PageHeader
        title="إدخال سريع"
        subtitle="إدخال بيانات الإنتاج بسرعة — حفظ، تصدير ومشاركة."
        icon="bolt"
      />

      {forceInjectionOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
          <span className="material-icons-round text-amber-500">warning</span>
          <p className="text-sm font-bold text-amber-700">
            هذا المستخدم مخصص لتقارير الحقن فقط.
          </p>
        </div>
      )}
      {forcePackagingOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
          <span className="material-icons-round text-amber-500">warning</span>
          <p className="text-sm font-bold text-amber-700">
            هذا المستخدم مخصص لتقارير التغليف فقط.
          </p>
        </div>
      )}

      {!saved ? (
        <Card title="بيانات التقرير">
          {/* Work Order Selector */}
          {can('workOrders.view') && activeWOs.length > 0 && (
            <div className="mb-5">
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 flex items-center gap-1">
                <span className="material-icons-round text-sm text-primary">assignment</span>
                أمر شغل (اختياري)
              </label>
              <Select
                value={selectedWorkOrderId || 'none'}
                onValueChange={(value) => {
                  if (value === 'none') {
                    setSelectedWorkOrderId('');
                    return;
                  }
                  setSelectedWorkOrderId(value);
                  handleSelectWO(value);
                }}
              >
                <SelectTrigger className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm">
                  <SelectValue placeholder="اختر أمر شغل لتعبئة البيانات تلقائياً" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">اختر أمر شغل لتعبئة البيانات تلقائياً</SelectItem>
                  {scopedActiveWOs.map((wo) => {
                    const pName = _rawProducts.find((p) => p.id === wo.productId)?.name ?? '';
                    const lName = _rawLines.find((l) => l.id === wo.lineId)?.name ?? '';
                    const remaining = wo.quantity - (wo.producedQuantity || 0);
                    return (
                      <SelectItem key={wo.id} value={wo.id!}>
                        {wo.workOrderNumber} — {pName} — {lName} — متبقي: {formatNumber(remaining)} وحدة
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {scopedActiveWOs.length === 0 && (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  لا توجد أوامر شغل مرتبطة بالمشرف المختار.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {canChooseReportType && (
              <div className="sm:col-span-2">
                <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">نوع التقرير</label>
                <Select
                  value={reportType}
                  onValueChange={(value) => {
                    const nextType = resolveReportType(value as ProductionReport['reportType']);
                    if (!availableReportTypes.includes(nextType)) return;
                    if (nextType === 'component_injection' && !canManageComponentInjectionReports) return;
                    if (nextType === 'finished_product' && !canCreateFinishedReports) return;
                    if (nextType === 'packaging' && !canCreatePackagingReports) return;
                    setReportType(nextType);
                    setLineId('');
                    setProductId('');
                    setSelectedWorkOrderId('');
                    if (nextType === 'component_injection') {
                      setInjectionShift('');
                    }
                    if (nextType !== 'packaging') {
                      setPackagingWorkersCount('');
                      setPackagingLines([]);
                    } else {
                      setPackagingLines([newEmptyPackagingLine()]);
                    }
                  }}
                >
                  <SelectTrigger className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm">
                    <SelectValue placeholder="نوع التقرير" />
                  </SelectTrigger>
                  <SelectContent>
                    {canCreateFinishedReports && <SelectItem value="finished_product">تقرير إنتاج</SelectItem>}
                    {canManageComponentInjectionReports && <SelectItem value="component_injection">تقرير مكون حقن</SelectItem>}
                    {canCreatePackagingReports && <SelectItem value="packaging">تقرير تغليف</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">
                {reportType === 'packaging' ? 'مشرف التغليف *' : 'المشرف *'}
              </label>
              {shouldLockEmployeeToCurrent && currentEmployee ? (
                <input
                  type="text"
                  readOnly
                  value={currentEmployee.name}
                  className="w-full px-4 py-2.5 bg-[#f0f2f5]/70 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold text-[var(--color-text-muted)]"
                />
              ) : (
                <SearchableSelect
                  placeholder="اختر المشرف"
                  options={activeEmployees.map((s) => ({ value: s.id, label: s.name }))}
                  value={employeeId}
                  onChange={setEmployeeId}
                />
              )}
            </div>
            <div>
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">
                {reportType === 'component_injection' ? 'الخط *' : (reportType === 'packaging' ? 'خط التغليف *' : 'خط الإنتاج *')}
              </label>
              <SearchableSelect
                placeholder="اختر الخط"
                options={selectableLines.map((l) => ({ value: l.id!, label: l.name }))}
                value={lineId}
                onChange={setLineId}
              />
            </div>
            {reportType === 'component_injection' && (
              <div>
                <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">الوردية *</label>
                <Select
                  value={injectionShift || undefined}
                  onValueChange={(value) => setInjectionShift(value as ProductionReportShift)}
                >
                  <SelectTrigger className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm">
                    <SelectValue placeholder="اختر الوردية" />
                  </SelectTrigger>
                  <SelectContent>
                    {INJECTION_SHIFT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {reportType === 'packaging' ? (
              <div className="sm:col-span-2 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <label className="text-sm font-bold text-[var(--color-text-muted)]">المنتجات المغلفة</label>
                    <p className="text-[11px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                      نوع خانة الكمية يُحدَّد تلقائيًا من بطاقة المنتج: مع «قطع لكل كرتونة» يظهر الكراتين فقط؛ بدونها القطع فقط — دون خلط الاثنين في خانة واحدة.
                    </p>
                  </div>
                  <button
                    type="button"
                    title="إضافة صف منتج جديد. بعد اختيار المنتج تظهر خانة الكمية المناسبة تلقائيًا حسب بطاقة المنتج."
                    onClick={() => setPackagingLines((prev) => [...prev, newEmptyPackagingLine()])}
                    className="shrink-0 inline-flex items-center gap-1 rounded-[var(--border-radius-lg)] border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Plus size={14} aria-hidden />
                    إضافة منتج
                  </button>
                </div>
                {(packagingLines || []).map((row, idx) => {
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
                        <label className="text-xs font-bold text-[var(--color-text-muted)]">المنتج *</label>
                        <SearchableSelect
                          placeholder="اختر المنتج"
                          options={selectableProducts}
                          value={row.productId}
                          onChange={(v) => {
                            setPackagingLines((prev) => {
                              const next = [...prev];
                              next[idx] = { ...newEmptyPackagingLine(), productId: v };
                              return next;
                            });
                          }}
                        />
                      </div>
                      {!hasProduct ? (
                        <div className="sm:col-span-4 space-y-2">
                          <label className="text-xs font-bold text-[var(--color-text-muted)]">الكمية</label>
                          <p className="text-[10px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                            اختر المنتج أولًا. بعدها يظهر إما كراتين فقط أو قطع فقط حسب بطاقة المنتج — لا يُدخل الاثنان معًا في خانة واحدة.
                          </p>
                        </div>
                      ) : cartonMode ? (
                        <>
                          <div className={cn('space-y-2', cartonSpan)}>
                            <label className="text-xs font-bold text-[var(--color-text-muted)]">الكراتين *</label>
                            <p className="text-[10px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                              {`كل كرتونة = ${upc} قطعة — أدخل عدد الكراتين الكاملة هنا فقط.`}
                            </p>
                            <input
                              type="number"
                              min={0}
                              value={hideZeroForInput(row.quantityCartons ?? 0) as number | string}
                              onChange={(e) => {
                                setPackagingLines((prev) => {
                                  const next = [...prev];
                                  const raw = e.target.value === '' ? 0 : Number(e.target.value);
                                  next[idx] = {
                                    ...next[idx],
                                    quantityCartons: Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0)),
                                  };
                                  return next;
                                });
                              }}
                              className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                              placeholder="0"
                            />
                          </div>
                          {upc > 1 ? (
                            <div className="sm:col-span-2 space-y-2">
                              <label className="text-xs font-bold text-[var(--color-text-muted)]">
                                {`متبقي (قطع، حتى ${upc - 1})`}
                              </label>
                              <p className="text-[10px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                                أقل من كرتونة كاملة؛ تُجمع مع الكراتين.
                              </p>
                              <input
                                type="number"
                                min={0}
                                max={upc - 1}
                                value={hideZeroForInput(row.remainderPieces ?? 0) as number | string}
                                onChange={(e) => {
                                  setPackagingLines((prev) => {
                                    const next = [...prev];
                                    const num = e.target.value === '' ? 0 : Number(e.target.value);
                                    const raw = Math.floor(num);
                                    const rem = Math.max(0, Math.min(upc - 1, Number.isFinite(raw) ? raw : 0));
                                    next[idx] = { ...next[idx], remainderPieces: rem };
                                    return next;
                                  });
                                }}
                                className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                                placeholder="0"
                              />
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="sm:col-span-4 space-y-2">
                          <label className="text-xs font-bold text-[var(--color-text-muted)]">الكمية (قطعة) *</label>
                          <p className="text-[10px] font-medium leading-relaxed text-[var(--color-text-muted)]">
                            لا يوجد «قطع لكل كرتونة» في بطاقة هذا المنتج — أدخل إجمالي القطع فقط.
                          </p>
                          <input
                            type="number"
                            min={0}
                            value={row.quantityPieces || ''}
                            onChange={(e) => {
                              setPackagingLines((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], quantityPieces: Number(e.target.value) };
                                return next;
                              });
                            }}
                            className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                            placeholder="0"
                          />
                        </div>
                      )}
                      <div className="sm:col-span-2 flex sm:justify-end">
                        <button
                          type="button"
                          disabled={(packagingLines || []).length <= 1}
                          className="text-sm font-bold text-rose-600 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1"
                          onClick={() => setPackagingLines((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-center border-t border-[var(--color-border)] pt-3 mt-1">
                  <button
                    type="button"
                    title="إضافة صف منتج جديد. بعد اختيار المنتج تظهر خانة الكمية المناسبة تلقائيًا حسب بطاقة المنتج."
                    onClick={() => setPackagingLines((prev) => [...prev, newEmptyPackagingLine()])}
                    className="inline-flex items-center gap-1 rounded-[var(--border-radius-lg)] border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Plus size={14} aria-hidden />
                    إضافة منتج
                  </button>
                </div>
                <p className="text-[11px] font-semibold text-[var(--color-text-muted)] leading-relaxed">
                  سطر واحد على الأقل بكمية أكبر من صفر. لا يُخلط الكراتين مع القطع في خانة واحدة: يظهر نوع الإدخال تلقائيًا من بطاقة المنتج. يمكن تسجيل أكثر من تقرير تغليف لنفس المنتج في اليوم.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">{reportType === 'component_injection' ? 'اسم المكون *' : 'المنتج *'}</label>
                  <SearchableSelect
                    placeholder={reportType === 'component_injection' ? 'اختر المكون' : 'اختر المنتج'}
                    options={selectableProducts}
                    value={productId}
                    onChange={setProductId}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">الكمية المنتجة *</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                    placeholder="0"
                    min="0"
                  />
                </div>
              </>
            )}
            {reportType === 'component_injection' && (
            <div>
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">هالك المكونات</label>
              <input
                  type="number"
                  min="0"
                  value={totalComponentScrapQty || ''}
                  onChange={(e) => {
                    const qty = Number(e.target.value || 0);
                    if (qty > 0) {
                      setComponentScrapItems([{ materialId: '__total__', materialName: 'هالك مكونات', quantity: qty }]);
                      return;
                    }
                    setComponentScrapItems([]);
                  }}
                  className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                  placeholder="0"
                />
            </div>
            )}
            <div>
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">ساعات العمل *</label>
              <input
                type="number"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                placeholder="0"
                min="0"
                step="0.5"
              />
            </div>
            {reportType === 'component_injection' ? (
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">إجمالي العمالة</label>
              <input
                type="number"
                min="0"
                value={injectionWorkersCount}
                onChange={(e) => setInjectionWorkersCount(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                placeholder="0"
              />
            </div>
            ) : reportType === 'packaging' ? (
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">إجمالي العمالة (اختياري)</label>
              <input
                type="number"
                min="0"
                value={packagingWorkersCount}
                onChange={(e) => setPackagingWorkersCount(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                placeholder="0"
              />
            </div>
            ) : (
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-bold text-[var(--color-text-muted)] block">تفصيل العمالة </label>
                <button
                  type="button"
                  onClick={fetchWorkersFromLineAssignments}
                  disabled={!lineId || loadingWorkersCount}
                  className="text-xs font-bold text-primary hover:text-primary/80 disabled:text-slate-400 disabled:cursor-not-allowed inline-flex items-center gap-1"
                >
                  <span className={`material-icons-round text-sm ${loadingWorkersCount ? 'animate-spin' : ''}`}>
                    {loadingWorkersCount ? 'refresh' : 'sync'}
                  </span>
                  عرض عمالة الخط
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">الإجمالي *</label>
                  <input
                    type="number"
                    readOnly
                    value={workersTotal || ''}
                    className="w-full px-3 py-2.5 bg-[#f0f2f5]/70 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-black text-primary"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">إنتاج</label>
                  <input
                    type="number"
                    value={workersProduction}
                    onChange={(e) => setWorkersProduction(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">تغليف</label>
                  <input
                    type="number"
                    value={workersPackaging}
                    onChange={(e) => setWorkersPackaging(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">جودة</label>
                  <input
                    type="number"
                    value={workersQuality}
                    onChange={(e) => setWorkersQuality(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">صيانة</label>
                  <input
                    type="number"
                    value={workersMaintenance}
                    onChange={(e) => setWorkersMaintenance(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">خارجية</label>
                  <input
                    type="number"
                    value={workersExternal}
                    onChange={(e) => setWorkersExternal(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12"
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>
              {lineWorkers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLineWorkers(true)}
                  className="mt-1.5 text-xs text-primary font-bold hover:underline flex items-center gap-1"
                >
                  <span className="material-icons-round text-xs">groups</span>
                  {countOperatorsFromAssignments(lineWorkers, employeeId)} عامل مسجل على الخط — تم تعبئة العدد تلقائياً
                </button>
              )}
              {lineId && lineWorkers.length === 0 && (
                <p className="mt-1.5 text-[11px] text-slate-400">لا توجد عمالة مسجلة على هذا الخط اليوم.</p>
              )}
            </div>
            )}
            {reportType === 'finished_product'
              && lineId && productId
              && productionWorkerSettings.performance.productionWorkerOutputEnabled ? (
              <div className="md:col-span-2">
                <ReportWorkerOutputsSection
                  lineId={lineId}
                  productId={productId}
                  date={today}
                  lineName={getLineName(lineId)}
                  productName={getProductName(productId)}
                  products={_rawProducts}
                  reportQty={Number(quantity || 0)}
                  settings={productionWorkerSettings}
                  value={workerOutputs}
                  onChange={setWorkerOutputs}
                  disabled={saving}
                />
              </div>
            ) : reportType === 'finished_product' && lineId && productId ? (
              <div className="md:col-span-2 rounded-[var(--border-radius-lg)] border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4 space-y-2">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">إنتاج العمال غير مفعّل</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  لإظهار أسماء العمال وإدخال إنتاج كل عامل، فعّل
                  {' '}
                  <strong>«تفعيل إدخال إنتاج العمال في تقرير الإنتاج»</strong>
                  {' '}
                  من الإعدادات.
                </p>
                <button
                  type="button"
                  className="text-xs font-bold text-primary"
                  onClick={() => navigate('/settings')}
                >
                  فتح الإعدادات
                </button>
              </div>
            ) : null}
            <div className="md:col-span-2">
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">ملاحظات</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12 resize-y"
                placeholder="اكتب أي ملاحظات إضافية للتقرير..."
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap gap-3 mt-6 pt-4 border-t border-[var(--color-border)]">
            <Button
              onClick={handleSave}
              disabled={
                saving
                || !lineId
                || (reportType !== 'packaging' && !productId)
                || !employeeId
                || (reportType !== 'packaging' && !quantity)
                || (reportType === 'packaging' && !packagingFormValid)
                || (reportType !== 'component_injection' && !packagingLaborOptionalQuick && workersTotal <= 0)
                || !hours
                || (reportType === 'component_injection' && !isInjectionShiftSelected(injectionShift))
                || (reportType === 'component_injection'
                  ? !canManageComponentInjectionReports
                  : reportType === 'packaging'
                    ? !canCreatePackagingReports
                    : !canCreateFinishedReports)
              }
              className="w-full sm:w-auto"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <span className="material-icons-round text-lg">save</span>
                  حفظ
                </>
              )}
            </Button>
            {/* <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto">
              <span className="material-icons-round text-lg">refresh</span>
              مسح
            </Button> */}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Success Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-[var(--border-radius-lg)] px-5 py-4 flex items-center gap-3">
            <span className="material-icons-round text-emerald-500 text-2xl">check_circle</span>
            <div>
              <p className="font-bold text-emerald-700">تم حفظ التقرير بنجاح!</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-500">يمكنك الآن التصدير أو المشاركة.</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            {/* <Button variant="secondary" disabled={exporting} onClick={handleExportPDF} className="w-full sm:w-auto">
              {exporting ? (
                <span className="material-icons-round animate-spin text-sm">refresh</span>
              ) : (
                <span className="material-icons-round text-lg">picture_as_pdf</span>
              )}
              تصدير PDF
            </Button> */}
            <Button variant="secondary" disabled={exporting} onClick={handleExportImage} className="w-full sm:w-auto">
              <span className="material-icons-round text-lg">image</span>
              تصدير كصورة
            </Button>
            <Button variant="outline" disabled={exporting || sharingImage} onClick={handleShareWhatsApp} className="w-full sm:w-auto">
              <span className="material-icons-round text-lg">share</span>
              {sharingImage ? 'جاري تجهيز الصورة...' : 'مشاركة عبر WhatsApp'}
            </Button>
            <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto">
              <span className="material-icons-round text-lg">add</span>
              تقرير جديد
            </Button>
          </div>

          {/* Preview (visible on screen) */}
          {printReport && (
            <Card className="!p-0 overflow-hidden">
              <div className="px-5 py-3 bg-[#f8f9fa]/50 border-b border-[var(--color-border)] flex items-center gap-2">
                <span className="material-icons-round text-sm text-slate-400">visibility</span>
                <span className="text-xs font-bold text-slate-500">معاينة التقرير</span>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-blue-50 dark:bg-blue-900/10 rounded-[var(--border-radius-lg)] p-3 text-center border border-blue-100 dark:border-blue-900/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">خط الإنتاج</p>
                    <p className="text-sm font-bold text-blue-600">{printReport.lineName}</p>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-900/10 rounded-[var(--border-radius-lg)] p-3 text-center border border-violet-100 dark:border-violet-900/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">المنتج</p>
                    <p className="text-sm font-bold text-violet-600 dark:text-violet-400">{printReport.productName}</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-[var(--border-radius-lg)] p-3 text-center border border-emerald-100 dark:border-emerald-900/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">الكمية المنتجة</p>
                    <p className="text-sm font-bold text-emerald-600">{printReport.quantityProduced}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3 text-center border border-[var(--color-border)]">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">ملاحظات</p>
                    <p className="text-sm font-bold text-[var(--color-text)]">{printReport.employeeName}</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3 text-center border border-[var(--color-border)]">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">عدد العمال</p>
                    <p className="text-sm font-bold text-[var(--color-text)]">{printReport.workersCount}</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3 text-center border border-[var(--color-border)]">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">ساعات العمل</p>
                    <p className="text-sm font-bold text-[var(--color-text)]">{printReport.workHours}</p>
                  </div>
                </div>
                {reportType !== 'component_injection' && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3 text-center border border-[var(--color-border)]">
                      <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">إنتاج</p>
                      <p className="text-sm font-bold text-[var(--color-text)]">{printReport.workersProductionCount || 0}</p>
                    </div>
                    <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3 text-center border border-[var(--color-border)]">
                      <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">تغليف</p>
                      <p className="text-sm font-bold text-[var(--color-text)]">{printReport.workersPackagingCount || 0}</p>
                    </div>
                    <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3 text-center border border-[var(--color-border)]">
                      <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">جودة</p>
                      <p className="text-sm font-bold text-[var(--color-text)]">{printReport.workersQualityCount || 0}</p>
                    </div>
                    <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3 text-center border border-[var(--color-border)]">
                      <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">صيانة</p>
                      <p className="text-sm font-bold text-[var(--color-text)]">{printReport.workersMaintenanceCount || 0}</p>
                    </div>
                    <div className="bg-[#f8f9fa] rounded-[var(--border-radius-lg)] p-3 text-center border border-[var(--color-border)]">
                      <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">خارجية</p>
                      <p className="text-sm font-bold text-[var(--color-text)]">{printReport.workersExternalCount || 0}</p>
                    </div>
                  </div>
                )}
                {printReport.notes?.trim() && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 rounded-[var(--border-radius-lg)] p-3 border border-amber-100 dark:border-amber-900/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">ملاحظات</p>
                    <p className="text-sm font-medium text-[var(--color-text)]">{printReport.notes}</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Line Workers Modal */}
      {showLineWorkers && lineId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowLineWorkers(false)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md max-h-[80vh] border border-[var(--color-border)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-primary">groups</span>
                <h3 className="font-bold">عمالة {getLineName(lineId)} اليوم</h3>
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-[var(--border-radius-base)]">{lineWorkers.length}</span>
              </div>
              <button onClick={() => setShowLineWorkers(false)} className="text-[var(--color-text-muted)] hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-4 border-b border-[var(--color-border)] space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="w-full sm:flex-1">
                  <SearchableSelect
                    placeholder="ابحث عن عامل للإضافة السريعة"
                    options={addableWorkerOptions}
                    value={workerPickerId}
                    onChange={setWorkerPickerId}
                  />
                </div>
                <Button
                  onClick={handleQuickAddWorker}
                  disabled={!workerPickerId || workerActionBusy}
                  className="w-full sm:w-auto shrink-0"
                >
                  {workerActionBusy ? (
                    <span className="material-icons-round animate-spin text-sm">refresh</span>
                  ) : (
                    <span className="material-icons-round text-sm">person_add</span>
                  )}
                  إضافة
                </Button>
              </div>
              {workerActionError && (
                <p className="text-xs font-bold text-rose-500">{workerActionError}</p>
              )}
            </div>
            <div className="p-4 overflow-y-auto divide-y divide-slate-50">
              {lineWorkers.length === 0 ? (
                <div className="text-center py-8">
                  <span className="material-icons-round text-4xl text-[var(--color-text-muted)] dark:text-[var(--color-text)] mb-2 block">person_add</span>
                  <p className="text-sm text-[var(--color-text-muted)] font-medium">لا يوجد عمالة مسجلة على هذا الخط اليوم</p>
                </div>
              ) : (
                lineWorkers.map((w, i) => (
                  <div key={w.id || i} className="flex items-center gap-3 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-icons-round text-primary text-sm">person</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-[var(--color-text)] truncate">{w.employeeName}</p>
                      <p className="text-xs text-[var(--color-text-muted)] font-mono">{w.employeeCode}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickRemoveWorker(w.id)}
                      disabled={workerActionBusy}
                      className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-[var(--border-radius-base)] transition-all disabled:opacity-50"
                      title="حذف العامل من الخط"
                    >
                      <span className="material-icons-round text-base">delete</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fixed-size WhatsApp share image render target */}
      {shareCardRow && (
        <div
          style={{
            position: 'fixed',
            left: '-99999px',
            top: 0,
            width: 1080,
            background: 'white',
            zIndex: -1,
            pointerEvents: 'none',
          }}
        >
          <div ref={shareCardRef} style={{ width: 1080, background: 'white' }}>
            <ProductionReportShareCard report={shareCardRow} printSettings={printTemplate} />
          </div>
        </div>
      )}

      {/* Hidden print component */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          zIndex: -1,
          pointerEvents: 'none',
          direction: 'rtl',
          width: 'max-content',
          minWidth: 640,
          maxWidth: 'none',
          overflow: 'visible',
        }}
      >
        <SingleReportPrint ref={printRef} report={printReport} printSettings={printTemplate} />
      </div>

    </div>
  );
};
