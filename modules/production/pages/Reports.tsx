
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import html2canvas from 'html2canvas';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileUp,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Share2,
  Trash2,
  User,
  UserPlus,
  UserX,
  Users,
  WalletCards,
  X,
  Ban,
  CalendarCheck2,
  ChevronsUpDown,
  Filter,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedPrint } from '@/utils/printManager';
import { Card, Button, Badge, SearchableSelect } from '../components/UI';
import { formatNumber, getOperationalDateString } from '../../../utils/calculations';
import { buildReportsCosts, buildSupervisorHourlyRatesMap, estimateReportCost, formatCost } from '../../../utils/costCalculations';
import { ProductionReport, LineWorkerAssignment, WorkOrder, QualityStatus, ReportComponentScrapItem, ProductionLineStatus } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { exportFactoryGeneralReport, exportReportsByDateRange, exportWorkOrders } from '../../../utils/exportExcel';
import { exportToPDF, exportElementsToSinglePDF, shareToWhatsApp, ShareResult } from '../../../utils/reportExport';
import {
  parseExcelFile,
  parseReportDateUpdateExcelFile,
  toReportData,
  ImportResult,
  ParsedReportRow,
  ReportDateUpdateImportResult,
} from '../../../utils/importExcel';
import { downloadReportsTemplate, ReportsTemplateLookups } from '../../../utils/downloadTemplates';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { reportService, type FirestoreCursor } from '@/modules/production/services/reportService';
import { useLocation } from 'react-router-dom';
import {
  ProductionReportPrint,
  SingleReportPrint,
  mapReportsToPrintRows,
  computePrintTotals,
  ReportPrintRow,
} from '../components/ProductionReportPrint';
import { SelectableTable } from '../components/SelectableTable';
import type { TableColumn, TableBulkAction } from '../components/SelectableTable';
import { useJobsStore } from '../../../components/background-jobs/useJobsStore';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { PageHeader } from '../../../components/PageHeader';
import { toast } from '../../../components/Toast';
import { getReportDuplicateMessage } from '../utils/reportDuplicateError';
import { stockService } from '../../inventory/services/stockService';
import { warehouseService } from '../../inventory/services/warehouseService';
import type { StockItemBalance, Warehouse } from '../../inventory/types';
import { categoryService } from '../../catalog/services/categoryService';
import { catalogRawMaterialService } from '../../catalog/services/catalogRawMaterialService';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { ReportShareCard, type ReportShareCardProps } from '@/src/components/erp/ReportShareCard';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const emptyForm = {
  reportType: 'finished_product' as 'finished_product' | 'component_injection',
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
  workHours: 0,
  notes: '',
  componentScrapItems: [] as ReportComponentScrapItem[],
};

const deriveReportWaste = (report: Pick<ProductionReport, 'componentScrapItems'>): number =>
  (report.componentScrapItems || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
const NOTE_PREVIEW_LENGTH = 10;
type ReportGroupBy = 'none' | 'supervisor' | 'line' | 'product';
const workOrderStatusLabel = (status?: WorkOrder['status']): string => {
  if (status === 'completed') return 'مكتمل';
  if (status === 'cancelled') return 'موقف';
  if (status === 'in_progress' || status === 'pending') return 'قيد التنفيذ';
  return 'قيد التنفيذ';
};

type FactoryGeneralRow = {
  key: string;
  lineId: string;
  supervisorId: string;
  productId: string;
  reportType: ProductionReport['reportType'];
  lineName: string;
  supervisorName: string;
  productName: string;
  totalProducedQty: number;
  productionWorkers: number;
  avgWorkersPerReport: number;
  totalCost: number;
  unitCost: number;
  totalDays: number;
  reportsCount: number;
  decomposedBalance: number;
  finishedBalance: number;
  finalProductBalance: number;
};

type FactoryGeneralSortKey =
  | 'lineName'
  | 'supervisorName'
  | 'productName'
  | 'totalProducedQty'
  | 'productionWorkers'
  | 'avgWorkersPerReport'
  | 'unitCost'
  | 'totalDays'
  | 'reportsCount'
  | 'decomposedBalance'
  | 'finishedBalance'
  | 'finalProductBalance';

const REPORT_ICON_MAP: Record<string, LucideIcon> = {
  refresh: Loader2,
  search: Search,
  close: X,
  groups: Users,
  assignment: FileText,
  share: Share2,
  print: Printer,
  edit: Pencil,
  delete: Trash2,
  warning: AlertTriangle,
  arrow_forward: ArrowLeft,
  unfold_more: ChevronsUpDown,
  arrow_upward: ArrowUp,
  arrow_downward: ArrowDown,
  check_circle: CheckCircle2,
  open_in_new: ExternalLink,
  price_check: WalletCards,
  event_available: CalendarCheck2,
  block: Ban,
  save: Save,
  add: Plus,
  delete_forever: Trash2,
  delete_sweep: Trash2,
  upload_file: FileUp,
  download: Download,
  description: FileText,
  error: AlertCircle,
  content_copy: ClipboardCopy,
  person_add: UserPlus,
  person_off: UserX,
  person: User,
};

const ReportIcon = ({
  name,
  ...iconProps
}: {
  name: string;
} & React.ComponentProps<'svg'>) => {
  const Icon = REPORT_ICON_MAP[name] ?? AlertCircle;
  return <Icon {...iconProps} />;
};

const normalizeWarehouseName = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه');

const toDateInputValue = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const Reports: React.FC = () => {
  const { openModal } = useGlobalModalManager();
  const location = useLocation();
  const isMobilePrint = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const todayReports = useAppStore((s) => s.todayReports);
  const productionReports = useAppStore((s) => s.productionReports);
  const employees = useAppStore((s) => s.employees);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const lineStatuses = useAppStore((s) => s.lineStatuses);
  const uid = useAppStore((s) => s.uid);
  const saveErrorFromStore = useAppStore((s) => s.error);
  const createReport = useAppStore((s) => s.createReport);
  const updateReport = useAppStore((s) => s.updateReport);
  const deleteReport = useAppStore((s) => s.deleteReport);
  const fetchReportsFromStore = useAppStore((s) => s.fetchReports);
  const syncMissingProductionEntryTransfers = useAppStore((s) => s.syncMissingProductionEntryTransfers);
  const backfillUnlinkedReportsWorkOrders = useAppStore((s) => s.backfillUnlinkedReportsWorkOrders);
  const unlinkReportsWorkOrdersInRange = useAppStore((s) => s.unlinkReportsWorkOrdersInRange);
  const reportsLoading = useAppStore((s) => s.reportsLoading);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const addJob = useJobsStore((s) => s.addJob);
  const startJob = useJobsStore((s) => s.startJob);
  const setJobProgress = useJobsStore((s) => s.setJobProgress);
  const completeJob = useJobsStore((s) => s.completeJob);
  const failJob = useJobsStore((s) => s.failJob);

  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const workOrders = useAppStore((s) => s.workOrders);
  const planSettings = useAppStore((s) => s.systemSettings.planSettings);

  const { can } = usePermission();
  const canViewCosts = can('reports.viewCost');
  const canCreateFinishedReportsBase = can('reports.create');
  const forceInjectionOnly = can('reports.componentInjection.only') && !canCreateFinishedReportsBase;
  const canCreateFinishedReports = can('reports.create') && !forceInjectionOnly;
  const canManageComponentInjectionReports = can('reports.componentInjection.manage') || forceInjectionOnly;
  const canChooseReportType = canCreateFinishedReports && canManageComponentInjectionReports;
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'reports'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;
  const canImportFromPage = can('import') && pageControl.importEnabled;

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const formWorkersTotal = useMemo(() => (
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
  const effectiveFormWorkersCount = form.reportType === 'component_injection'
    ? Number(form.workersCount || 0)
    : formWorkersTotal;
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [saveToastType, setSaveToastType] = useState<'success' | 'error'>('success');
  const [syncingMissingTransfers, setSyncingMissingTransfers] = useState(false);
  const [backfillingUnlinkedReports, setBackfillingUnlinkedReports] = useState(false);
  const [unlinkingReportWorkOrders, setUnlinkingReportWorkOrders] = useState(false);
  const [expandedNoteRows, setExpandedNoteRows] = useState<Set<string>>(new Set());

  // Import from Excel state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'create' | 'updateDate'>('create');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importDateUpdateResult, setImportDateUpdateResult] = useState<ReportDateUpdateImportResult | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importFileName, setImportFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Single-report print state
  const [printReport, setPrintReport] = useState<ReportPrintRow | null>(null);
  const singlePrintRef = useRef<HTMLDivElement>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [shareCardReport, setShareCardReport] = useState<ReportShareCardProps['report'] | null>(null);
  const [bulkSinglePrintRows, setBulkSinglePrintRows] = useState<ReportPrintRow[] | null>(null);
  const bulkSinglePrintRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Bulk print ref
  const bulkPrintRef = useRef<HTMLDivElement>(null);
  const [bulkPrintSource, setBulkPrintSource] = useState<ProductionReport[] | null>(null);
  const [bulkDeleteItems, setBulkDeleteItems] = useState<ProductionReport[] | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Line workers for auto-fill and viewing
  const [formLineWorkers, setFormLineWorkers] = useState<LineWorkerAssignment[]>([]);
  const [viewWorkersData, setViewWorkersData] = useState<{
    lineId: string;
    date: string;
    workers: LineWorkerAssignment[];
    report?: Pick<
      ProductionReport,
      | 'id'
      | 'workersCount'
      | 'workersProductionCount'
      | 'workersPackagingCount'
      | 'workersQualityCount'
      | 'workersMaintenanceCount'
      | 'workersExternalCount'
      | 'workHours'
    >;
  } | null>(null);
  const [viewWorkersLoading, setViewWorkersLoading] = useState(false);
  const [viewWorkersPickerId, setViewWorkersPickerId] = useState('');
  const [viewWorkersBusy, setViewWorkersBusy] = useState(false);
  const [viewWorkersError, setViewWorkersError] = useState<string | null>(null);
  const getOperatorsCount = useCallback(
    (workers: LineWorkerAssignment[], supervisorId?: string) =>
      workers.filter((w) => w.employeeId !== supervisorId).length,
    [],
  );

  // Work order detail popup
  const [viewWOReport, setViewWOReport] = useState<ProductionReport | null>(null);
  const [viewQualityReport, setViewQualityReport] = useState<ProductionReport | null>(null);
  const [selectedReportDrawer, setSelectedReportDrawer] = useState<ProductionReport | null>(null);
  const [reportDrawerTab, setReportDrawerTab] = useState<'summary' | 'cost' | 'notes'>('summary');


  // Date range filter
  const [startDate, setStartDate] = useState(getOperationalDateString(8));
  const [endDate, setEndDate] = useState(getOperationalDateString(8));
  const [viewMode, setViewMode] = useState<'today' | 'range' | 'general'>('today');
  const [rangeCursor, setRangeCursor] = useState<FirestoreCursor>(null);
  const [rangeHasMore, setRangeHasMore] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [factorySearch, setFactorySearch] = useState('');
  const [factorySortKey, setFactorySortKey] = useState<FactoryGeneralSortKey>('totalProducedQty');
  const [factorySortDirection, setFactorySortDirection] = useState<'asc' | 'desc'>('desc');
  const [stockBalances, setStockBalances] = useState<StockItemBalance[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [rawMaterialOptions, setRawMaterialOptions] = useState<Array<{ id: string; name: string; code: string }>>([]);

  // Line & supervisor filters
  const [filterLineId, setFilterLineId] = useState('');
  const [filterProductCategory, setFilterProductCategory] = useState('');
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [reportGroupBy, setReportGroupBy] = useState<ReportGroupBy>('none');
  const [highlightReportId, setHighlightReportId] = useState<string | null>(null);
  const [assignedLineIds, setAssignedLineIds] = useState<Set<string>>(new Set());
  const reportCodesBackfilledRef = useRef(false);
  const currentEmployee = useMemo(
    () => _rawEmployees.find((s) => s.userId === uid) ?? null,
    [_rawEmployees, uid],
  );
  const isSupervisorReporter = currentEmployee?.level === 2;
  const shouldRestrictSupervisorLines = isSupervisorReporter && !editId;

  const openCreate = useCallback(() => {
    setEditId(null);
    setSaveToast(null);
    setForm({
      ...emptyForm,
      date: getOperationalDateString(8),
    });
    setShowModal(true);
  }, []);

  const openCreateComponent = useCallback(() => {
    openModal(MODAL_KEYS.REPORTS_CREATE, { source: 'reports.page', reportType: 'component_injection' });
  }, [openModal]);

  const openImport = useCallback(() => {
    openModal(MODAL_KEYS.REPORTS_IMPORT, { source: 'reports.page' });
  }, [openModal]);

  // Employee-only filter: basic employees see only their own reports
  const myEmployeeId = useMemo(() => {
    if (can('reports.edit')) return null;
    const linked = _rawEmployees.find((s) => s.userId === uid);
    return linked?.id ?? null;
  }, [_rawEmployees, uid, can]);

  useEffect(() => {
    if (!showModal || !form.lineId || !form.date) { setFormLineWorkers([]); return; }
    lineAssignmentService.getByLineAndDate(form.lineId, form.date).then((list) => {
      setFormLineWorkers(list);
    }).catch(() => setFormLineWorkers([]));
  }, [showModal, form.lineId, form.date, editId]);

  useEffect(() => {
    if (!showModal || !isSupervisorReporter || !currentEmployee?.id) return;
    setForm((prev) => (
      prev.employeeId === currentEmployee.id
        ? prev
        : { ...prev, employeeId: currentEmployee.id }
    ));
  }, [showModal, isSupervisorReporter, currentEmployee?.id]);

  useEffect(() => {
    let mounted = true;
    if (!showModal || !shouldRestrictSupervisorLines || !currentEmployee?.id) {
      setAssignedLineIds(new Set());
      return () => { mounted = false; };
    }
    supervisorLineAssignmentService.getActiveByDate(form.date)
      .then((rows) => {
        if (!mounted) return;
        const ids = new Set(
          rows
            .filter((row) => String(row.supervisorId || '').trim() === currentEmployee.id)
            .map((row) => String(row.lineId || '').trim())
            .filter(Boolean),
        );
        setAssignedLineIds(ids);
      })
      .catch(() => {
        if (!mounted) return;
        setAssignedLineIds(new Set());
      });
    return () => {
      mounted = false;
    };
  }, [showModal, shouldRestrictSupervisorLines, currentEmployee?.id, form.date]);

  useEffect(() => {
    if (reportCodesBackfilledRef.current) return;
    if (!can('reports.edit')) return;
    reportCodesBackfilledRef.current = true;

    reportService.backfillMissingReportCodes()
      .then(async (updated) => {
        if (updated <= 0) return;
        if (viewMode === 'range') {
          await fetchReportsFromStore(startDate, endDate);
        }
      })
      .catch(() => {
        // Silent fallback to keep page usable.
      });
  }, [can, fetchReportsFromStore, startDate, endDate, viewMode]);

  useEffect(() => {
    let mounted = true;
    Promise.all([stockService.getBalances(), warehouseService.getAll()])
      .then(([balances, warehousesRows]) => {
        if (!mounted) return;
        setStockBalances(balances || []);
        setWarehouses(warehousesRows || []);
      })
      .catch(() => {
        if (!mounted) return;
        setStockBalances([]);
        setWarehouses([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

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
    let mounted = true;
    categoryService.seedFromProductsModel()
      .then(() => categoryService.getAll())
      .then((rows) => {
        if (!mounted) return;
        const names = rows
          .filter((row) => row.isActive !== false)
          .map((row) => String(row.name || '').trim())
          .filter(Boolean);
        setCategoryOptions(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'ar')));
      })
      .catch(() => {
        if (!mounted) return;
        setCategoryOptions([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadRangeReports = useCallback(
    async (from: string, to: string, append = false) => {
      setRangeLoading(true);
      if (!append) setRangeError(null);
      try {
        const page = await reportService.listByDateRangePaged({
          startDate: from,
          endDate: to,
          limit: 50,
          cursor: append ? rangeCursor : null,
        });
        const current = append ? useAppStore.getState().productionReports : [];
        useAppStore.setState({ productionReports: [...current, ...page.items] });
        setRangeCursor(page.nextCursor);
        setRangeHasMore(page.hasMore && !!page.nextCursor);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'تعذر تحميل التقارير للفترة المحددة.';
        setRangeError(message);
      } finally {
        setRangeLoading(false);
      }
    },
    [rangeCursor],
  );

  const fetchReports = useCallback(
    async (from: string, to: string) => {
      setRangeLoading(true);
      setRangeError(null);
      try {
        const rows = await reportService.getByDateRange(from, to);
        useAppStore.setState({ productionReports: rows });
        setRangeCursor(null);
        setRangeHasMore(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'تعذر تحميل التقارير للفترة المحددة.';
        setRangeError(message);
      } finally {
        setRangeLoading(false);
      }
    },
    [],
  );

  const allReports = viewMode === 'today' ? todayReports : productionReports;
  const productCategoryOptions = useMemo(() => {
    const unique = new Set<string>();
    categoryOptions.forEach((category) => unique.add(category));
    _rawProducts.forEach((p: any) => {
      const category = String(p?.model ?? '').trim();
      if (category) unique.add(category);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [_rawProducts, categoryOptions]);
  const productCategoryByProductId = useMemo(() => {
    const map = new Map<string, string>();
    _rawProducts.forEach((p: any) => {
      if (!p?.id) return;
      map.set(String(p.id), String(p.model ?? '').trim());
    });
    return map;
  }, [_rawProducts]);
  const applyReportFilters = useCallback((source: ProductionReport[]) => {
    let list = myEmployeeId
      ? source.filter((r) => r.employeeId === myEmployeeId)
      : source;
    if (filterLineId) list = list.filter((r) => r.lineId === filterLineId);
    if (filterProductCategory) {
      list = list.filter((r) => (productCategoryByProductId.get(r.productId) || '') === filterProductCategory);
    }
    if (filterEmployeeId) list = list.filter((r) => r.employeeId === filterEmployeeId);
    return list;
  }, [myEmployeeId, filterLineId, filterProductCategory, filterEmployeeId, productCategoryByProductId]);

  const sortReports = useCallback((source: ProductionReport[]) => {
    const getRegisteredAtMs = (report: ProductionReport): number => {
      const createdAt = report.createdAt as any;
      if (createdAt?.toDate) return createdAt.toDate().getTime();
      if (typeof createdAt?.seconds === 'number') return createdAt.seconds * 1000;
      if (createdAt) {
        const parsed = new Date(createdAt).getTime();
        if (!Number.isNaN(parsed)) return parsed;
      }
      const dateOnlyMs = new Date(report.date).getTime();
      return Number.isNaN(dateOnlyMs) ? 0 : dateOnlyMs;
    };

    return [...source].sort((a, b) => {
      const byCreatedAt = getRegisteredAtMs(b) - getRegisteredAtMs(a);
      if (byCreatedAt !== 0) return byCreatedAt;
      return (b.date || '').localeCompare(a.date || '');
    });
  }, []);

  const displayedReports = useMemo(
    () => sortReports(applyReportFilters(allReports)),
    [allReports, applyReportFilters, sortReports],
  );
  const groupedReports = useMemo(() => {
    if (reportGroupBy === 'none') return [];

    const groups = new Map<string, {
      key: string;
      label: string;
      reports: ProductionReport[];
      produced: number;
      waste: number;
    }>();

    displayedReports.forEach((report) => {
      let key = 'unknown';
      let label = 'غير محدد';

      if (reportGroupBy === 'supervisor') {
        const supervisorId = String(report.employeeId || '');
        key = supervisorId || 'supervisor_unknown';
        label = employees.find((s) => s.id === supervisorId)?.name ?? 'بدون مشرف';
      } else if (reportGroupBy === 'line') {
        const lineId = String(report.lineId || '');
        key = lineId || 'line_unknown';
        label = _rawLines.find((line) => line.id === lineId)?.name ?? '—';
      } else if (reportGroupBy === 'product') {
        const productId = String(report.productId || '');
        key = productId || 'product_unknown';
        if (report.reportType === 'component_injection') {
          label = rawMaterialOptions.find((m) => m.id === productId)?.name ?? '—';
        } else {
          label = _rawProducts.find((p) => p.id === productId)?.name ?? '—';
        }
      }

      const current = groups.get(key) || {
        key,
        label,
        reports: [],
        produced: 0,
        waste: 0,
      };
      current.reports.push(report);
      current.produced += Number(report.quantityProduced || 0);
      current.waste += Number(deriveReportWaste(report) || 0);
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, [reportGroupBy, displayedReports, employees, _rawLines, rawMaterialOptions, _rawProducts]);

  const categoryUsageCount = useMemo(() => {
    const counts = new Map<string, number>();
    const scoped = myEmployeeId
      ? allReports.filter((r) => r.employeeId === myEmployeeId)
      : allReports;
    const filteredByLineAndEmployee = scoped.filter((r) => {
      if (filterLineId && r.lineId !== filterLineId) return false;
      if (filterEmployeeId && r.employeeId !== filterEmployeeId) return false;
      return true;
    });
    filteredByLineAndEmployee.forEach((report) => {
      const category = (productCategoryByProductId.get(report.productId) || '').trim();
      if (!category) return;
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return counts;
  }, [allReports, myEmployeeId, filterLineId, filterEmployeeId, productCategoryByProductId]);

  const linkedReportId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('reportId');
  }, [location.search]);

  useEffect(() => {
    if (!linkedReportId) return;
    let cancelled = false;

    const loadLinkedReport = async () => {
      const existsNow = displayedReports.some((r) => r.id === linkedReportId);
      if (existsNow) return;

      const linkedReport = await reportService.getById(linkedReportId);
      if (!linkedReport || cancelled) return;

      setStartDate(linkedReport.date);
      setEndDate(linkedReport.date);
      setFilterLineId('');
      setFilterEmployeeId('');
      await fetchReports(linkedReport.date, linkedReport.date);
      if (cancelled) return;
      setViewMode('range');
    };

    loadLinkedReport().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [linkedReportId, displayedReports, fetchReports]);

  useEffect(() => {
    if (!linkedReportId) return;
    const existsNow = displayedReports.some((r) => r.id === linkedReportId);
    if (!existsNow) return;

    setHighlightReportId(linkedReportId);
    const rowEl = document.querySelector(`[data-row-id="${linkedReportId}"]`) as HTMLElement | null;
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const timer = setTimeout(() => setHighlightReportId(null), 5000);
    return () => clearTimeout(timer);
  }, [linkedReportId, displayedReports]);

  const supervisorHourlyRates = useMemo(
    () => buildSupervisorHourlyRatesMap(_rawEmployees),
    [_rawEmployees]
  );

  const reportCosts = useMemo(() => {
    if (!canViewCosts) return new Map<string, number>();
    const hourlyRate = laborSettings?.hourlyRate ?? 0;
    return buildReportsCosts(displayedReports, hourlyRate, costCenters, costCenterValues, costAllocations, supervisorHourlyRates);
  }, [canViewCosts, displayedReports, laborSettings, costCenters, costCenterValues, costAllocations, supervisorHourlyRates]);

  const warehouseBuckets = useMemo(() => {
    const decomposed = new Set<string>();
    const finished = new Set<string>();
    const finalProduct = new Set<string>();

    // Prefer explicit warehouse IDs from system settings for 100% accuracy.
    const decomposedId = String(planSettings?.decomposedSourceWarehouseId || '').trim();
    const finishedId = String(planSettings?.finishedReceiveWarehouseId || '').trim();
    const finalProductId = String(planSettings?.finalProductWarehouseId || '').trim();
    if (decomposedId) decomposed.add(decomposedId);
    if (finishedId) finished.add(finishedId);
    if (finalProductId) finalProduct.add(finalProductId);

    // Fallback by warehouse name only when any ID is missing.
    const needsNameFallback = !decomposedId || !finishedId || !finalProductId;
    if (!needsNameFallback) {
      return { decomposed, finished, finalProduct };
    }

    warehouses.forEach((wh) => {
      const id = String(wh.id || '');
      const name = normalizeWarehouseName(wh.name);
      if (!id || !name) return;
      if (!decomposedId && (name.includes('مفكك') || name.includes('decomposed'))) decomposed.add(id);
      if (!finishedId && (name.includes('تم الصنع') || name.includes('finished'))) finished.add(id);
      if (!finalProductId && (name.includes('منتج تام') || name.includes('منتج نهائي') || name.includes('final product'))) finalProduct.add(id);
    });
    return { decomposed, finished, finalProduct };
  }, [warehouses, planSettings?.decomposedSourceWarehouseId, planSettings?.finishedReceiveWarehouseId, planSettings?.finalProductWarehouseId]);

  const productBalanceByWarehouseBucket = useMemo(() => {
    const map = new Map<string, { decomposed: number; finished: number; finalProduct: number }>();
    stockBalances.forEach((row) => {
      const productId = String(row.itemId || '');
      if (!productId) return;
      const current = map.get(productId) || { decomposed: 0, finished: 0, finalProduct: 0 };
      if (warehouseBuckets.decomposed.has(row.warehouseId)) current.decomposed += Number(row.quantity || 0);
      if (warehouseBuckets.finished.has(row.warehouseId)) current.finished += Number(row.quantity || 0);
      if (warehouseBuckets.finalProduct.has(row.warehouseId)) current.finalProduct += Number(row.quantity || 0);
      map.set(productId, current);
    });
    return map;
  }, [stockBalances, warehouseBuckets]);

  // ── Template lookups (for dynamic Excel template) ──────────────────────────

  const templateLookups = useMemo<ReportsTemplateLookups>(() => ({
    lines: _rawLines.map((l) => ({ name: l.name })),
    products: _rawProducts.map((p) => ({ name: p.name, code: p.code })),
    employees: employees.filter((e) => e.level === 2).map((e) => ({ name: e.name, code: e.code ?? '' })),
  }), [_rawLines, _rawProducts, employees]);

  // ── Lookups ────────────────────────────────────────────────────────────────

  const getProductName = useCallback(
    (pid: string, reportType?: ProductionReport['reportType']) => {
      if (reportType === 'component_injection') {
        return rawMaterialOptions.find((m) => m.id === pid)?.name ?? '—';
      }
      return _rawProducts.find((p) => p.id === pid)?.name ?? '—';
    },
    [_rawProducts, rawMaterialOptions]
  );
  const getLineName = useCallback(
    (lid: string) => _rawLines.find((l) => l.id === lid)?.name ?? '—',
    [_rawLines]
  );
  const getEmployeeName = useCallback(
    (sid: string) => employees.find((s) => s.id === sid)?.name ?? '—',
    [employees]
  );

  const factoryGeneralRows = useMemo<FactoryGeneralRow[]>(() => {
    const source = displayedReports;
    const grouped = new Map<string, {
      lineId: string;
      supervisorId: string;
      productId: string;
      reportType: ProductionReport['reportType'];
      totalProducedQty: number;
      totalProductionWorkers: number;
      totalWorkersCount: number;
      reportsCount: number;
      dates: Set<string>;
      totalCost: number;
    }>();

    source.forEach((report) => {
      const lineId = String(report.lineId || '');
      const supervisorId = String(report.employeeId || '');
      const productId = String(report.productId || '');
      const reportType = report.reportType === 'component_injection' ? 'component_injection' : 'finished_product';
      const key = `${lineId}__${supervisorId}__${productId}__${reportType}`;
      const current = grouped.get(key) || {
        lineId,
        supervisorId,
        productId,
        reportType,
        totalProducedQty: 0,
        totalProductionWorkers: 0,
        totalWorkersCount: 0,
        reportsCount: 0,
        dates: new Set<string>(),
        totalCost: 0,
      };

      const produced = Number(report.quantityProduced || 0);
      const productionWorkers = Number(report.workersProductionCount || report.workersCount || 0);
      const workersCount = Number(report.workersCount || 0);
      const unitCost = report.id ? Number(reportCosts.get(report.id) || 0) : 0;
      current.totalProducedQty += produced;
      current.totalProductionWorkers += productionWorkers;
      current.totalWorkersCount += workersCount;
      current.reportsCount += 1;
      if (report.date) current.dates.add(report.date);
      current.totalCost += produced * unitCost;
      grouped.set(key, current);
    });

    const rows = Array.from(grouped.values()).map((row) => {
      const balances = productBalanceByWarehouseBucket.get(row.productId) || {
        decomposed: 0,
        finished: 0,
        finalProduct: 0,
      };
      const unitCost = row.totalProducedQty > 0 ? row.totalCost / row.totalProducedQty : 0;
      return {
        key: `${row.lineId}__${row.supervisorId}__${row.productId}__${row.reportType || 'finished_product'}`,
        lineId: row.lineId,
        supervisorId: row.supervisorId,
        productId: row.productId,
        reportType: row.reportType,
        lineName: getLineName(row.lineId),
        supervisorName: getEmployeeName(row.supervisorId),
        productName: getProductName(row.productId, row.reportType),
        totalProducedQty: row.totalProducedQty,
        productionWorkers: row.totalProductionWorkers,
        avgWorkersPerReport: row.reportsCount > 0 ? row.totalWorkersCount / row.reportsCount : 0,
        totalCost: row.totalCost,
        unitCost,
        totalDays: row.dates.size,
        reportsCount: row.reportsCount,
        decomposedBalance: balances.decomposed,
        finishedBalance: balances.finished,
        finalProductBalance: balances.finalProduct,
      };
    });

    const query = factorySearch.trim().toLowerCase();
    const filtered = !query
      ? rows
      : rows.filter((row) =>
          row.lineName.toLowerCase().includes(query)
          || row.supervisorName.toLowerCase().includes(query)
          || row.productName.toLowerCase().includes(query)
        );

    return filtered;
  }, [
    displayedReports,
    reportCosts,
    productBalanceByWarehouseBucket,
    getLineName,
    getEmployeeName,
    getProductName,
    factorySearch,
  ]);

  const factoryGeneralSortedRows = useMemo(() => {
    const rows = [...factoryGeneralRows];
    rows.sort((a, b) => {
      const aVal = a[factorySortKey];
      const bVal = b[factorySortKey];
      let result = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        result = aVal - bVal;
      } else {
        result = String(aVal ?? '').localeCompare(String(bVal ?? ''), 'ar');
      }
      return factorySortDirection === 'asc' ? result : -result;
    });
    return rows;
  }, [factoryGeneralRows, factorySortKey, factorySortDirection]);

  const factoryGeneralExportRows = useMemo(
    () =>
      factoryGeneralSortedRows.map((row) => ({
        'الخط': row.lineName,
        'المشرف': row.supervisorName,
        'الصنف': row.productName,
        'الصنف المحقق': Number(row.totalProducedQty.toFixed(2)),
        'عمال الإنتاج': Number(row.productionWorkers.toFixed(2)),
        'متوسط العمال/تقرير': Number(row.avgWorkersPerReport.toFixed(2)),
        'تكلفة القطعة': canViewCosts ? Number(row.unitCost.toFixed(2)) : '—',
        'إجمالي التكلفة': canViewCosts ? Number(row.totalCost.toFixed(2)) : '—',
        'إجمالي الأيام': row.totalDays,
        'عدد التقارير': row.reportsCount,
        'رصيد المفكك': Number(row.decomposedBalance.toFixed(2)),
        'رصيد تم الصنع': Number(row.finishedBalance.toFixed(2)),
        'رصيد منتج تام': Number(row.finalProductBalance.toFixed(2)),
      })),
    [factoryGeneralSortedRows, canViewCosts],
  );

  const woMap = useMemo(() => {
    const m = new Map<string, WorkOrder>();
    workOrders.forEach((wo) => { if (wo.id) m.set(wo.id, wo); });
    return m;
  }, [workOrders]);

  const getWorkOrder = useCallback(
    (id: string) => woMap.get(id),
    [woMap]
  );
  const qualityStatusMeta = useCallback((status?: QualityStatus) => {
    const normalized = status ?? 'pending';
    const map: Record<QualityStatus, { label: string; className: string }> = {
      pending: { label: 'قيد المراجعة', className: 'bg-amber-50 text-amber-700' },
      approved: { label: 'معتمد', className: 'bg-emerald-50 text-emerald-700' },
      rejected: { label: 'مرفوض', className: 'bg-rose-50 text-rose-700' },
      not_required: { label: 'غير مطلوب', className: 'bg-[#f0f2f5] text-[var(--color-text)]' },
    };
    return map[normalized];
  }, []);
  const getQualityReportCode = useCallback((workOrder?: WorkOrder, reportCode?: string) => {
    if (workOrder?.qualityReportCode) return workOrder.qualityReportCode;
    if (!workOrder?.qualityStatus && !workOrder?.qualitySummary) return null;
    return reportCode ? `QR-${reportCode}` : 'QR';
  }, []);

  const lookups = useMemo(
    () => ({ getLineName, getProductName, getEmployeeName, getWorkOrder }),
    [getLineName, getProductName, getEmployeeName, getWorkOrder]
  );

  // ── Bulk print data ────────────────────────────────────────────────────────

  const printRows = useMemo(
    () => mapReportsToPrintRows(bulkPrintSource ?? displayedReports, lookups, canViewCosts ? reportCosts : undefined),
    [bulkPrintSource, displayedReports, lookups, canViewCosts, reportCosts]
  );
  const printTotals = useMemo(() => computePrintTotals(printRows), [printRows]);

  // ── Print handlers ─────────────────────────────────────────────────────────

  const handleBulkPrint = useManagedPrint({ contentRef: bulkPrintRef, printSettings: printTemplate });
  const handleSinglePrint = useManagedPrint({ contentRef: singlePrintRef, printSettings: printTemplate });

  const buildReportRow = useCallback(
    (report: ProductionReport | typeof emptyForm): ReportPrintRow => {
      const woId = (report as ProductionReport).workOrderId;
      const wo = woId ? woMap.get(woId) : undefined;
      const rid = (report as ProductionReport).id;
      return {
        reportId: rid,
        reportCode: (report as ProductionReport).reportCode,
        date: report.date,
        lineName: getLineName(report.lineId),
        productName: getProductName(report.productId, report.reportType),
        employeeName: getEmployeeName(report.employeeId),
        quantityProduced: report.quantityProduced || 0,
        wasteQuantity: deriveReportWaste(report as ProductionReport),
        workersCount: report.workersCount || 0,
        workersProductionCount: report.workersProductionCount || 0,
        workersPackagingCount: report.workersPackagingCount || 0,
        workersQualityCount: report.workersQualityCount || 0,
        workersMaintenanceCount: report.workersMaintenanceCount || 0,
        workersExternalCount: report.workersExternalCount || 0,
        workHours: report.workHours || 0,
        notes: report.notes,
        costPerUnit: rid && canViewCosts ? reportCosts.get(rid) : undefined,
        workOrderNumber: wo?.workOrderNumber,
      };
    },
    [getLineName, getProductName, getEmployeeName, woMap, canViewCosts, reportCosts]
  );

  const buildShareCardReport = useCallback(
    (report: ProductionReport): ReportShareCardProps['report'] => {
      const wasteQty = deriveReportWaste(report);
      const producedQty = Number(report.quantityProduced || 0);
      const totalQty = producedQty + wasteQty;
      const wastePercent = totalQty > 0 ? Number(((wasteQty / totalQty) * 100).toFixed(1)) : 0;
      const linkedWo = report.workOrderId ? woMap.get(report.workOrderId) : undefined;
      const targetQty = Number(linkedWo?.quantity || 0);
      const deviation = targetQty > 0
        ? Number((((producedQty - targetQty) / targetQty) * 100).toFixed(1))
        : 0;
      const workOrderProgress = linkedWo && targetQty > 0
        ? Math.max(0, Math.min(100, Math.round((Number(linkedWo.producedQuantity || 0) / targetQty) * 100)))
        : undefined;
      const unitCost = report.id && canViewCosts ? Number(reportCosts.get(report.id) || 0) : 0;
      return {
        productName: getProductName(report.productId, report.reportType),
        lineName: getLineName(report.lineId),
        supervisorName: getEmployeeName(report.employeeId),
        reportDate: report.date,
        status: workOrderStatusLabel(linkedWo?.status),
        producedQty,
        wasteQty,
        workers: Number(report.workersCount || 0),
        unitCost,
        workOrderNumber: linkedWo?.workOrderNumber,
        workOrderProgress,
        hours: Number(report.workHours || 0),
        wastePercent,
        deviation,
        workerBreakdown: {
          production: Number(report.workersProductionCount || 0),
          packaging: Number(report.workersPackagingCount || 0),
          quality: Number(report.workersQualityCount || 0),
          maintenance: Number(report.workersMaintenanceCount || 0),
          external: Number(report.workersExternalCount || 0),
        },
      };
    },
    [canViewCosts, getEmployeeName, getLineName, getProductName, reportCosts, woMap]
  );

  const triggerSinglePrint = useCallback(
    async (report: ProductionReport) => {
      const row = buildReportRow(report);
      setPrintReport(row);
      await new Promise((r) => setTimeout(r, 300));
      if (!singlePrintRef.current) return;
      if (isMobilePrint) {
        setExporting(true);
        try {
          await exportToPDF(singlePrintRef.current, `تقرير-إنتاج-${row.lineName}-${row.date}`, {
            paperSize: printTemplate?.paperSize,
            orientation: printTemplate?.orientation,
            copies: 1,
          });
        } finally {
          setExporting(false);
        }
      } else {
        handleSinglePrint();
      }
      setTimeout(() => setPrintReport(null), 1000);
    },
    [buildReportRow, handleSinglePrint, isMobilePrint, printTemplate?.orientation, printTemplate?.paperSize]
  );

  const triggerBulkPrint = useCallback(async () => {
    if (!bulkPrintRef.current) return;
    if (isMobilePrint) {
      setExporting(true);
      try {
        await exportToPDF(bulkPrintRef.current, `تقارير-الإنتاج-${startDate}`, {
          paperSize: printTemplate?.paperSize,
          orientation: printTemplate?.orientation,
          copies: 1,
        });
      } finally {
        setExporting(false);
      }
      return;
    }
    handleBulkPrint();
  }, [handleBulkPrint, isMobilePrint, printTemplate?.orientation, printTemplate?.paperSize, startDate]);

  const showShareFeedback = useCallback((result: ShareResult) => {
    if (result.method === 'native_share' || result.method === 'cancelled') return;
    const msg = result.copied
      ? 'تم تحميل الصورة ونسخها — افتح المحادثة والصق الصورة (Ctrl+V)'
      : 'تم تحميل صورة التقرير — أرفقها في محادثة واتساب';
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 6000);
  }, []);

  const triggerSingleShare = useCallback(
    async (report: ProductionReport) => {
      const shareReport = buildShareCardReport(report);
      setShareCardReport(shareReport);
      await new Promise((r) => setTimeout(r, 120));
      if (!shareCardRef.current) return;
      setExporting(true);
      try {
        const canvas = await html2canvas(shareCardRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#fff',
          width: 420,
          windowWidth: 420,
        });
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });
        if (!blob) {
          throw new Error('تعذر إنشاء صورة التقرير.');
        }
        const file = new File([blob], `تقرير-إنتاج-${shareReport.reportDate}.png`, { type: 'image/png' });
        const canUseNativeShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
        if (canUseNativeShare) {
          await navigator.share({
            files: [file],
            title: `تقرير إنتاج - ${shareReport.productName}`,
            text: `تقرير إنتاج ${shareReport.reportDate}`,
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `تقرير-${shareReport.reportDate}.png`;
          a.click();
          URL.revokeObjectURL(url);
          setShareToast('تم تحميل صورة التقرير — أرفقها مباشرة في واتساب.');
          setTimeout(() => setShareToast(null), 6000);
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          toast.error(error?.message || 'تعذر مشاركة التقرير الآن. حاول مرة أخرى.');
        }
      } finally {
        setExporting(false);
        setShareCardReport(null);
      }
    },
    [buildShareCardReport]
  );

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleFetchRange = async () => {
    if (startDate && endDate) {
      await fetchReports(startDate, endDate);
      setViewMode('range');
    }
  };

  const handleShowToday = () => {
    setViewMode('today');
    setStartDate(getOperationalDateString(8));
    setEndDate(getOperationalDateString(8));
    setFilterLineId('');
    setFilterEmployeeId('');
    setRangeError(null);
    setRangeHasMore(false);
    setRangeCursor(null);
  };

  const handleShowYesterday = async () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = toDateInputValue(d);
    setStartDate(yesterday);
    setEndDate(yesterday);
    await fetchReports(yesterday, yesterday);
    setViewMode('range');
  };

  const handleShowWeekly = async () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const startStr = toDateInputValue(start);
    const endStr = toDateInputValue(end);
    setStartDate(startStr);
    setEndDate(endStr);
    await fetchReports(startStr, endStr);
    setViewMode('range');
  };

  const handleShowMonthly = async () => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    const startStr = toDateInputValue(start);
    const endStr = toDateInputValue(end);
    setStartDate(startStr);
    setEndDate(endStr);
    await fetchReports(startStr, endStr);
    setViewMode('range');
  };

  const handleShowGeneralMonthly = async () => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    const startStr = toDateInputValue(start);
    const endStr = toDateInputValue(end);
    setFilterLineId('');
    setFilterProductCategory('');
    setFilterEmployeeId('');
    setStartDate(startStr);
    setEndDate(endStr);
    await fetchReports(startStr, endStr);
    setViewMode('general');
  };

  const handleBackToReports = () => {
    setViewMode('range');
  };

  const activeFilterCount = (filterLineId ? 1 : 0) + (filterProductCategory ? 1 : 0) + (filterEmployeeId ? 1 : 0);
  const reportPeriod = useMemo(() => {
    const todayValue = getOperationalDateString(8);
    if (viewMode === 'today') return 'today';
    if (viewMode === 'general') return 'all';
    if (startDate === endDate && startDate !== todayValue) return 'yesterday';
    if (endDate === todayValue) {
      const now = new Date();
      const monthlyStart = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
      if (startDate === monthlyStart) return 'month';
      const weeklyStartDate = new Date();
      weeklyStartDate.setDate(weeklyStartDate.getDate() - 6);
      if (startDate === toDateInputValue(weeklyStartDate)) return 'week';
    }
    return 'all';
  }, [viewMode, startDate, endDate]);
  const handleLoadMoreRange = async () => {
    if (viewMode !== 'range' || rangeLoading || !rangeHasMore) return;
    await loadRangeReports(startDate, endDate, true);
  };

  const tableToolbarFilters = (
    <SmartFilterBar
      searchPlaceholder="ابحث بالخط أو المشرف أو الصنف..."
      searchValue={factorySearch}
      onSearchChange={setFactorySearch}
      periods={[
        { label: 'اليوم', value: 'today' },
        { label: 'أمس', value: 'yesterday' },
        { label: 'أسبوعي', value: 'week' },
        { label: 'شهري', value: 'month' },
        { label: 'الكل', value: 'all' },
      ]}
      activePeriod={reportPeriod}
      onPeriodChange={(value) => {
        if (value === 'today') void handleShowToday();
        if (value === 'yesterday') void handleShowYesterday();
        if (value === 'week') void handleShowWeekly();
        if (value === 'month') void handleShowMonthly();
        if (value === 'all') setViewMode('general');
      }}
      quickFilters={[
        {
          key: 'lineId',
          placeholder: 'كل الخطوط',
          options: _rawLines.map((line) => ({ value: line.id || '', label: line.name })),
          width: 'w-[140px]',
        },
      ]}
      quickFilterValues={{ lineId: filterLineId || 'all' }}
      onQuickFilterChange={(_, value) => setFilterLineId(value === 'all' ? '' : value)}
      advancedFilters={[
        {
          key: 'category',
          label: 'الفئة',
          placeholder: 'كل الفئات',
          options: productCategoryOptions.map((category) => ({
            value: category,
            label: `${category} (${categoryUsageCount.get(category) || 0})`,
          })),
          width: 'w-[170px]',
        },
        ...(!myEmployeeId
          ? [{
            key: 'employeeId',
            label: 'المشرف',
            placeholder: 'كل المشرفين',
            options: employees.filter((employee) => employee.level === 2).map((employee) => ({
              value: employee.id || '',
              label: employee.name,
            })),
            width: 'w-[170px]',
          }]
          : []),
        {
          key: 'groupBy',
          label: 'تجميع',
          placeholder: 'بدون تجميع',
          options: [
            { value: 'supervisor', label: 'تجميع بالمشرف' },
            { value: 'line', label: 'تجميع بالخط' },
            { value: 'product', label: 'تجميع بالمنتج' },
          ],
        },
        { key: 'dateFrom', label: 'من تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
        { key: 'dateTo', label: 'إلى تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
      ]}
      advancedFilterValues={{
        category: filterProductCategory || 'all',
        employeeId: filterEmployeeId || 'all',
        groupBy: reportGroupBy === 'none' ? 'all' : reportGroupBy,
        dateFrom: startDate,
        dateTo: endDate,
      }}
      onAdvancedFilterChange={(key, value) => {
        if (key === 'category') setFilterProductCategory(value === 'all' ? '' : value);
        if (key === 'employeeId') setFilterEmployeeId(value === 'all' ? '' : value);
        if (key === 'groupBy') setReportGroupBy(value === 'all' ? 'none' : (value as ReportGroupBy));
        if (key === 'dateFrom') setStartDate(value);
        if (key === 'dateTo') setEndDate(value);
      }}
      onApply={handleFetchRange}
      applyLabel={(reportsLoading || rangeLoading) ? 'جار التحميل...' : 'عرض'}
      extra={activeFilterCount > 0 ? (
        <button
          type="button"
          className="inline-flex h-[34px] items-center rounded-lg border border-rose-200 px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
          onClick={() => {
            setFilterLineId('');
            setFilterProductCategory('');
            setFilterEmployeeId('');
          }}
        >
          مسح ({activeFilterCount})
        </button>
      ) : undefined}
      className="mb-0"
    />
  );

  const openEdit = (report: ProductionReport) => {
    setEditId(report.id!);
    setSaveToast(null);
    setForm({
      reportType: report.reportType === 'component_injection' ? 'component_injection' : 'finished_product',
      employeeId: report.employeeId,
      productId: report.productId,
      lineId: report.lineId,
      workOrderId: report.workOrderId ?? '',
      date: report.date,
      quantityProduced: report.quantityProduced,
      workersCount: report.workersCount,
      workersProductionCount: report.workersProductionCount || 0,
      workersPackagingCount: report.workersPackagingCount || 0,
      workersQualityCount: report.workersQualityCount || 0,
      workersMaintenanceCount: report.workersMaintenanceCount || 0,
      workersExternalCount: report.workersExternalCount || 0,
      workHours: report.workHours,
      notes: report.notes ?? '',
      componentScrapItems: Array.isArray(report.componentScrapItems) ? report.componentScrapItems : [],
    });
    setShowModal(true);
  };

  const totalComponentScrapQty = useMemo(
    () => (form.componentScrapItems || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [form.componentScrapItems],
  );

  const injectionLineIds = useMemo(
    () => {
      const ids = new Set<string>();
      _rawLines.forEach((line) => {
        if (line.id && line.status === ProductionLineStatus.INJECTION) ids.add(line.id);
      });
      lineStatuses.forEach((status) => {
        if (status.isInjectionLine && status.lineId) ids.add(status.lineId);
      });
      return ids;
    },
    [_rawLines, lineStatuses],
  );

  const selectableLines = useMemo(
    () => (
      form.reportType === 'component_injection'
        ? (shouldRestrictSupervisorLines
            ? _rawLines.filter((line) => line.id && assignedLineIds.has(String(line.id)))
            : _rawLines
          ).filter((line) => line.id && injectionLineIds.has(line.id))
        : (shouldRestrictSupervisorLines
            ? _rawLines.filter((line) => line.id && assignedLineIds.has(String(line.id)))
            : _rawLines)
    ),
    [form.reportType, _rawLines, injectionLineIds, shouldRestrictSupervisorLines, assignedLineIds],
  );

  const selectableProducts = useMemo(
    () => (
      form.reportType === 'component_injection'
        ? rawMaterialOptions.map((m) => ({ value: m.id, label: m.code ? `${m.name} (${m.code})` : m.name }))
        : _rawProducts.map((p) => ({ value: p.id!, label: p.name }))
    ),
    [form.reportType, rawMaterialOptions, _rawProducts],
  );

  useEffect(() => {
    if (form.reportType !== 'component_injection') return;
    if (form.lineId && !injectionLineIds.has(form.lineId)) {
      setForm((prev) => ({ ...prev, lineId: '', workOrderId: '' }));
    }
  }, [form.reportType, form.lineId, injectionLineIds]);

  useEffect(() => {
    if (!showModal || !shouldRestrictSupervisorLines || !form.lineId) return;
    const isAllowed = selectableLines.some((line) => line.id === form.lineId);
    if (isAllowed) return;
    setForm((prev) => ({ ...prev, lineId: '', workOrderId: '' }));
  }, [showModal, shouldRestrictSupervisorLines, form.lineId, selectableLines]);

  const hasDuplicateLineSupervisorReport = useCallback(
    async (
      payload: Pick<typeof emptyForm, 'date' | 'lineId' | 'employeeId' | 'productId' | 'reportType'>,
      excludeReportId?: string | null,
    ) => {
      const sameDayReports = await reportService.getByDateRange(payload.date, payload.date);
      return sameDayReports.some(
        (r) =>
          r.lineId === payload.lineId &&
          r.employeeId === payload.employeeId &&
          r.productId === payload.productId &&
          (r.reportType === 'component_injection' ? 'component_injection' : 'finished_product') === payload.reportType &&
          r.id !== excludeReportId,
      );
    },
    [],
  );

  const handleSave = async (printAfterSave = false) => {
    const requiresWorkers = form.reportType !== 'component_injection';
    if (!form.lineId || !form.productId || !form.employeeId || !form.quantityProduced || !form.workHours || (requiresWorkers && effectiveFormWorkersCount <= 0)) {
      setSaveToastType('error');
      setSaveToast(requiresWorkers
        ? 'أكمل الحقول المطلوبة أولاً (الكمية، تفاصيل العمالة، وساعات العمل)'
        : 'أكمل الحقول المطلوبة أولاً (الكمية وساعات العمل)');
      setTimeout(() => setSaveToast(null), 3500);
      return;
    }
    if (form.reportType === 'finished_product' && forceInjectionOnly) {
      setSaveToastType('error');
      setSaveToast('هذا المستخدم مخصص لتقارير الحقن فقط');
      setTimeout(() => setSaveToast(null), 3500);
      return;
    }
    if (form.reportType === 'component_injection' && !canManageComponentInjectionReports) {
      setSaveToastType('error');
      setSaveToast('غير مصرح بإنشاء أو تعديل تقرير مكون الحقن');
      setTimeout(() => setSaveToast(null), 3500);
      return;
    }
    const payload = { ...form, workersCount: effectiveFormWorkersCount };
    const duplicated = await hasDuplicateLineSupervisorReport(
      {
        date: payload.date,
        lineId: payload.lineId,
        employeeId: payload.employeeId,
        productId: payload.productId,
        reportType: payload.reportType === 'component_injection' ? 'component_injection' : 'finished_product',
      },
      editId,
    );
    if (duplicated) {
      setSaveToastType('error');
      setSaveToast('هذا التقرير مسجل من قبل لنفس اليوم والخط والمشرف');
      setTimeout(() => setSaveToast(null), 3500);
      return;
    }
    setSaving(true);
    setSaveToastType('success');
    setSaveToast(null);

    if (editId) {
      await updateReport(editId, payload);
      setSaving(false);
      setSaveToastType('success');
      setSaveToast('تم حفظ التعديلات بنجاح');
      setTimeout(() => setSaveToast(null), 3000);
      if (printAfterSave && can('print')) {
        await triggerSinglePrint({ ...payload, id: editId });
      }
    } else {
      const createdId = await createReport(payload);
      if (!createdId) {
        setSaving(false);
        setSaveToastType('error');
        setSaveToast(getReportDuplicateMessage(saveErrorFromStore, 'تعذر حفظ التقرير'));
        setTimeout(() => setSaveToast(null), 4000);
        return;
      }
      setSaving(false);
      setForm({
        ...emptyForm,
        reportType: form.reportType === 'component_injection' ? 'component_injection' : 'finished_product',
        date: form.date,
        lineId: form.lineId,
      });
      setSaveToastType('success');
      setSaveToast('تم حفظ التقرير بنجاح');
      setTimeout(() => setSaveToast(null), 3000);
      if (printAfterSave && can('print')) {
        await triggerSinglePrint({
          ...payload,
          id: typeof createdId === 'string' ? createdId : undefined,
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteReport(id);
      setSaveToastType('success');
      setSaveToast('تم حذف التقرير بنجاح');
      setTimeout(() => setSaveToast(null), 3500);
      setDeleteConfirmId(null);
    } catch (error: any) {
      const message = error?.message || 'تعذر حذف التقرير الآن.';
      setSaveToastType('error');
      setSaveToast(message);
      setDeleteError(message);
      setTimeout(() => setSaveToast(null), 5000);
      // Keep confirmation open so user can re-try after resolving dependency issue.
    } finally {
      setDeleteBusy(false);
    }
  };

  const requestDeleteReport = useCallback((report: ProductionReport) => {
    const reportId = (report.id || '').trim();
    if (!reportId) {
      const code = report.reportCode || 'بدون كود';
      setSaveToastType('error');
      setSaveToast(`تعذر حذف السند ${code}: معرف التقرير غير متوفر.`);
      setTimeout(() => setSaveToast(null), 5000);
      return;
    }
    setDeleteError(null);
    setDeleteConfirmId(reportId);
  }, []);

  const handleViewWorkers = async (report: ProductionReport) => {
    const { lineId, date } = report;
    setViewWorkersLoading(true);
    setViewWorkersError(null);
    setViewWorkersPickerId('');
    setViewWorkersData({
      lineId,
      date,
      workers: [],
      report: {
        id: report.id,
        workersCount: report.workersCount || 0,
        workersProductionCount: report.workersProductionCount || 0,
        workersPackagingCount: report.workersPackagingCount || 0,
        workersQualityCount: report.workersQualityCount || 0,
        workersMaintenanceCount: report.workersMaintenanceCount || 0,
        workersExternalCount: report.workersExternalCount || 0,
        workHours: report.workHours || 0,
      },
    });
    try {
      const workers = await lineAssignmentService.getByLineAndDate(lineId, date);
      setViewWorkersData((prev) => (
        prev
          ? { ...prev, lineId, date, workers }
          : null
      ));
    } catch {
      setViewWorkersData(null);
    } finally {
      setViewWorkersLoading(false);
    }
  };

  const refreshWorkersForLineDate = useCallback(async (lineId: string, date: string) => {
    const workers = await lineAssignmentService.getByLineAndDate(lineId, date);
    setViewWorkersData((prev) => (
      prev
        ? { ...prev, lineId, date, workers }
        : { lineId, date, workers }
    ));
    if (showModal && form.lineId === lineId && form.date === date) {
      setFormLineWorkers(workers);
    }
  }, [showModal, form.lineId, form.date]);

  const addWorkerToLineDate = useCallback(async () => {
    if (!viewWorkersData || !viewWorkersPickerId) return;
    const selected = _rawEmployees.find((e) => e.id === viewWorkersPickerId);
    if (!selected) return;

    setViewWorkersBusy(true);
    setViewWorkersError(null);
    try {
      const dayAssignments = await lineAssignmentService.getByDate(viewWorkersData.date);
      const onSameLine = dayAssignments.find(
        (a) => a.employeeId === selected.id && a.lineId === viewWorkersData.lineId,
      );
      if (onSameLine) {
        setViewWorkersError('العامل مسجل بالفعل على هذا الخط في نفس اليوم.');
        return;
      }
      const onOtherLine = dayAssignments.find(
        (a) => a.employeeId === selected.id && a.lineId !== viewWorkersData.lineId,
      );
      if (onOtherLine) {
        setViewWorkersError(`العامل مسجل على خط آخر في نفس اليوم (${getLineName(onOtherLine.lineId)}).`);
        return;
      }

      await lineAssignmentService.create({
        lineId: viewWorkersData.lineId,
        employeeId: selected.id!,
        employeeCode: selected.code || '',
        employeeName: selected.name,
        date: viewWorkersData.date,
        assignedBy: uid || '',
      });
      setViewWorkersPickerId('');
      await refreshWorkersForLineDate(viewWorkersData.lineId, viewWorkersData.date);
    } catch {
      setViewWorkersError('تعذر إضافة العامل الآن. حاول مرة أخرى.');
    } finally {
      setViewWorkersBusy(false);
    }
  }, [viewWorkersData, viewWorkersPickerId, _rawEmployees, getLineName, uid, refreshWorkersForLineDate]);

  const removeWorkerFromLineDate = useCallback(async (assignmentId?: string) => {
    if (!viewWorkersData || !assignmentId) return;
    setViewWorkersBusy(true);
    setViewWorkersError(null);
    try {
      await lineAssignmentService.delete(assignmentId);
      await refreshWorkersForLineDate(viewWorkersData.lineId, viewWorkersData.date);
    } catch {
      setViewWorkersError('تعذر حذف العامل الآن. حاول مرة أخرى.');
    } finally {
      setViewWorkersBusy(false);
    }
  }, [viewWorkersData, refreshWorkersForLineDate]);

  const availableWorkersForModal = useMemo(
    () => {
      if (!viewWorkersData) return [];
      const assignedIds = new Set(viewWorkersData.workers.map((w) => w.employeeId));
      return _rawEmployees
        .filter((e) => e.isActive !== false && !assignedIds.has(e.id!))
        .map((e) => ({
          value: e.id!,
          label: e.code ? `${e.name} (${e.code})` : e.name,
        }));
    },
    [viewWorkersData, _rawEmployees],
  );

  const handlePDF = async () => {
    if (!bulkPrintRef.current) return;
    setExporting(true);
    try {
      await exportToPDF(bulkPrintRef.current, `تقارير-الإنتاج-${startDate}`, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: printTemplate?.copies,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleWhatsApp = async () => {
    if (!bulkPrintRef.current) return;
    setExporting(true);
    try {
      const result = await shareToWhatsApp(bulkPrintRef.current, `تقارير الإنتاج ${startDate}`);
      showShareFeedback(result);
    } finally {
      setExporting(false);
    }
  };

  const handleSyncMissingTransfers = useCallback(async () => {
    if (syncingMissingTransfers) return;
    setSyncingMissingTransfers(true);
    try {
      const summary = await syncMissingProductionEntryTransfers(startDate, endDate);
      toast.warning(
        `تمت المزامنة بنجاح.\n` +
        `تم الفحص: ${summary.processed}\n` +
        `تم الإنشاء: ${summary.created}\n` +
        `تم التخطي: ${summary.skipped}\n` +
        `فشل: ${summary.failed}`,
      );
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تنفيذ مزامنة التحويلات الناقصة.');
    } finally {
      setSyncingMissingTransfers(false);
    }
  }, [syncMissingProductionEntryTransfers, startDate, endDate, syncingMissingTransfers]);

  const handleBackfillUnlinkedReports = useCallback(async () => {
    if (backfillingUnlinkedReports) return;
    const confirmed = window.confirm(
      `سيتم ربط التقارير غير المرتبطة بأوامر الشغل خلال الفترة:\n${startDate} إلى ${endDate}\n\nهل تريد المتابعة؟`,
    );
    if (!confirmed) return;

    const jobId = addJob({
      fileName: `reports-backfill-${startDate}-to-${endDate}`,
      jobType: 'Reports WorkOrder Backfill',
      totalRows: 1,
      startedBy: userDisplayName || 'Current User',
    });
    startJob(jobId, 'جاري فحص التقارير غير المرتبطة...');

    setBackfillingUnlinkedReports(true);
    try {
      const summary = await backfillUnlinkedReportsWorkOrders(startDate, endDate, {
        onStart: (totalCandidates) => {
          setJobProgress(jobId, {
            processedRows: 0,
            totalRows: Math.max(1, totalCandidates),
            statusText: totalCandidates === 0
              ? 'لا توجد تقارير غير مرتبطة في الفترة المحددة.'
              : `تم العثور على ${totalCandidates} تقرير غير مرتبط.`,
            status: 'processing',
          });
        },
        onProgress: ({ processed, total, linked, skipped, failed }) => {
          setJobProgress(jobId, {
            processedRows: processed,
            totalRows: Math.max(1, total),
            statusText: `جارٍ الربط... ربط: ${linked} | تخطي: ${skipped} | فشل: ${failed}`,
            status: 'processing',
          });
        },
      });

      if (summary.processed === 0) {
        completeJob(jobId, {
          addedRows: 0,
          failedRows: 0,
          statusText: 'لا توجد تقارير غير مرتبطة.',
        });
      } else if (summary.linked === 0 && summary.failed > 0) {
        failJob(jobId, 'تعذر ربط كل التقارير المرشحة.', 'Failed');
      } else {
        completeJob(jobId, {
          addedRows: summary.linked,
          failedRows: summary.failed,
          statusText: `Completed (Skipped: ${summary.skipped})`,
        });
      }

      toast.warning(
        `تمت معالجة الربط بنجاح.\n` +
        `تم الفحص: ${summary.processed}\n` +
        `تم الربط: ${summary.linked}\n` +
        `تم التخطي: ${summary.skipped}\n` +
        `فشل: ${summary.failed}`,
      );
    } catch (error: any) {
      failJob(jobId, error?.message || 'تعذر تنفيذ ربط التقارير القديمة.', 'Failed');
      toast.error(error?.message || 'تعذر تنفيذ ربط التقارير القديمة.');
    } finally {
      setBackfillingUnlinkedReports(false);
    }
  }, [
    addJob,
    backfillUnlinkedReportsWorkOrders,
    backfillingUnlinkedReports,
    completeJob,
    endDate,
    failJob,
    setJobProgress,
    startDate,
    startJob,
    userDisplayName,
  ]);

  const handleUnlinkReportWorkOrders = useCallback(async () => {
    if (unlinkingReportWorkOrders) return;
    const confirmed = window.confirm(
      `تحذير: سيتم فك ربط أوامر الشغل من كل التقارير المربوطة في الفترة:\n${startDate} إلى ${endDate}\n\nوسيتم خصم الكميات من أوامر الشغل.\n\nهل تريد المتابعة؟`,
    );
    if (!confirmed) return;

    const jobId = addJob({
      fileName: `reports-unlink-${startDate}-to-${endDate}`,
      jobType: 'Reports WorkOrder Unlink',
      totalRows: 1,
      startedBy: userDisplayName || 'Current User',
    });
    startJob(jobId, 'جاري فحص التقارير المربوطة...');

    setUnlinkingReportWorkOrders(true);
    try {
      const summary = await unlinkReportsWorkOrdersInRange(startDate, endDate, {
        onStart: (totalCandidates) => {
          setJobProgress(jobId, {
            processedRows: 0,
            totalRows: Math.max(1, totalCandidates),
            statusText: totalCandidates === 0
              ? 'لا توجد تقارير مربوطة في الفترة المحددة.'
              : `تم العثور على ${totalCandidates} تقرير مربوط.`,
            status: 'processing',
          });
        },
        onProgress: ({ processed, total, unlinked, skipped, failed }) => {
          setJobProgress(jobId, {
            processedRows: processed,
            totalRows: Math.max(1, total),
            statusText: `جارٍ فك الربط... مفكوك: ${unlinked} | تخطي: ${skipped} | فشل: ${failed}`,
            status: 'processing',
          });
        },
      });

      if (summary.processed === 0) {
        completeJob(jobId, {
          addedRows: 0,
          failedRows: 0,
          statusText: 'لا توجد تقارير مربوطة.',
        });
      } else if (summary.unlinked === 0 && summary.failed > 0) {
        failJob(jobId, 'تعذر فك الربط لكل التقارير المرشحة.', 'Failed');
      } else {
        completeJob(jobId, {
          addedRows: summary.unlinked,
          failedRows: summary.failed,
          statusText: `Completed (Skipped: ${summary.skipped})`,
        });
      }

      toast.warning(
        `تم تنفيذ فك الربط.\n` +
        `تم الفحص: ${summary.processed}\n` +
        `تم فك الربط: ${summary.unlinked}\n` +
        `تم التخطي: ${summary.skipped}\n` +
        `فشل: ${summary.failed}`,
      );
    } catch (error: any) {
      failJob(jobId, error?.message || 'تعذر تنفيذ فك الربط.', 'Failed');
      toast.error(error?.message || 'تعذر تنفيذ فك الربط.');
    } finally {
      setUnlinkingReportWorkOrders(false);
    }
  }, [
    addJob,
    completeJob,
    endDate,
    failJob,
    setJobProgress,
    startDate,
    startJob,
    unlinkReportsWorkOrdersInRange,
    unlinkingReportWorkOrders,
    userDisplayName,
  ]);

  // ── Import from Excel ────────────────────────────────────────────────────

  function resetImportState() {
    setImportResult(null);
    setImportDateUpdateResult(null);
    setImportMode('create');
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportFileName(file.name);
    setImportParsing(true);
    setShowImportModal(true);
    resetImportState();
    let dateUpdateTemplateDetected = false;
    try {
      const dateUpdateResult = await parseReportDateUpdateExcelFile(file);
      if (dateUpdateResult.detectedTemplate) {
        dateUpdateTemplateDetected = true;
        setImportMode('updateDate');
        setImportDateUpdateResult(dateUpdateResult);
        return;
      }

      const result = await parseExcelFile(file, {
        products: _rawProducts,
        lines: _rawLines,
        employees: _rawEmployees,
        existingReports: displayedReports,
      });
      setImportResult(result);
    } catch {
      if (dateUpdateTemplateDetected) {
        setImportDateUpdateResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0, detectedTemplate: true });
      } else {
        setImportResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0, warningCount: 0, duplicateCount: 0 });
      }
    } finally {
      setImportParsing(false);
    }
  };

  const handleImportSave = async () => {
    if (importMode === 'updateDate') {
      if (!importDateUpdateResult) return;
      const validRows = importDateUpdateResult.rows.filter((r) => r.errors.length === 0);
      if (validRows.length === 0) return;

      const jobId = addJob({
        fileName: importFileName || 'reports-bulk-update.xlsx',
        jobType: 'Reports Bulk Update Import',
        totalRows: validRows.length,
        startedBy: userDisplayName || 'Current User',
      });

      setImportSaving(true);
      setImportProgress({ done: 0, total: validRows.length });
      startJob(jobId, 'Updating report fields...');
      setShowImportModal(false);
      resetImportState();
      setImportFileName('');

      let done = 0;
      let failed = 0;
      for (const row of validRows) {
        try {
          const updated = await reportService.updateByReportCode(row.reportCode, {
            ...(row.date ? { date: row.date } : {}),
            ...(row.quantityProduced !== undefined ? { quantityProduced: row.quantityProduced } : {}),
            ...(row.workersCount !== undefined ? { workersCount: row.workersCount } : {}),
            ...(row.workHours !== undefined ? { workHours: row.workHours } : {}),
          });
          if (!updated) failed++;
        } catch {
          failed++;
        }
        done++;
        setImportProgress({ done, total: validRows.length });
        setJobProgress(jobId, {
          processedRows: done,
          totalRows: validRows.length,
          statusText: 'Updating report fields...',
          status: 'processing',
        });
      }

      const updatedRows = Math.max(0, done - failed);
      if (updatedRows === 0 && failed > 0) {
        failJob(jobId, 'All rows failed during update', 'Failed');
      } else {
        completeJob(jobId, {
          addedRows: updatedRows,
          failedRows: failed,
          statusText: 'Completed',
        });
      }
      setImportSaving(false);
      return;
    }

    if (!importResult) return;
    const validRows = importResult.rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;
    const jobId = addJob({
      fileName: importFileName || 'reports.xlsx',
      jobType: 'Reports Import',
      totalRows: validRows.length,
      startedBy: userDisplayName || 'Current User',
    });

    setImportSaving(true);
    setImportProgress({ done: 0, total: validRows.length });
    startJob(jobId, 'Saving to database...');
    // Close preview immediately; import continues in background jobs panel.
    setShowImportModal(false);
    resetImportState();
    setImportFileName('');

    let done = 0;
    let failed = 0;
    for (const row of validRows) {
      try {
        const created = await createReport(toReportData(row));
        if (!created) failed++;
      } catch {
        failed++;
      }
      done++;
      setImportProgress({ done, total: validRows.length });
      setJobProgress(jobId, {
        processedRows: done,
        totalRows: validRows.length,
        statusText: 'Saving to database...',
        status: 'processing',
      });
    }

    const addedRows = Math.max(0, done - failed);
    if (addedRows === 0 && failed > 0) {
      failJob(jobId, 'All rows failed during save', 'Failed');
    } else {
      completeJob(jobId, {
        addedRows,
        failedRows: failed,
        statusText: 'Completed',
      });
    }
    setImportSaving(false);
  };

  // ── SelectableTable config ──────────────────────────────────────────────────

  const reportColumns = useMemo<TableColumn<ProductionReport>[]>(() => {
    const getNoteRowKey = (r: ProductionReport) =>
      r.id ?? `${r.date}-${r.lineId}-${r.productId}-${r.employeeId}`;

    const cols: TableColumn<ProductionReport>[] = [
      {
        header: 'كود التقرير',
        render: (r) => {
          const wo = r.workOrderId ? woMap.get(r.workOrderId) : undefined;
          const hasQuality = !!wo?.qualitySummary || !!wo?.qualityStatus || !!wo?.qualityReportCode;
          if (!can('quality.reports.view') || !hasQuality) {
            return (
              <span className="font-mono text-xs font-bold text-primary">
                {r.reportCode || '—'}
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewQualityReport(r);
              }}
              className="font-mono text-xs font-bold text-primary hover:underline"
              title="عرض تقرير الجودة المرتبط"
            >
              {r.reportCode || '—'}
            </button>
          );
        },
      },
      { header: 'التاريخ', render: (r) => <span className="font-bold text-[var(--color-text)]">{r.date}</span> },
      {
        header: 'خط الإنتاج',
        render: (r) => {
          const lineName = getLineName(r.lineId);
          return (
            <span className="block max-w-[130px] truncate font-medium" title={lineName}>
              {lineName}
            </span>
          );
        },
      },
      {
        header: 'المنتج',
        render: (r) => {
          const productName = getProductName(r.productId, r.reportType);
          return (
            <span className="block max-w-[210px] truncate font-medium" title={productName}>
              {productName}
            </span>
          );
        },
      },
      {
        header: 'الموظف',
        render: (r) => {
          const employeeName = getEmployeeName(r.employeeId);
          return (
            <span className="block max-w-[140px] truncate font-medium" title={employeeName}>
              {employeeName}
            </span>
          );
        },
      },
      {
        header: 'الكمية المنتجة',
        headerClassName: 'text-center',
        className: 'text-center',
        render: (r) => (
          <span className="px-2.5 py-1 rounded-[var(--border-radius-base)] bg-emerald-50 text-emerald-600 text-sm font-bold ring-1 ring-emerald-500/20">
            {formatNumber(r.quantityProduced)}
          </span>
        ),
      },
      {
        header: 'هالك المكونات',
        headerClassName: 'text-center',
        className: 'text-center text-rose-500 font-bold',
        render: (r) => <>{formatNumber(deriveReportWaste(r))}</>,
      },
      {
        id: 'notes',
        header: 'الملحوظة',
        hideable: true,
        render: (r) => {
          const note = r.notes?.trim() || '';
          if (!note) return <span className="text-[var(--color-text-muted)]">—</span>;

          const rowKey = getNoteRowKey(r);
          const isExpanded = expandedNoteRows.has(rowKey);
          const shouldTruncate = note.length > NOTE_PREVIEW_LENGTH;
          const preview = shouldTruncate ? `${note.slice(0, NOTE_PREVIEW_LENGTH)} ...` : note;

          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!shouldTruncate) return;
                setExpandedNoteRows((prev) => {
                  const next = new Set(prev);
                  if (next.has(rowKey)) next.delete(rowKey);
                  else next.add(rowKey);
                  return next;
                });
              }}
              className={`text-sm text-right block max-w-[220px] ${isExpanded ? 'whitespace-normal' : 'truncate whitespace-nowrap'} ${shouldTruncate ? 'text-primary hover:underline cursor-pointer' : 'text-slate-600 cursor-default'}`}
              title={shouldTruncate ? (isExpanded ? 'اضغط للإخفاء' : 'اضغط للعرض') : note}
            >
              {isExpanded ? note : preview}
            </button>
          );
        },
        sortKey: (r) => r.notes ?? '',
      },
      {
        header: 'عمال',
        headerClassName: 'text-center',
        className: 'text-center font-bold',
        render: (r) => (
          <button
            onClick={(e) => { e.stopPropagation(); handleViewWorkers(r); }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--border-radius-base)] hover:bg-primary/10 text-primary transition-colors"
            title="عرض العمالة"
          >
            {r.workersCount}
            <ReportIcon name="groups" className="text-xs" />
          </button>
        ),
      },
      {
        header: 'تفصيل العمالة',
        render: (r) => (
          <span className="inline-block whitespace-nowrap text-[11px] font-bold text-[var(--color-text-muted)]">
            إ:{r.workersProductionCount ?? 0} | ت:{r.workersPackagingCount ?? 0} | ج:{r.workersQualityCount ?? 0} | ص:{r.workersMaintenanceCount ?? 0} | خ:{r.workersExternalCount ?? 0}
          </span>
        ),
      },
      { header: 'ساعات', headerClassName: 'text-center', className: 'text-center font-bold', render: (r) => <>{r.workHours}</> },
      {
        header: 'أمر شغل',
        headerClassName: 'text-center',
        className: 'text-center',
        render: (r) => {
          if (!r.workOrderId) return <span className="text-sm text-[var(--color-text-muted)]">—</span>;
          const wo = woMap.get(r.workOrderId);
          if (!wo) return <span className="text-sm text-[var(--color-text-muted)]">—</span>;
          return (
            <button
              onClick={(e) => { e.stopPropagation(); setViewWOReport(r); }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--border-radius-base)] hover:bg-primary/10 text-primary transition-colors text-sm font-bold"
              title="عرض تفاصيل أمر الشغل"
            >
              {wo.workOrderNumber}
              <ReportIcon name="assignment" className="text-xs" />
            </button>
          );
        },
      },
      {
        header: 'تقرير الجودة',
        render: (r) => {
          const wo = r.workOrderId ? woMap.get(r.workOrderId) : undefined;
          const hasQuality = !!wo?.qualitySummary || !!wo?.qualityStatus || !!wo?.qualityReportCode;
          if (!hasQuality) return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
          const qm = qualityStatusMeta(wo.qualityStatus);
          const qualityCode = getQualityReportCode(wo, r.reportCode);
          const qualityTitle = wo.qualitySummary
            ? `عرض تقرير الجودة — ${qualityCode || '—'} — فحص: ${formatNumber(wo.qualitySummary.inspectedUnits)} | فاشل: ${formatNumber(wo.qualitySummary.failedUnits)}`
            : `عرض تقرير الجودة — ${qualityCode || '—'}`;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewQualityReport(r);
              }}
              className="inline-flex items-center gap-1.5 hover:bg-primary/5 rounded-[var(--border-radius-base)] px-2 py-1 transition-colors whitespace-nowrap"
              title={qualityTitle}
            >
              <span className={`inline-flex text-xs font-bold px-2 py-0.5 rounded-full ${qm.className}`}>
                {qm.label}
              </span>
              <span className="text-[11px] font-bold text-[var(--color-text-muted)]">
                {qualityCode || '—'}
              </span>
            </button>
          );
        },
      },
    ];
    if (canViewCosts) {
      cols.push({
        header: 'تكلفة الوحدة',
        headerClassName: 'text-center',
        className: 'text-center',
        render: (r) =>
          r.id && reportCosts.get(r.id) ? (
            <span className="text-sm font-bold text-primary">{formatCost(reportCosts.get(r.id)!)} ج.م</span>
          ) : (
            <span className="text-sm text-[var(--color-text-muted)]">—</span>
          ),
      });
    }
    return cols;
  }, [canViewCosts, expandedNoteRows, getLineName, getProductName, getEmployeeName, reportCosts, woMap, can, qualityStatusMeta, getQualityReportCode]);

  const handleBulkPrintSelected = useCallback(async (items: ProductionReport[]) => {
    setBulkPrintSource(items);
    await new Promise((r) => setTimeout(r, 300));
    await triggerBulkPrint();
    setTimeout(() => setBulkPrintSource(null), 1000);
  }, [triggerBulkPrint]);

  const handleBulkPrintSelectedAsSinglePagesPdf = useCallback(async (items: ProductionReport[]) => {
    if (!items.length) return;
    const rows = items.map((item) => buildReportRow(item));
    bulkSinglePrintRefs.current = [];
    setBulkSinglePrintRows(rows);
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 350));
      const printableElements = bulkSinglePrintRefs.current
        .slice(0, rows.length)
        .filter((el): el is HTMLDivElement => !!el);
      if (!printableElements.length) return;
      await exportElementsToSinglePDF(
        printableElements,
        `تقارير-الإنتاج-منفصلة-${startDate}`,
        {
          paperSize: printTemplate?.paperSize,
          orientation: printTemplate?.orientation,
          copies: 1,
        },
      );
    } finally {
      setExporting(false);
      setBulkSinglePrintRows(null);
      bulkSinglePrintRefs.current = [];
    }
  }, [buildReportRow, printTemplate?.paperSize, printTemplate?.orientation, startDate]);

  const handleBulkDeleteConfirmed = useCallback(async () => {
    if (!bulkDeleteItems) return;
    setBulkDeleting(true);
    let deletedCount = 0;
    const failedMessages: string[] = [];
    for (const item of bulkDeleteItems) {
      if (!item.id) continue;
      try {
        await deleteReport(item.id);
        deletedCount += 1;
      } catch (error: any) {
        const code = item.reportCode || item.id;
        failedMessages.push(`${code}: ${error?.message || 'تعذر الحذف'}`);
      }
    }
    setBulkDeleting(false);
    setBulkDeleteItems(null);
    if (failedMessages.length === 0) {
      setSaveToastType('success');
      setSaveToast(`تم حذف ${deletedCount} تقرير بنجاح`);
      setTimeout(() => setSaveToast(null), 3500);
      return;
    }

    setSaveToastType('error');
    if (deletedCount > 0) {
      setSaveToast(`تم حذف ${deletedCount} تقرير، وتعذر حذف ${failedMessages.length}.`);
    } else {
      setSaveToast(`تعذر حذف ${failedMessages.length} تقرير. ${failedMessages[0]}`);
    }
    setTimeout(() => setSaveToast(null), 6000);
  }, [bulkDeleteItems, deleteReport]);

  const reportBulkActions = useMemo<TableBulkAction<ProductionReport>[]>(() => {
    const actions: TableBulkAction<ProductionReport>[] = [
      { label: 'طباعة المحدد', icon: 'print', action: handleBulkPrintSelected, permission: 'print' },
      { label: 'طباعة منفصلة PDF', icon: 'picture_as_pdf', action: handleBulkPrintSelectedAsSinglePagesPdf, permission: 'print' },
      { label: 'حذف المحدد', icon: 'delete', action: (items) => setBulkDeleteItems(items), permission: 'reports.delete', variant: 'danger' },
    ];
    if (canExportFromPage) {
      actions.splice(1, 0, {
        label: 'تصدير المحدد',
        icon: 'download',
        action: (items) => exportReportsByDateRange(items, startDate, endDate, lookups, canViewCosts ? reportCosts : undefined),
        permission: 'export',
      });
    }
    return actions;
  }, [handleBulkPrintSelected, handleBulkPrintSelectedAsSinglePagesPdf, canExportFromPage, startDate, endDate, lookups, canViewCosts, reportCosts]);

  const renderReportActions = (report: ProductionReport) => (
    <div className="flex min-w-[170px] flex-nowrap items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      {can("print") && (
        <>
          <button onClick={() => triggerSingleShare(report)} className="p-2 text-[var(--color-text-muted)] hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 rounded-[var(--border-radius-base)] transition-all" title="مشاركة عبر واتساب" disabled={exporting}>
            <ReportIcon name="share" className="text-lg" />
          </button>
          <button onClick={() => triggerSinglePrint(report)} className="p-2 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/5 rounded-[var(--border-radius-base)] transition-all" title="طباعة التقرير">
            <ReportIcon name="print" className="text-lg" />
          </button>
        </>
      )}
      {can("reports.edit") && (
        <button onClick={() => openEdit(report)} className="p-2 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/5 rounded-[var(--border-radius-base)] transition-all" title="تعديل التقرير">
          <ReportIcon name="edit" className="text-lg" />
        </button>
      )}
      {can("reports.delete") && (
        <button type="button" onClick={() => requestDeleteReport(report)} className="p-2 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-[var(--border-radius-base)] transition-all" title="حذف التقرير">
          <ReportIcon name="delete" className="text-lg" />
        </button>
      )}
    </div>
  );

  const handleExportFilteredReports = useCallback(async () => {
    if (!canExportFromPage) return;
    const from = viewMode === 'today' ? getOperationalDateString(8) : startDate;
    const to = viewMode === 'today' ? getOperationalDateString(8) : endDate;
    setExporting(true);
    try {
      const allRangeReports = await reportService.getByDateRange(from, to);
      const filtered = sortReports(applyReportFilters(allRangeReports));
      if (filtered.length === 0) {
        setSaveToastType('error');
        setSaveToast('لا توجد بيانات مطابقة للتصدير');
        setTimeout(() => setSaveToast(null), 3000);
        return;
      }
      const exportCosts = canViewCosts
        ? buildReportsCosts(
            filtered,
            laborSettings?.hourlyRate ?? 0,
            costCenters,
            costCenterValues,
            costAllocations,
            supervisorHourlyRates,
          )
        : undefined;
      exportReportsByDateRange(filtered, from, to, lookups, exportCosts);
    } catch (error) {
      setSaveToastType('error');
      setSaveToast((error as Error)?.message || 'تعذر التصدير. حاول مرة أخرى.');
      setTimeout(() => setSaveToast(null), 3500);
    } finally {
      setExporting(false);
    }
  }, [
    canExportFromPage,
    viewMode,
    startDate,
    endDate,
    sortReports,
    applyReportFilters,
    canViewCosts,
    laborSettings,
    costCenters,
    costCenterValues,
    costAllocations,
    supervisorHourlyRates,
    lookups,
  ]);

  const reportTableFooter = (
    <div className="px-6 py-4 bg-[#f8f9fa]/50 border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-[var(--color-text-muted)] font-bold">إجمالي <span className="text-primary">{displayedReports.length}</span> تقرير</span>
      {displayedReports.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
          <span className="text-emerald-600">إنتاج: {formatNumber(displayedReports.reduce((s, r) => s + r.quantityProduced, 0))}</span>
          <span className="text-rose-500">هالك: {formatNumber(displayedReports.reduce((s, r) => s + deriveReportWaste(r), 0))}</span>
        </div>
      )}
    </div>
  );

  const factoryGeneralSummary = useMemo(() => {
    const totals = factoryGeneralRows.reduce(
      (acc, row) => {
        acc.produced += row.totalProducedQty;
        acc.productionWorkers += row.productionWorkers;
        acc.totalCost += row.totalCost;
        acc.reports += row.reportsCount;
        return acc;
      },
      { produced: 0, productionWorkers: 0, totalCost: 0, reports: 0 },
    );
    const avgUnitCost = totals.produced > 0 ? totals.totalCost / totals.produced : 0;
    return { ...totals, avgUnitCost };
  }, [factoryGeneralRows]);

  const toggleFactorySort = useCallback((key: FactoryGeneralSortKey) => {
    if (key === factorySortKey) {
      setFactorySortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setFactorySortKey(key);
    setFactorySortDirection('asc');
  }, [factorySortKey]);

  const renderFactorySortHeader = useCallback((label: string, key: FactoryGeneralSortKey, centered = false) => {
    const isActive = factorySortKey === key;
    const icon = !isActive ? 'unfold_more' : (factorySortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward');
    return (
      <button
        type="button"
        className={`w-full flex items-center gap-1 ${centered ? 'justify-center' : 'justify-start'} hover:text-primary transition-colors`}
        onClick={() => toggleFactorySort(key)}
        title={`فرز حسب ${label}`}
      >
        <span>{label}</span>
        <ReportIcon name={icon} className={`text-sm ${isActive ? 'text-primary' : 'text-[var(--color-text-muted)]'}`} />
      </button>
    );
  }, [factorySortKey, factorySortDirection, toggleFactorySort]);

  const importValidCount = importMode === 'updateDate'
    ? (importDateUpdateResult?.validCount ?? 0)
    : (importResult?.validCount ?? 0);
  const hasImportPreview = importMode === 'updateDate' ? !!importDateUpdateResult : !!importResult;

  return (
    <div className="erp-ds-clean space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* ── Page Header ────────────────────────────────────── */}
      <PageHeader
        title="تقارير الإنتاج"
        subtitle="إنشاء ومراجعة تقارير الإنتاج اليومية"
        icon="bar_chart"
        secondaryAction={can('reports.edit') ? {
          label: 'عرض التقرير العام الشهري',
          icon: 'insights',
          onClick: () => { void handleShowGeneralMonthly(); },
        } : undefined}
        primaryAction={canCreateFinishedReports ? {
          label: 'إنشاء تقرير',
          icon: 'add',
          onClick: openCreate,
          dataModalKey: 'reports.create',
        } : undefined}
        moreActions={[
          {
            label: 'إنشاء تقرير مكون حقن',
            icon: 'add_circle',
            group: 'التقارير',
            hidden: !canManageComponentInjectionReports,
            onClick: openCreateComponent,
          },
          {
            label: 'تقرير المصنع العام Excel',
            icon: 'analytics',
            group: 'تصدير',
            hidden: !canExportFromPage || factoryGeneralRows.length === 0,
            onClick: () => exportFactoryGeneralReport(factoryGeneralExportRows, startDate, endDate),
          },
          {
            label: 'تقارير Excel',
            icon: 'table_chart',
            group: 'تصدير',
            hidden: !canExportFromPage || displayedReports.length === 0,
            onClick: () => { void handleExportFilteredReports(); },
          },
          {
            label: 'أوامر الشغل Excel',
            icon: 'assignment',
            group: 'تصدير',
            hidden: !canExportFromPage || !can('workOrders.view') || workOrders.length === 0,
            onClick: () => exportWorkOrders(workOrders, { getProductName, getLineName, getSupervisorName: getEmployeeName }),
          },
          {
            label: 'طباعة',
            icon: 'print',
            group: 'تصدير',
            hidden: !canExportFromPage || displayedReports.length === 0,
            disabled: exporting,
            onClick: triggerBulkPrint,
          },
          {
            label: exporting ? 'جاري التصدير...' : 'تصدير PDF',
            icon: 'picture_as_pdf',
            group: 'تصدير',
            hidden: !canExportFromPage || displayedReports.length === 0,
            disabled: exporting,
            onClick: handlePDF,
          },
          {
            label: 'مشاركة واتساب',
            icon: 'share',
            group: 'تصدير',
            hidden: !canExportFromPage || displayedReports.length === 0,
            disabled: exporting,
            onClick: handleWhatsApp,
          },
          {
            label: 'تحميل القالب',
            icon: 'file_download',
            group: 'استيراد',
            hidden: !canImportFromPage,
            onClick: () => downloadReportsTemplate(templateLookups),
          },
          {
            label: 'رفع Excel',
            icon: 'upload_file',
            group: 'استيراد',
            hidden: !canImportFromPage,
            onClick: () => fileInputRef.current?.click(),
          },
          {
            label: 'تقارير الجودة',
            icon: 'verified',
            hidden: !can('quality.reports.view'),
            onClick: () => { window.location.hash = '#/quality/reports'; },
          },
          {
            label: syncingMissingTransfers ? 'جاري المزامنة...' : 'مزامنة تحويلات ناقصة',
            icon: 'sync',
            group: 'أدوات',
            hidden: !can('reports.edit'),
            disabled: syncingMissingTransfers,
            onClick: handleSyncMissingTransfers,
          },
          {
            label: backfillingUnlinkedReports ? 'جاري الربط...' : 'ربط التقارير القديمة',
            icon: 'auto_fix_high',
            group: 'أدوات',
            hidden: !can('reports.edit'),
            disabled: backfillingUnlinkedReports,
            onClick: handleBackfillUnlinkedReports,
          },
          {
            label: unlinkingReportWorkOrders ? 'جاري فك الربط...' : 'فك ربط أوامر الشغل',
            icon: 'link_off',
            group: 'أدوات',
            hidden: !can('reports.edit'),
            disabled: unlinkingReportWorkOrders,
            onClick: handleUnlinkReportWorkOrders,
          },
        ]}
      />


      {/* WhatsApp Share Feedback */}
      {shareToast && (
        <div className="erp-alert erp-alert-success erp-animate-in">
          <ReportIcon name="share" className="text-[18px] shrink-0" />
          <p className="flex-1">{shareToast}</p>
          <button onClick={() => setShareToast(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <ReportIcon name="close" className="text-[16px]" />
          </button>
        </div>
      )}

      {/* Reports Table */}
      {rangeError && (viewMode === 'range' || viewMode === 'general') && (
        <div className="erp-alert erp-alert-warning">
          <ReportIcon name="warning" className="text-[18px] shrink-0" />
          <span>{rangeError}</span>
        </div>
      )}
      {viewMode === 'general' ? (
        <Card className="!p-0 overflow-hidden">
          <div className="p-4 border-b border-[var(--color-border)] bg-[#f8f9fa]/40 flex flex-col md:flex-row md:items-center gap-3">
            <Button variant="secondary" onClick={handleBackToReports}>
              <ReportIcon name="arrow_forward" className="text-sm" />
              رجوع إلى التقارير
            </Button>
            <input
              className="w-full md:max-w-md rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[var(--color-card)]"
              value={factorySearch}
              onChange={(e) => setFactorySearch(e.target.value)}
              placeholder="بحث بالخط أو المشرف أو الصنف"
            />
            <div className="text-xs md:mr-auto font-bold text-[var(--color-text-muted)]">
              إجمالي {factoryGeneralRows.length} صف | إنتاج {formatNumber(factoryGeneralSummary.produced)} | تقارير {formatNumber(factoryGeneralSummary.reports)}
            </div>
          </div>
          {factoryGeneralSortedRows.length === 0 ? (
            <div className="py-16 text-center text-[var(--color-text-muted)]">
              لا توجد بيانات مطابقة للتقرير العام في هذه الفترة.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">{renderFactorySortHeader('الخط', 'lineName')}</th>
                    <th className="erp-th">{renderFactorySortHeader('المشرف', 'supervisorName')}</th>
                    <th className="erp-th">{renderFactorySortHeader('الصنف', 'productName')}</th>
                    <th className="erp-th text-center">{renderFactorySortHeader('الصنف المحقق', 'totalProducedQty', true)}</th>
                    <th className="erp-th text-center">{renderFactorySortHeader('عمال الإنتاج', 'productionWorkers', true)}</th>
                    <th className="erp-th text-center">{renderFactorySortHeader('متوسط العمال/تقرير', 'avgWorkersPerReport', true)}</th>
                    <th className="erp-th text-center">{renderFactorySortHeader('تكلفة القطعة', 'unitCost', true)}</th>
                    <th className="erp-th text-center">{renderFactorySortHeader('إجمالي الأيام', 'totalDays', true)}</th>
                    <th className="erp-th text-center">{renderFactorySortHeader('عدد التقارير', 'reportsCount', true)}</th>
                    <th className="erp-th text-center">{renderFactorySortHeader('رصيد المفكك', 'decomposedBalance', true)}</th>
                    <th className="erp-th text-center">{renderFactorySortHeader('رصيد تم الصنع', 'finishedBalance', true)}</th>
                    <th className="erp-th text-center">{renderFactorySortHeader('رصيد منتج تام', 'finalProductBalance', true)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {factoryGeneralSortedRows.map((row) => (
                    <tr key={row.key} className="hover:bg-[#f8f9fa]/70/40">
                      <td className="px-4 py-3 text-sm font-bold">{row.lineName}</td>
                      <td className="px-4 py-3 text-sm">{row.supervisorName}</td>
                      <td className="px-4 py-3 text-sm">{row.productName}</td>
                      <td className="px-4 py-3 text-sm text-center font-bold tabular-nums">{formatNumber(row.totalProducedQty)}</td>
                      <td className="px-4 py-3 text-sm text-center tabular-nums">{formatNumber(row.productionWorkers)}</td>
                      <td className="px-4 py-3 text-sm text-center tabular-nums">{formatNumber(row.avgWorkersPerReport)}</td>
                      <td className="px-4 py-3 text-sm text-center tabular-nums">
                        {canViewCosts ? formatCost(row.unitCost) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center tabular-nums">{formatNumber(row.totalDays)}</td>
                      <td className="px-4 py-3 text-sm text-center tabular-nums">{formatNumber(row.reportsCount)}</td>
                      <td className="px-4 py-3 text-sm text-center tabular-nums">{formatNumber(row.decomposedBalance)}</td>
                      <td className="px-4 py-3 text-sm text-center tabular-nums">{formatNumber(row.finishedBalance)}</td>
                      <td className="px-4 py-3 text-sm text-center tabular-nums">{formatNumber(row.finalProductBalance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#f8f9fa] font-bold">
                    <td className="px-4 py-3 text-sm" colSpan={3}>الإجمالي</td>
                    <td className="px-4 py-3 text-sm text-center tabular-nums">{formatNumber(factoryGeneralSummary.produced)}</td>
                    <td className="px-4 py-3 text-sm text-center tabular-nums">{formatNumber(factoryGeneralSummary.productionWorkers)}</td>
                    <td className="px-4 py-3 text-sm text-center">—</td>
                    <td className="px-4 py-3 text-sm text-center tabular-nums">{canViewCosts ? formatCost(factoryGeneralSummary.avgUnitCost) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-center">—</td>
                    <td className="px-4 py-3 text-sm text-center tabular-nums">{formatNumber(factoryGeneralSummary.reports)}</td>
                    <td className="px-4 py-3 text-sm text-center">—</td>
                    <td className="px-4 py-3 text-sm text-center">—</td>
                    <td className="px-4 py-3 text-sm text-center">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      ) : (
        reportGroupBy !== 'none' ? (
          <div className="space-y-4">
            <Card className="!p-0 overflow-hidden">
              {tableToolbarFilters}
            </Card>
            {groupedReports.length === 0 ? (
              <Card>
                <div className="py-16 text-center text-[var(--color-text-muted)]">
                  لا توجد تقارير{viewMode === 'today' ? ' لهذا اليوم' : ' في هذه الفترة'}
                </div>
              </Card>
            ) : groupedReports.map((group) => (
              <Card key={group.key} className="!p-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[#f8f9fa]/60 flex flex-wrap items-center gap-3">
                  <span className="text-sm font-black text-[var(--color-text)]">{group.label || 'غير محدد'}</span>
                  <span className="text-xs font-bold text-[var(--color-text-muted)]">{group.reports.length} تقرير</span>
                  <span className="text-xs font-bold text-emerald-600">إنتاج: {formatNumber(group.produced)}</span>
                  <span className="text-xs font-bold text-rose-500">هالك: {formatNumber(group.waste)}</span>
                </div>
                <SelectableTable<ProductionReport>
                  tableId={`production-reports-${reportGroupBy}-${group.key}`}
                  data={group.reports}
                  columns={reportColumns}
                  selectAllScope="filtered"
                  enableColumnVisibility
                  toolbarContent={null}
                  highlightRowId={highlightReportId}
                  getId={(r) => r.id || r.reportCode || `${r.date}-${r.lineId}-${r.employeeId}-${r.productId}`}
                  bulkActions={reportBulkActions}
                  renderActions={renderReportActions}
                  onRowClick={(row) => {
                    setSelectedReportDrawer(row);
                    setReportDrawerTab('summary');
                  }}
                  emptyIcon="bar_chart"
                  emptyTitle={`لا توجد تقارير${viewMode === 'today' ? ' لهذا اليوم' : ' في هذه الفترة'}`}
                  emptySubtitle={can("reports.create") ? 'اضغط "إنشاء تقرير" لإضافة تقرير جديد' : 'لا توجد تقارير لعرضها حالياً'}
                />
              </Card>
            ))}
            {reportTableFooter}
          </div>
        ) : (
          <SelectableTable<ProductionReport>
            tableId="production-reports-main"
            data={displayedReports}
            columns={reportColumns}
            selectAllScope="filtered"
            enableColumnVisibility
            toolbarContent={tableToolbarFilters}
            highlightRowId={highlightReportId}
            getId={(r) => r.id || r.reportCode || `${r.date}-${r.lineId}-${r.employeeId}-${r.productId}`}
            bulkActions={reportBulkActions}
            renderActions={renderReportActions}
            onRowClick={(row) => {
              setSelectedReportDrawer(row);
              setReportDrawerTab('summary');
            }}
            emptyIcon="bar_chart"
            emptyTitle={`لا توجد تقارير${viewMode === 'today' ? ' لهذا اليوم' : ' في هذه الفترة'}`}
            emptySubtitle={can("reports.create") ? 'اضغط "إنشاء تقرير" لإضافة تقرير جديد' : 'لا توجد تقارير لعرضها حالياً'}
            footer={reportTableFooter}
          />
        )
      )}
      {viewMode === 'range' && (
        <div className="flex items-center justify-center">
          <Button
            variant="secondary"
            onClick={() => void handleLoadMoreRange()}
            disabled={!rangeHasMore || rangeLoading}
          >
            {rangeLoading ? 'جاري التحميل...' : (rangeHasMore ? 'تحميل المزيد' : 'تم تحميل كل النتائج')}
          </Button>
        </div>
      )}

      {/* ══ Hidden print components (off-screen, only rendered for print) ══ */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        {shareCardReport && (
          <div style={{ width: '420px', background: '#fff' }}>
            <ReportShareCard ref={shareCardRef} report={shareCardReport} companyName="مؤسسة المغربي" />
          </div>
        )}
        <ProductionReportPrint
          ref={bulkPrintRef}
          title={viewMode === 'today' ? `تقارير إنتاج اليوم — ${getOperationalDateString(8)}` : `تقارير الإنتاج — ${startDate} إلى ${endDate}`}
          subtitle={`${printRows.length} تقرير`}
          rows={printRows}
          totals={printTotals}
          printSettings={printTemplate}
        />
        <SingleReportPrint ref={singlePrintRef} report={printReport} printSettings={printTemplate} />
        {bulkSinglePrintRows?.map((row, idx) => (
          <SingleReportPrint
            key={`${row.reportId || row.date}-${idx}`}
            ref={(el) => {
              bulkSinglePrintRefs.current[idx] = el;
            }}
            report={row}
            printSettings={printTemplate}
          />
        ))}
      </div>

      {/* ══ Report Drawer ══ */}
      {selectedReportDrawer && (() => {
        const row = selectedReportDrawer;
        const unitCost = row.id ? Number(reportCosts.get(row.id) || 0) : 0;
        const totalCost = unitCost * Number(row.quantityProduced || 0);
        const linkedWo = row.workOrderId ? woMap.get(row.workOrderId) : null;
        const reportTypeLabel = row.reportType === 'component_injection' ? 'تقرير حقن مكونات' : 'تقرير منتج نهائي';
        return (
          <>
            <div
              className="fixed inset-0 bg-black/35 z-[60]"
              onClick={() => setSelectedReportDrawer(null)}
            />
            <aside
              className="fixed top-0 right-0 h-screen w-[min(460px,96vw)] bg-[var(--color-card)] border-l border-[var(--color-border)] shadow-2xl z-[61] overflow-y-auto flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                <div>
                  <h3 className="font-black text-[var(--color-text)] text-sm">
                    {row.reportCode || '—'} <span className="text-[var(--color-text-muted)]">| {row.date}</span>
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">{reportTypeLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReportDrawer(null)}
                  className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  <ReportIcon name="close" />
                </button>
              </div>

              <div className="px-4 py-3 border-b border-[var(--color-border)]">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-[var(--color-text-muted)] block mb-1">الخط</span>
                    <span className="font-bold">{getLineName(row.lineId)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-[var(--color-text-muted)] block mb-1">المشرف</span>
                    <span className="font-bold">{getEmployeeName(row.employeeId)}</span>
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-xs text-[var(--color-text-muted)] block mb-1">المنتج</span>
                  <span className="font-bold text-sm">{getProductName(row.productId, row.reportType)}</span>
                </div>
              </div>

              <div className="px-4 pt-3">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { label: 'summary', text: 'الملخص' },
                    { label: 'cost', text: 'التكلفة' },
                    { label: 'notes', text: 'الملاحظات' },
                  ] as const).map((tab) => (
                    <button
                      key={tab.label}
                      type="button"
                      onClick={() => setReportDrawerTab(tab.label)}
                      className={`h-8 rounded-[var(--border-radius-base)] text-xs font-bold border ${
                        reportDrawerTab === tab.label
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                      }`}
                    >
                      {tab.text}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 flex-1">
                {reportDrawerTab === 'summary' && (
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                        <span className="text-xs text-[var(--color-text-muted)] block mb-1">الكمية المنتجة</span>
                        <span className="font-black text-emerald-600">{formatNumber(row.quantityProduced)}</span>
                      </div>
                      <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                        <span className="text-xs text-[var(--color-text-muted)] block mb-1">هالك</span>
                        <span className="font-black text-rose-600">{formatNumber(deriveReportWaste(row))}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                        <span className="text-xs text-[var(--color-text-muted)] block mb-1">عدد العمال</span>
                        <span className="font-bold">{formatNumber(row.workersCount)}</span>
                      </div>
                      <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                        <span className="text-xs text-[var(--color-text-muted)] block mb-1">ساعات العمل</span>
                        <span className="font-bold">{formatNumber(row.workHours)}</span>
                      </div>
                    </div>
                    <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 text-xs font-bold text-[var(--color-text-muted)]">
                      إ:{row.workersProductionCount ?? 0} | ت:{row.workersPackagingCount ?? 0} | ج:{row.workersQualityCount ?? 0} | ص:{row.workersMaintenanceCount ?? 0} | خ:{row.workersExternalCount ?? 0}
                    </div>
                  </div>
                )}

                {reportDrawerTab === 'cost' && (
                  <div className="space-y-3 text-sm">
                    {canViewCosts ? (
                      <>
                        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                          <span className="text-xs text-[var(--color-text-muted)] block mb-1">تكلفة الوحدة</span>
                          <span className="font-black text-primary">
                            {unitCost > 0 ? `${formatCost(unitCost)} ج.م` : '—'}
                          </span>
                        </div>
                        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                          <span className="text-xs text-[var(--color-text-muted)] block mb-1">التكلفة الإجمالية</span>
                          <span className="font-black text-[var(--color-text)]">
                            {unitCost > 0 ? `${formatCost(totalCost)} ج.م` : '—'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 text-sm text-[var(--color-text-muted)]">
                        لا تملك صلاحية عرض التكلفة.
                      </div>
                    )}
                  </div>
                )}

                {reportDrawerTab === 'notes' && (
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 text-sm">
                    {row.notes?.trim() ? row.notes : 'لا توجد ملاحظات.'}
                  </div>
                )}
              </div>

              <div className="sticky bottom-10 bg-[var(--color-card)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[var(--color-border)] grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerSinglePrint(row);
                  }}
                  className="h-9 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-xs font-bold"
                >
                  طباعة
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openEdit(row);
                    setSelectedReportDrawer(null);
                  }}
                  className="h-9 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-xs font-bold"
                >
                  تعديل
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (linkedWo) {
                      setViewWOReport(row);
                      setSelectedReportDrawer(null);
                    }
                  }}
                  disabled={!linkedWo}
                  className="h-9 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-xs font-bold disabled:opacity-50"
                >
                  أمر الشغل
                </button>
              </div>
            </aside>
          </>
        );
      })()}

      {/* ══ Create / Edit Report Modal ══ */}
      {showModal && (canCreateFinishedReports || can("reports.edit") || canManageComponentInjectionReports) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="relative bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-xl border border-[var(--color-border)] max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold">
                {editId
                  ? (form.reportType === 'component_injection' ? 'تعديل تقرير مكون حقن' : 'تعديل تقرير إنتاج')
                  : (form.reportType === 'component_injection' ? 'إنشاء تقرير مكون حقن' : 'إنشاء تقرير إنتاج')}
              </h3>
              <button onClick={() => { setShowModal(false); setEditId(null); setSaveToast(null); }} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <ReportIcon name="close" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
              {saveToast && saveToastType === 'success' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-[var(--border-radius-lg)] p-3 flex items-center gap-2 animate-in fade-in duration-300">
                  <ReportIcon name="check_circle" className="text-emerald-500 text-lg" />
                  <p className="text-sm font-bold text-emerald-700 flex-1">{saveToast}</p>
                  <button onClick={() => setSaveToast(null)} className="text-emerald-400 hover:text-emerald-600 transition-colors">
                    <ReportIcon name="close" className="text-sm" />
                  </button>
                </div>
              )}
              {canChooseReportType && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">نوع التقرير</label>
                  <Select
                    value={form.reportType}
                    onValueChange={(value) => {
                      const nextType = value === 'component_injection' ? 'component_injection' : 'finished_product';
                      if (nextType === 'component_injection' && !canManageComponentInjectionReports) return;
                      if (nextType === 'finished_product' && forceInjectionOnly) return;
                      setForm({ ...form, reportType: nextType, workOrderId: '' });
                    }}
                  >
                    <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="finished_product">تقرير إنتاج عادي</SelectItem>
                      <SelectItem value="component_injection">تقرير مكون حقن</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Work Order Selector */}
              {!editId && can('workOrders.view') && (() => {
                const activeWOs = workOrders.filter((w) => {
                  if (w.status !== 'pending' && w.status !== 'in_progress') return false;
                  const woType = w.workOrderType === 'component_injection' ? 'component_injection' : 'finished_product';
                  const formType = form.reportType === 'component_injection' ? 'component_injection' : 'finished_product';
                  if (woType !== formType) return false;
                  if (!isSupervisorReporter || !currentEmployee?.id) return true;
                  return w.supervisorId === currentEmployee.id;
                });
                if (activeWOs.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                      <ReportIcon name="assignment" className="text-sm align-middle ml-1 text-primary inline" />
                      أمر شغل (اختياري)
                    </label>
                    <Select
                      value={form.workOrderId || 'none'}
                      onValueChange={(value) => {
                        const selectedWorkOrderId = value === 'none' ? '' : value;
                        const wo = activeWOs.find((w) => w.id === selectedWorkOrderId);
                        if (!wo) {
                          setForm({ ...form, workOrderId: '' });
                          return;
                        }
                        setForm({
                          ...form,
                          workOrderId: wo.id ?? '',
                          lineId: wo.lineId,
                          productId: wo.productId,
                          reportType: wo.workOrderType === 'component_injection' ? 'component_injection' : form.reportType,
                          employeeId: isSupervisorReporter && currentEmployee?.id ? currentEmployee.id : wo.supervisorId,
                        });
                      }}
                    >
                      <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                        <SelectValue placeholder="اختر أمر شغل لتعبئة البيانات تلقائياً" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">اختر أمر شغل لتعبئة البيانات تلقائياً</SelectItem>
                        {activeWOs.map((wo) => {
                          const pName = _rawProducts.find((p) => p.id === wo.productId)?.name ?? '';
                          const lName = _rawLines.find((l) => l.id === wo.lineId)?.name ?? '';
                          const remaining = wo.quantity - (wo.producedQuantity || 0);
                          return (
                            <SelectItem key={wo.id} value={wo.id!}>
                              {wo.workOrderNumber} — {pName} — {lName} — متبقي: {remaining} وحدة
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">التاريخ *</label>
                  <input
                    type="date"
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
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
                      onChange={(v) => setForm({ ...form, employeeId: v })}
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
                    onChange={(v) => setForm({ ...form, lineId: v, workOrderId: '' })}
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
                    onChange={(v) => setForm({ ...form, productId: v, workOrderId: '' })}
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
                    onChange={(e) => setForm({ ...form, quantityProduced: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <ReportIcon name="open_in_new" className="text-base" />
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
                      onChange={(e) => setForm({ ...form, workersCount: Number(e.target.value) })}
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
                      onChange={(e) => setForm({ ...form, workHours: Number(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[var(--color-text-muted)]">إجمالي العمالة (محسوب) *</label>
                      <input
                        type="number"
                        readOnly
                        className="w-full border border-[var(--color-border)] bg-[#f0f2f5]/70 rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-black text-primary"
                        value={formWorkersTotal || ''}
                        placeholder="0"
                      />
                      {formLineWorkers.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            handleViewWorkers({
                              ...form,
                              workersCount: formWorkersTotal,
                              id: editId || undefined,
                            } as ProductionReport)
                          }
                          className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                        >
                          <ReportIcon name="groups" className="text-xs" />
                          تم جلب {getOperatorsCount(formLineWorkers, form.employeeId)} عامل تشغيل مسجل — اضغط للعرض
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[var(--color-text-muted)]">ساعات العمل *</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                        value={form.workHours || ''}
                        onChange={(e) => setForm({ ...form, workHours: Number(e.target.value) })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة إنتاج</label>
                      <input
                        type="number"
                        min={0}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                        value={form.workersProductionCount || ''}
                        onChange={(e) => setForm({ ...form, workersProductionCount: Number(e.target.value) })}
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
                        onChange={(e) => setForm({ ...form, workersPackagingCount: Number(e.target.value) })}
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
                        onChange={(e) => setForm({ ...form, workersQualityCount: Number(e.target.value) })}
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
                        onChange={(e) => setForm({ ...form, workersMaintenanceCount: Number(e.target.value) })}
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
                        onChange={(e) => setForm({ ...form, workersExternalCount: Number(e.target.value) })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">ملحوظة</label>
                <textarea
                  rows={3}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all resize-y"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="اكتب أي ملاحظة إضافية للتقرير..."
                />
              </div>
            </div>
            {canViewCosts && effectiveFormWorkersCount > 0 && form.workHours > 0 && form.quantityProduced > 0 && form.lineId && (
              (() => {
                const selectedSupervisorRate = supervisorHourlyRates.get(form.employeeId) ?? 0;
                const est = estimateReportCost(
                  effectiveFormWorkersCount, form.workHours, form.quantityProduced,
                  laborSettings?.hourlyRate ?? 0,
                  selectedSupervisorRate > 0 ? selectedSupervisorRate : (laborSettings?.hourlyRate ?? 0),
                  form.lineId,
                  form.date,
                  costCenters, costCenterValues, costAllocations
                );
                return (
                  <div className="mx-4 sm:mx-6 mb-2 bg-primary/5 border border-primary/10 rounded-[var(--border-radius-lg)] p-4 flex flex-wrap items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-2">
                      <ReportIcon name="price_check" className="text-primary text-lg" />
                      <span className="text-xs font-bold text-slate-500">تكلفة تقديرية:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs font-bold">
                      <span className="text-[var(--color-text-muted)]">عمالة: <span className="text-[var(--color-text)]">{formatCost(est.laborCost)} ج.م</span></span>
                      <span className="text-[var(--color-text-muted)]">غير مباشرة: <span className="text-[var(--color-text)]">{formatCost(est.indirectCost)} ج.م</span></span>
                      <span className="text-primary font-black">الوحدة: {formatCost(est.costPerUnit)} ج.م</span>
                    </div>
                  </div>
                );
              })()
            )}
            {/* Linked plan info */}
            {form.lineId && form.productId && (() => {
              const linked = productionPlans.find(
                (p) => p.lineId === form.lineId && p.productId === form.productId && (p.status === 'in_progress' || p.status === 'planned')
              );
              const noActivePlan = !linked;
              const blockWithoutPlan = !planSettings?.allowReportWithoutPlan && noActivePlan && !editId;
              const overProduced = linked && !planSettings?.allowOverProduction && (linked.producedQuantity ?? 0) >= linked.plannedQuantity;

              return (
                <>
                  {linked && (
                    <div className="mx-4 sm:mx-6 mb-2 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 rounded-[var(--border-radius-lg)] p-3 flex items-center gap-3">
                      <ReportIcon name="event_available" className="text-emerald-600 text-lg" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-emerald-700">خطة مرتبطة</p>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-500">
                          {formatNumber(linked.producedQuantity ?? 0)} / {formatNumber(linked.plannedQuantity)} —
                          {' '}{Math.min(Math.round(((linked.producedQuantity ?? 0) / linked.plannedQuantity) * 100), 100)}%
                        </p>
                      </div>
                    </div>
                  )}
                  {blockWithoutPlan && (
                    <div className="mx-4 sm:mx-6 mb-2 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 rounded-[var(--border-radius-lg)] p-3 flex items-center gap-3">
                      <ReportIcon name="block" className="text-rose-500 text-lg" />
                      <p className="text-xs font-bold text-rose-600">لا يوجد خطة إنتاج نشطة لهذا الخط والمنتج — التقارير بدون خطة غير مسموحة</p>
                    </div>
                  )}
                  {overProduced && (
                    <div className="mx-4 sm:mx-6 mb-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 rounded-[var(--border-radius-lg)] p-3 flex items-center gap-3">
                      <ReportIcon name="warning" className="text-amber-500 text-lg" />
                      <p className="text-xs font-bold text-amber-600">تم الوصول للكمية المخططة — الإنتاج الزائد غير مسموح</p>
                    </div>
                  )}
                </>
              );
            })()}
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 shrink-0">
              {can('print') && (
                <Button
                  variant="outline"
                  onClick={() => handleSave(true)}
                  disabled={saving || !form.lineId || !form.productId || !form.employeeId || !form.quantityProduced || !form.workHours || (form.reportType !== 'component_injection' && formWorkersTotal <= 0)}
                >
                  {saving && <ReportIcon name="refresh" className="animate-spin text-sm" />}
                  <ReportIcon name="print" className="text-sm" />
                  حفظ وطباعة
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => handleSave(false)}
                disabled={saving || !form.lineId || !form.productId || !form.employeeId || !form.quantityProduced || !form.workHours || (form.reportType !== 'component_injection' && formWorkersTotal <= 0)}
              >
                {saving && <ReportIcon name="refresh" className="animate-spin text-sm" />}
                <ReportIcon name={editId ? 'save' : 'add'} className="text-sm" />
                {editId ? 'حفظ التعديلات' : 'حفظ التقرير'}
              </Button>
            </div>
            {saveToast && saveToastType === 'error' && (
              <div className="absolute inset-0 z-20 bg-black/35 backdrop-blur-[1px] flex items-center justify-center p-6">
                <div className="w-full max-w-md bg-rose-50 border border-rose-200 rounded-[var(--border-radius-lg)] p-4 flex items-start gap-3">
                  <ReportIcon name="error" className="text-rose-500 text-xl shrink-0" />
                  <p className="text-sm font-bold text-rose-700 flex-1 text-center">
                    {saveToast}
                  </p>
                  <button onClick={() => setSaveToast(null)} className="text-rose-400 hover:text-rose-600 transition-colors shrink-0">
                    <ReportIcon name="close" className="text-sm" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Delete Confirmation ══ */}
      {deleteConfirmId && can("reports.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!deleteBusy) setDeleteConfirmId(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ReportIcon name="delete_forever" className="text-rose-500 text-3xl" />
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد حذف التقرير</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف هذا التقرير؟</p>
            {deleteError && (
              <div className="mb-4 rounded-[var(--border-radius-base)] border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold px-3 py-2">
                {deleteError}
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={deleteBusy}>إلغاء</Button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleteBusy}
                className="px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20 transition-all flex items-center gap-2"
              >
                {deleteBusy ? (
                  <ReportIcon name="refresh" className="text-sm animate-spin" />
                ) : (
                  <ReportIcon name="delete" className="text-sm" />
                )}
                {deleteBusy ? 'جاري الحذف...' : 'نعم، احذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Bulk Delete Confirmation ══ */}
      {bulkDeleteItems && can("reports.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!bulkDeleting) setBulkDeleteItems(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ReportIcon name="delete_sweep" className="text-rose-500 text-3xl" />
            </div>
            <h3 className="text-lg font-bold mb-2">حذف {bulkDeleteItems.length} تقرير</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف التقارير المحددة؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setBulkDeleteItems(null)}
                disabled={bulkDeleting}
                className="px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm bg-[var(--color-card)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[#f8f9fa] transition-all disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleBulkDeleteConfirmed}
                disabled={bulkDeleting}
                className="px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {bulkDeleting ? (
                  <ReportIcon name="refresh" className="animate-spin text-sm" />
                ) : (
                  <ReportIcon name="delete" className="text-sm" />
                )}
                {bulkDeleting ? 'جاري الحذف...' : `حذف ${bulkDeleteItems.length} تقرير`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Import from Excel Modal ══ */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowImportModal(false); resetImportState(); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-3xl border border-[var(--color-border)] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
                  <ReportIcon name="upload_file" className="text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold">استيراد تقارير من Excel</h3>
                    <button onClick={() => downloadReportsTemplate(templateLookups)} className="text-primary hover:text-primary/80 text-xs font-bold flex items-center gap-1 underline">
                      <ReportIcon name="download" className="text-sm" />
                      تحميل نموذج
                    </button>
                  </div>
                  {importMode === 'create' && importResult && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {importResult.totalRows} صف — {importResult.validCount} صالح — {importResult.errorCount} خطأ
                    </p>
                  )}
                  {importMode === 'updateDate' && importDateUpdateResult && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      وضع تحديث الحقول: {importDateUpdateResult.totalRows} صف — {importDateUpdateResult.validCount} صالح — {importDateUpdateResult.errorCount} خطأ
                    </p>
                  )}
                </div>
              </div>
                <button
                  onClick={() => { setShowImportModal(false); resetImportState(); }}
                  className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors"
                >
                <ReportIcon name="close" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {importParsing ? (
                <div className="text-center py-12">
                  <ReportIcon name="refresh" className="text-4xl text-primary animate-spin block mb-3" />
                  <p className="font-bold text-[var(--color-text-muted)]">جاري قراءة الملف...</p>
                </div>
              ) : importMode === 'create' && importResult && importResult.rows.length === 0 ? (
                <div className="text-center py-12">
                  <ReportIcon name="warning" className="text-5xl text-[var(--color-text-muted)] block mb-3" />
                  <p className="font-bold text-[var(--color-text-muted)]">لا توجد بيانات في الملف</p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">تأكد أن الملف يحتوي على أعمدة: التاريخ، خط الإنتاج، المنتج، المشرف، الكمية المنتجة، الهالك، عدد العمال، ساعات العمل</p>
                  <button onClick={() => downloadReportsTemplate(templateLookups)} className="text-primary hover:text-primary/80 text-sm font-bold flex items-center gap-1 underline mt-3 mx-auto">
                    <ReportIcon name="download" className="text-sm" />
                    تحميل نموذج التقارير
                  </button>
                </div>
              ) : importMode === 'updateDate' && importDateUpdateResult && importDateUpdateResult.rows.length === 0 ? (
                <div className="text-center py-12">
                  <ReportIcon name="warning" className="text-5xl text-[var(--color-text-muted)] block mb-3" />
                  <p className="font-bold text-[var(--color-text-muted)]">لا توجد بيانات صالحة للتحديث</p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">استخدم ملف يحتوي على كود التقرير + واحد أو أكثر من: تاريخ جديد، الكمية المنتجة، الهالك، عدد العمال، ساعات العمل</p>
                </div>
              ) : importMode === 'updateDate' && importDateUpdateResult ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-[var(--border-radius-base)] text-xs font-bold text-blue-600">
                      <ReportIcon name="description" className="text-sm" />
                      {importDateUpdateResult.totalRows} صف
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 rounded-[var(--border-radius-base)] text-xs font-bold text-emerald-600">
                      <ReportIcon name="check_circle" className="text-sm" />
                      {importDateUpdateResult.validCount} صالح
                    </div>
                    {importDateUpdateResult.errorCount > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 rounded-[var(--border-radius-base)] text-xs font-bold text-rose-500">
                        <ReportIcon name="error" className="text-sm" />
                        {importDateUpdateResult.errorCount} خطأ
                      </div>
                    )}
                  </div>

                  <div className="md:hidden space-y-2">
                    {importDateUpdateResult.rows.map((row) => {
                      const isValid = row.errors.length === 0;
                      return (
                        <div
                          key={row.rowIndex}
                          className={`rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 ${
                            isValid ? 'bg-[var(--color-card)]' : 'bg-rose-50/50 dark:bg-rose-900/5'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs text-[var(--color-text-muted)]">صف #{row.rowIndex}</p>
                              <p className={`font-mono text-xs mt-1 ${row.reportCode ? '' : 'text-rose-500'}`}>
                                كود التقرير: {row.reportCode || '—'}
                              </p>
                            </div>
                            {isValid ? (
                              <ReportIcon name="check_circle" className="text-emerald-500 text-sm shrink-0" />
                            ) : (
                              <span title={row.errors.join('\n')}>
                                <ReportIcon name="error" className="text-rose-500 text-sm shrink-0" />
                              </span>
                            )}
                          </div>
                          <div className={`mt-2 text-sm ${row.updatedFieldsCount > 0 ? '' : 'text-rose-500'}`}>
                            {row.updatedFieldsCount > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {row.date && <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 text-xs">تاريخ: {row.date}</span>}
                                {row.quantityProduced !== undefined && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs">إنتاج: {row.quantityProduced}</span>}
                                {row.workersCount !== undefined && <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 text-xs">عمال: {row.workersCount}</span>}
                                {row.workHours !== undefined && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-xs">ساعات: {row.workHours}</span>}
                              </div>
                            ) : (
                              '—'
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden md:block overflow-x-auto border border-[var(--color-border)] rounded-[var(--border-radius-lg)]">
                    <table className="w-full text-right border-collapse text-sm">
                      <thead className="erp-thead">
                        <tr>
                          <th className="erp-th">#</th>
                          <th className="erp-th">الحالة</th>
                          <th className="erp-th">كود التقرير</th>
                          <th className="erp-th">التحديثات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {importDateUpdateResult.rows.map((row) => {
                          const isValid = row.errors.length === 0;
                          return (
                            <tr key={row.rowIndex} className={isValid ? '' : 'bg-rose-50/50 dark:bg-rose-900/5'}>
                              <td className="px-3 py-2 text-[var(--color-text-muted)] font-mono text-xs">{row.rowIndex}</td>
                              <td className="px-3 py-2">
                                {isValid ? (
                                  <ReportIcon name="check_circle" className="text-emerald-500 text-sm" />
                                ) : (
                                  <span title={row.errors.join('\n')}>
                                    <ReportIcon name="error" className="text-rose-500 text-sm" />
                                  </span>
                                )}
                              </td>
                              <td className={`px-3 py-2 font-mono text-xs ${row.reportCode ? '' : 'text-rose-500'}`}>{row.reportCode || '—'}</td>
                              <td className={`px-3 py-2 text-sm ${row.updatedFieldsCount > 0 ? '' : 'text-rose-500'}`}>
                                {row.updatedFieldsCount > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {row.date && <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 text-xs">تاريخ: {row.date}</span>}
                                    {row.quantityProduced !== undefined && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs">إنتاج: {row.quantityProduced}</span>}
                                    {row.workersCount !== undefined && <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 text-xs">عمال: {row.workersCount}</span>}
                                    {row.workHours !== undefined && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-xs">ساعات: {row.workHours}</span>}
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {importDateUpdateResult.errorCount > 0 && (
                    <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 rounded-[var(--border-radius-lg)] p-4">
                      <p className="text-sm font-bold text-rose-600 mb-2">
                        <ReportIcon name="error" className="text-sm align-middle ml-1 inline" />
                        الصفوف التالية تحتاج تعديل ولن يتم تحديثها:
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {importDateUpdateResult.rows.filter((r) => r.errors.length > 0).map((row) => (
                          <p key={row.rowIndex} className="text-xs text-rose-600">
                            صف {row.rowIndex}: {row.errors.join(' · ')}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : importResult ? (
                <div className="space-y-4">
                  {/* Summary Badges */}
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-[var(--border-radius-base)] text-xs font-bold text-blue-600">
                      <ReportIcon name="description" className="text-sm" />
                      {importResult.totalRows} صف
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 rounded-[var(--border-radius-base)] text-xs font-bold text-emerald-600">
                      <ReportIcon name="check_circle" className="text-sm" />
                      {importResult.validCount} صالح
                    </div>
                    {importResult.errorCount > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 rounded-[var(--border-radius-base)] text-xs font-bold text-rose-500">
                        <ReportIcon name="error" className="text-sm" />
                        {importResult.errorCount} خطأ
                      </div>
                    )}
                    {importResult.warningCount > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 rounded-[var(--border-radius-base)] text-xs font-bold text-amber-600">
                        <ReportIcon name="warning" className="text-sm" />
                        {importResult.warningCount} تحذير
                      </div>
                    )}
                    {importResult.duplicateCount > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-[var(--border-radius-base)] text-xs font-bold text-orange-600 dark:text-orange-400">
                        <ReportIcon name="content_copy" className="text-sm" />
                        {importResult.duplicateCount} مكرر
                      </div>
                    )}
                  </div>

                  {/* Preview Table */}
                  <div className="md:hidden space-y-2">
                    {importResult.rows.map((row) => {
                      const isValid = row.errors.length === 0;
                      const hasWarnings = row.warnings.length > 0;
                      const cardBg = !isValid
                        ? 'bg-rose-50/50 dark:bg-rose-900/5'
                        : row.isDuplicate
                          ? 'bg-orange-50/50 dark:bg-orange-900/5'
                          : hasWarnings
                            ? 'bg-amber-50/30 dark:bg-amber-900/5'
                            : 'bg-[var(--color-card)]';

                      return (
                        <div key={row.rowIndex} className={`rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3 ${cardBg}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs text-[var(--color-text-muted)]">صف #{row.rowIndex}</p>
                              <p className="text-sm font-medium mt-1">{row.date}</p>
                            </div>
                            {!isValid ? (
                              <span title={row.errors.join('\n')}>
                                <ReportIcon name="error" className="text-rose-500 text-sm shrink-0" />
                              </span>
                            ) : row.isDuplicate ? (
                              <span title="تقرير مكرر">
                                <ReportIcon name="content_copy" className="text-orange-500 text-sm shrink-0" />
                              </span>
                            ) : hasWarnings ? (
                              <span title={row.warnings.join('\n')}>
                                <ReportIcon name="warning" className="text-amber-500 text-sm shrink-0" />
                              </span>
                            ) : (
                              <ReportIcon name="check_circle" className="text-emerald-500 text-sm shrink-0" />
                            )}
                          </div>

                          <div className="mt-2 space-y-1 text-xs">
                            <p className={row.lineId ? '' : 'text-rose-500'}>خط الإنتاج: {row.lineName || '—'}</p>
                            <p className={row.productId ? '' : 'text-rose-500'}>المنتج: {row.productName || '—'}</p>
                            <p className={row.employeeId ? '' : 'text-rose-500'}>المشرف: {row.employeeName || '—'}</p>
                            <p className="text-[var(--color-text-muted)] font-mono">الكود: {row.employeeCode || '—'}</p>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded bg-emerald-50/80 px-2 py-1">
                              <span className="text-[var(--color-text-muted)]">الكمية: </span>
                              <span className="font-bold">{row.quantityProduced}</span>
                            </div>
                            <div className="rounded bg-slate-50 px-2 py-1">
                              <span className="text-[var(--color-text-muted)]">عمال: </span>
                              <span className="font-bold">{row.workersCount}</span>
                            </div>
                            <div className="rounded bg-amber-50/80 px-2 py-1">
                              <span className="text-[var(--color-text-muted)]">ساعات: </span>
                              <span className="font-bold">{row.workHours}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden md:block overflow-x-auto border border-[var(--color-border)] rounded-[var(--border-radius-lg)]">
                    <table className="w-full text-right border-collapse text-sm">
                      <thead className="erp-thead">
                        <tr>
                          <th className="erp-th">#</th>
                          <th className="erp-th">الحالة</th>
                          <th className="erp-th">التاريخ</th>
                          <th className="erp-th">خط الإنتاج</th>
                          <th className="erp-th">المنتج</th>
                          <th className="erp-th">المشرف</th>
                          <th className="erp-th">الكود</th>
                          <th className="erp-th text-center">الكمية</th>
                          <th className="erp-th text-center">عمال</th>
                          <th className="erp-th text-center">ساعات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {importResult.rows.map((row) => {
                          const isValid = row.errors.length === 0;
                          const hasWarnings = row.warnings.length > 0;
                          const rowBg = !isValid
                            ? 'bg-rose-50/50 dark:bg-rose-900/5'
                            : row.isDuplicate
                              ? 'bg-orange-50/50 dark:bg-orange-900/5'
                              : hasWarnings
                                ? 'bg-amber-50/30 dark:bg-amber-900/5'
                                : '';
                          return (
                            <tr key={row.rowIndex} className={rowBg}>
                              <td className="px-3 py-2 text-[var(--color-text-muted)] font-mono text-xs">{row.rowIndex}</td>
                              <td className="px-3 py-2">
                                {!isValid ? (
                                  <span title={row.errors.join('\n')}>
                                    <ReportIcon name="error" className="text-rose-500 text-sm" />
                                  </span>
                                ) : row.isDuplicate ? (
                                  <span title="تقرير مكرر">
                                    <ReportIcon name="content_copy" className="text-orange-500 text-sm" />
                                  </span>
                                ) : hasWarnings ? (
                                  <span title={row.warnings.join('\n')}>
                                    <ReportIcon name="warning" className="text-amber-500 text-sm" />
                                  </span>
                                ) : (
                                  <ReportIcon name="check_circle" className="text-emerald-500 text-sm" />
                                )}
                              </td>
                              <td className="px-3 py-2 font-medium">{row.date}</td>
                              <td className={`px-3 py-2 ${row.lineId ? '' : 'text-rose-500'}`}>{row.lineName || '—'}</td>
                              <td className={`px-3 py-2 ${row.productId ? '' : 'text-rose-500'}`}>{row.productName || '—'}</td>
                              <td className={`px-3 py-2 ${row.employeeId ? '' : 'text-rose-500'}`}>{row.employeeName || '—'}</td>
                              <td className="px-3 py-2 text-[var(--color-text-muted)] font-mono text-xs">{row.employeeCode || '—'}</td>
                              <td className="px-3 py-2 text-center font-bold">{row.quantityProduced}</td>
                              <td className="px-3 py-2 text-center">{row.workersCount}</td>
                              <td className="px-3 py-2 text-center">{row.workHours}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Error details */}
                  {importResult.errorCount > 0 && (
                    <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 rounded-[var(--border-radius-lg)] p-4">
                      <p className="text-sm font-bold text-rose-600 mb-2">
                        <ReportIcon name="error" className="text-sm align-middle ml-1 inline" />
                        الصفوف التالية تحتاج تعديل ولن يتم حفظها:
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {importResult.rows.filter((r) => r.errors.length > 0).map((row) => (
                          <p key={row.rowIndex} className="text-xs text-rose-600">
                            صف {row.rowIndex}: {row.errors.join(' · ')}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warning details */}
                  {importResult.warningCount > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 rounded-[var(--border-radius-lg)] p-4">
                      <p className="text-sm font-bold text-amber-600 mb-2">
                        <ReportIcon name="warning" className="text-sm align-middle ml-1 inline" />
                        تنبيهات (سيتم الحفظ لكن يرجى المراجعة):
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {importResult.rows.filter((r) => r.warnings.length > 0).map((row) => (
                          <p key={row.rowIndex} className="text-xs text-amber-600">
                            صف {row.rowIndex}: {row.warnings.join(' · ')}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            {hasImportPreview && importValidCount > 0 && (
              <div className="px-5 sm:px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3 shrink-0">
                {importSaving ? (
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-1 h-2 bg-[#f0f2f5] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">
                      {importProgress.done}/{importProgress.total}
                    </span>
                  </div>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => { setShowImportModal(false); resetImportState(); }}>إلغاء</Button>
                    <Button variant="primary" onClick={handleImportSave}>
                      <ReportIcon name="save" className="text-sm" />
                      {importMode === 'updateDate' ? `تحديث ${importValidCount} صف` : `حفظ ${importValidCount} تقرير`}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Work Order Detail Modal ══ */}
      {viewWOReport && (() => {
        const wo = woMap.get(viewWOReport.workOrderId!);
        if (!wo) return null;
        const statusLabels: Record<string, { label: string; color: string }> = {
          pending: { label: 'قيد الانتظار', color: 'text-amber-600 bg-amber-50' },
          in_progress: { label: 'قيد التنفيذ', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
          completed: { label: 'مكتمل', color: 'text-emerald-600 bg-emerald-50' },
          cancelled: { label: 'ملغي', color: 'text-rose-600 bg-rose-50' },
        };
        const st = statusLabels[wo.status] || statusLabels.pending;
        const rows = [
          { label: 'المنتج', value: getProductName(wo.productId) },
          { label: 'خط الإنتاج', value: getLineName(wo.lineId) },
          { label: 'المشرف', value: getEmployeeName(wo.supervisorId) },
          { label: 'التاريخ المستهدف', value: wo.targetDate },
        ];
        const compareRows = [
          { label: 'الكمية', planned: formatNumber(wo.quantity), actual: formatNumber(viewWOReport.quantityProduced), icon: 'inventory_2' },
          { label: 'العمالة', planned: String(wo.maxWorkers), actual: String(viewWOReport.workersCount), icon: 'groups' },
        ];
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewWOReport(null)}>
            <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <ReportIcon name="assignment" className="text-primary" />
                  <h3 className="font-bold">{wo.workOrderNumber}</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                </div>
                <button onClick={() => setViewWOReport(null)} className="text-[var(--color-text-muted)] hover:text-slate-600">
                  <ReportIcon name="close" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {rows.map((r) => (
                    <div key={r.label} className="text-sm">
                      <span className="text-[var(--color-text-muted)] block text-xs mb-0.5">{r.label}</span>
                      <span className="font-bold text-[var(--color-text)]">{r.value}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[var(--color-border)] pt-4">
                  <h4 className="text-sm font-bold text-[var(--color-text-muted)] mb-3">المخطط vs الفعلي</h4>
                  <div className="space-y-3">
                    {compareRows.map((cr) => (
                      <div key={cr.label} className="flex items-center gap-3 p-3 rounded-[var(--border-radius-lg)] bg-[#f8f9fa]/50">
                        <ReportIcon name={cr.icon} className="text-primary text-lg" />
                        <span className="text-sm font-bold text-[var(--color-text-muted)] w-16">{cr.label}</span>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 text-center">
                            <span className="text-xs text-[var(--color-text-muted)] block">مخطط</span>
                            <span className="text-sm font-bold text-[var(--color-text)]">{cr.planned}</span>
                          </div>
                          <ReportIcon name="arrow_forward" className="text-[var(--color-text-muted)] text-sm" />
                          <div className="flex-1 text-center">
                            <span className="text-xs text-[var(--color-text-muted)] block">فعلي</span>
                            <span className="text-sm font-bold text-primary">{cr.actual}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {wo.notes && (
                  <div className="text-sm">
                    <span className="text-[var(--color-text-muted)] block text-xs mb-1">ملاحظات</span>
                    <p className="text-slate-600 font-medium">{wo.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ Quality Report Modal (from production report code) ══ */}
      {viewQualityReport && (() => {
        const wo = viewQualityReport.workOrderId ? woMap.get(viewQualityReport.workOrderId) : null;
        const qualityCode = getQualityReportCode(wo ?? undefined, viewQualityReport.reportCode);
        if (!wo || (!wo.qualitySummary && !wo.qualityStatus && !wo.qualityReportCode)) {
          return (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewQualityReport(null)}>
              <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)] p-5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold">تقرير الجودة المرتبط</h3>
                  <button onClick={() => setViewQualityReport(null)} className="text-[var(--color-text-muted)] hover:text-slate-600">
                    <ReportIcon name="close" />
                  </button>
                </div>
                <p className="text-sm text-slate-500">لا يوجد تقرير جودة مرتبط بهذا التقرير حتى الآن.</p>
              </div>
            </div>
          );
        }
        const qm = qualityStatusMeta(wo.qualityStatus);
        const qs = wo.qualitySummary;
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewQualityReport(null)}>
            <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-xl border border-[var(--color-border)] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <div>
                  <h3 className="font-bold">تقرير الجودة المرتبط</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {viewQualityReport.reportCode || '—'} — WO: {wo.workOrderNumber}
                  </p>
                  <p className="text-xs text-primary font-bold mt-1">
                    كود تقرير الجودة: {qualityCode || '—'}
                  </p>
                </div>
                <button onClick={() => setViewQualityReport(null)} className="text-[var(--color-text-muted)] hover:text-slate-600">
                  <ReportIcon name="close" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <span className={`inline-flex text-xs font-bold px-2 py-0.5 rounded-full ${qm.className}`}>
                    {qm.label}
                  </span>
                </div>
                {qs ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="p-3 rounded-[var(--border-radius-lg)] bg-[#f8f9fa]/60">
                        <p className="text-xs text-slate-500">تم الفحص</p>
                        <p className="text-lg font-bold text-[var(--color-text)]">{formatNumber(qs.inspectedUnits)}</p>
                      </div>
                      <div className="p-3 rounded-[var(--border-radius-lg)] bg-[#f8f9fa]/60">
                        <p className="text-xs text-slate-500">ناجح</p>
                        <p className="text-lg font-bold text-emerald-600">{formatNumber(qs.passedUnits)}</p>
                      </div>
                      <div className="p-3 rounded-[var(--border-radius-lg)] bg-[#f8f9fa]/60">
                        <p className="text-xs text-slate-500">فاشل</p>
                        <p className="text-lg font-bold text-rose-600">{formatNumber(qs.failedUnits)}</p>
                      </div>
                      <div className="p-3 rounded-[var(--border-radius-lg)] bg-[#f8f9fa]/60">
                        <p className="text-xs text-slate-500">Rework</p>
                        <p className="text-lg font-bold text-amber-600">{formatNumber(qs.reworkUnits)}</p>
                      </div>
                      <div className="p-3 rounded-[var(--border-radius-lg)] bg-[#f8f9fa]/60">
                        <p className="text-xs text-slate-500">FPY</p>
                        <p className="text-lg font-bold text-primary">{qs.firstPassYield}%</p>
                      </div>
                      <div className="p-3 rounded-[var(--border-radius-lg)] bg-[#f8f9fa]/60">
                        <p className="text-xs text-slate-500">Defect Rate</p>
                        <p className="text-lg font-bold text-violet-600">{qs.defectRate}%</p>
                      </div>
                    </div>
                    <div className="text-sm">
                      <p className="text-[var(--color-text-muted)]">أعلى سبب عيب</p>
                      <p className="font-bold text-[var(--color-text)]">{qs.topDefectReason || '—'}</p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-[var(--border-radius-lg)] border border-amber-200 bg-amber-50 dark:border-amber-900/40 px-3 py-2 text-sm font-semibold text-amber-700">
                    تم حفظ حالة تقرير الجودة، وسيظهر الملخص التفصيلي بعد اكتمال مزامنة البيانات/الـ indexes.
                  </div>
                )}
              </div>
              <div className="px-5 py-4 border-t border-[var(--color-border)] flex justify-end">
                {can('quality.reports.view') && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.location.hash = `#/quality/reports?workOrderId=${encodeURIComponent(wo.id || '')}`;
                    }}
                  >
                    فتح تقرير الجودة التفصيلي
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ View Workers Modal ══ */}
      {viewWorkersData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setViewWorkersData(null); setViewWorkersError(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md max-h-[80vh] border border-[var(--color-border)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ReportIcon name="groups" className="text-primary" />
                <h3 className="font-bold">عمالة {getLineName(viewWorkersData.lineId)}</h3>
                <span className="text-xs text-[var(--color-text-muted)] font-medium">{viewWorkersData.date}</span>
              </div>
              <button onClick={() => { setViewWorkersData(null); setViewWorkersError(null); }} className="text-[var(--color-text-muted)] hover:text-slate-600">
                <ReportIcon name="close" />
              </button>
            </div>
            <div className="p-4 border-b border-[var(--color-border)] space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    placeholder="ابحث عن عامل للإضافة"
                    options={availableWorkersForModal}
                    value={viewWorkersPickerId}
                    onChange={setViewWorkersPickerId}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={addWorkerToLineDate}
                  disabled={!viewWorkersPickerId || viewWorkersBusy}
                >
                  {viewWorkersBusy ? (
                    <ReportIcon name="refresh" className="animate-spin text-sm" />
                  ) : (
                    <ReportIcon name="person_add" className="text-sm" />
                  )}
                  إضافة
                </Button>
              </div>
              {viewWorkersError && (
                <p className="text-xs font-bold text-rose-500">{viewWorkersError}</p>
              )}
            </div>
            {viewWorkersData.report && (
              <div className="px-4 pb-4 border-b border-[var(--color-border)]">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-[var(--border-radius-base)] bg-primary/5 px-2.5 py-2 text-center">
                    <p className="text-[var(--color-text-muted)] font-bold">إجمالي العمالة</p>
                    <p className="text-primary font-black text-sm">{viewWorkersData.report.workersCount}</p>
                  </div>
                  <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2 text-center">
                    <p className="text-[var(--color-text-muted)] font-bold">ساعات العمل</p>
                    <p className="font-black text-sm text-[var(--color-text)]">{viewWorkersData.report.workHours}</p>
                  </div>
                  <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2 text-center">
                    <p className="text-[var(--color-text-muted)] font-bold">إنتاج</p>
                    <p className="font-black text-sm text-[var(--color-text)]">{viewWorkersData.report.workersProductionCount || 0}</p>
                  </div>
                  <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2 text-center">
                    <p className="text-[var(--color-text-muted)] font-bold">تغليف</p>
                    <p className="font-black text-sm text-[var(--color-text)]">{viewWorkersData.report.workersPackagingCount || 0}</p>
                  </div>
                  <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2 text-center">
                    <p className="text-[var(--color-text-muted)] font-bold">جودة</p>
                    <p className="font-black text-sm text-[var(--color-text)]">{viewWorkersData.report.workersQualityCount || 0}</p>
                  </div>
                  <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2 text-center">
                    <p className="text-[var(--color-text-muted)] font-bold">صيانة</p>
                    <p className="font-black text-sm text-[var(--color-text)]">{viewWorkersData.report.workersMaintenanceCount || 0}</p>
                  </div>
                  <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2 text-center col-span-2">
                    <p className="text-[var(--color-text-muted)] font-bold">خارجية</p>
                    <p className="font-black text-sm text-[var(--color-text)]">{viewWorkersData.report.workersExternalCount || 0}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="p-4 overflow-y-auto flex-1">
              {viewWorkersLoading ? (
                <div className="text-center py-8">
                  <ReportIcon name="refresh" className="text-3xl text-primary animate-spin block mb-2" />
                  <p className="text-sm text-slate-500">جاري التحميل...</p>
                </div>
              ) : viewWorkersData.workers.length === 0 ? (
                <div className="text-center py-8">
                  <ReportIcon name="person_off" className="text-4xl text-[var(--color-text-muted)] dark:text-[var(--color-text)] block mb-2" />
                  <p className="text-sm text-[var(--color-text-muted)] font-medium">لا يوجد عمالة مسجلة على هذا الخط في هذا اليوم</p>
                </div>
              ) : (
                <>
                  <div className="mb-3 px-3 py-2 bg-primary/5 rounded-[var(--border-radius-lg)] text-center">
                    <span className="text-sm font-bold text-primary">{viewWorkersData.workers.length} عامل</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {viewWorkersData.workers.map((w, i) => (
                      <div key={w.id || i} className="flex items-center gap-3 py-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <ReportIcon name="person" className="text-primary text-sm" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-[var(--color-text)] truncate">{w.employeeName}</p>
                          <p className="text-xs text-[var(--color-text-muted)] font-mono">{w.employeeCode}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWorkerFromLineDate(w.id)}
                          disabled={viewWorkersBusy}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-[var(--border-radius-base)] transition-all disabled:opacity-50"
                          title="حذف العامل من هذا الخط"
                        >
                          <ReportIcon name="delete" className="text-base" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
