
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, Badge, SearchableSelect } from '../components/UI';
import { formatNumber, getTodayDateString } from '../../../utils/calculations';
import { buildReportsCosts, buildSupervisorHourlyRatesMap, estimateReportCost, formatCost } from '../../../utils/costCalculations';
import { ProductionReport, LineWorkerAssignment, WorkOrder } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { exportReportsByDateRange, exportWorkOrders } from '../../../utils/exportExcel';
import { exportToPDF, shareToWhatsApp, ShareResult } from '../../../utils/reportExport';
import { parseExcelFile, toReportData, ImportResult, ParsedReportRow } from '../../../utils/importExcel';
import { downloadReportsTemplate, ReportsTemplateLookups } from '../../../utils/downloadTemplates';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { reportService } from '../../../services/reportService';
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

const emptyForm = {
  employeeId: '',
  productId: '',
  lineId: '',
  date: getTodayDateString(),
  quantityProduced: 0,
  quantityWaste: 0,
  workersCount: 0,
  workHours: 0,
  notes: '',
};
const NOTE_PREVIEW_LENGTH = 10;

export const Reports: React.FC = () => {
  const location = useLocation();
  const isMobilePrint = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const todayReports = useAppStore((s) => s.todayReports);
  const productionReports = useAppStore((s) => s.productionReports);
  const employees = useAppStore((s) => s.employees);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const createReport = useAppStore((s) => s.createReport);
  const updateReport = useAppStore((s) => s.updateReport);
  const deleteReport = useAppStore((s) => s.deleteReport);
  const fetchReports = useAppStore((s) => s.fetchReports);
  const reportsLoading = useAppStore((s) => s.reportsLoading);
  const error = useAppStore((s) => s.error);

  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const workOrders = useAppStore((s) => s.workOrders);
  const planSettings = useAppStore((s) => s.systemSettings.planSettings);

  const { can } = usePermission();
  const canViewCosts = can('reports.viewCost');

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [expandedNoteRows, setExpandedNoteRows] = useState<Set<string>>(new Set());

  // Import from Excel state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Single-report print state
  const [printReport, setPrintReport] = useState<ReportPrintRow | null>(null);
  const singlePrintRef = useRef<HTMLDivElement>(null);

  // Bulk print ref
  const bulkPrintRef = useRef<HTMLDivElement>(null);
  const [bulkPrintSource, setBulkPrintSource] = useState<ProductionReport[] | null>(null);
  const [bulkDeleteItems, setBulkDeleteItems] = useState<ProductionReport[] | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Line workers for auto-fill and viewing
  const [formLineWorkers, setFormLineWorkers] = useState<LineWorkerAssignment[]>([]);
  const [viewWorkersData, setViewWorkersData] = useState<{ lineId: string; date: string; workers: LineWorkerAssignment[] } | null>(null);
  const [viewWorkersLoading, setViewWorkersLoading] = useState(false);

  // Work order detail popup
  const [viewWOReport, setViewWOReport] = useState<ProductionReport | null>(null);

  // Date range filter
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [endDate, setEndDate] = useState(getTodayDateString());
  const [viewMode, setViewMode] = useState<'today' | 'range'>('today');

  // Line & supervisor filters
  const [filterLineId, setFilterLineId] = useState('');
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [highlightReportId, setHighlightReportId] = useState<string | null>(null);

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
      if (list.length > 0 && !editId && form.workersCount === 0) {
        setForm((prev) => ({ ...prev, workersCount: list.length }));
      }
    }).catch(() => setFormLineWorkers([]));
  }, [showModal, form.lineId, form.date]);

  const allReports = viewMode === 'today' ? todayReports : productionReports;
  const displayedReports = useMemo(() => {
    let list = myEmployeeId
      ? allReports.filter((r) => r.employeeId === myEmployeeId)
      : allReports;
    if (filterLineId) list = list.filter((r) => r.lineId === filterLineId);
    if (filterEmployeeId) list = list.filter((r) => r.employeeId === filterEmployeeId);
    return list;
  }, [allReports, myEmployeeId, filterLineId, filterEmployeeId]);

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

  const reportCosts = useMemo(() => {
    if (!canViewCosts) return new Map<string, number>();
    const hourlyRate = laborSettings?.hourlyRate ?? 0;
    const supervisorHourlyRates = buildSupervisorHourlyRatesMap(_rawEmployees);
    return buildReportsCosts(displayedReports, hourlyRate, costCenters, costCenterValues, costAllocations, supervisorHourlyRates);
  }, [canViewCosts, displayedReports, laborSettings, costCenters, costCenterValues, costAllocations, _rawEmployees]);

  // ── Template lookups (for dynamic Excel template) ──────────────────────────

  const templateLookups = useMemo<ReportsTemplateLookups>(() => ({
    lines: _rawLines.map((l) => ({ name: l.name })),
    products: _rawProducts.map((p) => ({ name: p.name, code: p.code })),
    employees: employees.filter((e) => e.level === 2).map((e) => ({ name: e.name, code: e.code ?? '' })),
  }), [_rawLines, _rawProducts, employees]);

  // ── Lookups ────────────────────────────────────────────────────────────────

  const getProductName = useCallback(
    (pid: string) => _rawProducts.find((p) => p.id === pid)?.name ?? '—',
    [_rawProducts]
  );
  const getLineName = useCallback(
    (lid: string) => _rawLines.find((l) => l.id === lid)?.name ?? '—',
    [_rawLines]
  );
  const getEmployeeName = useCallback(
    (sid: string) => employees.find((s) => s.id === sid)?.name ?? '—',
    [employees]
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

  const handleBulkPrint = useReactToPrint({ contentRef: bulkPrintRef });
  const handleSinglePrint = useReactToPrint({ contentRef: singlePrintRef });

  const buildReportRow = useCallback(
    (report: ProductionReport | typeof emptyForm): ReportPrintRow => {
      const woId = (report as ProductionReport).workOrderId;
      const wo = woId ? woMap.get(woId) : undefined;
      const rid = (report as ProductionReport).id;
      return {
        reportId: rid,
        date: report.date,
        lineName: getLineName(report.lineId),
        productName: getProductName(report.productId),
        employeeName: getEmployeeName(report.employeeId),
        quantityProduced: report.quantityProduced || 0,
        quantityWaste: report.quantityWaste || 0,
        workersCount: report.workersCount || 0,
        workHours: report.workHours || 0,
        notes: report.notes,
        costPerUnit: rid && canViewCosts ? reportCosts.get(rid) : undefined,
        workOrderNumber: wo?.workOrderNumber,
      };
    },
    [getLineName, getProductName, getEmployeeName, woMap, canViewCosts, reportCosts]
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
      const row = buildReportRow(report);
      setPrintReport(row);
      await new Promise((r) => setTimeout(r, 300));
      if (!singlePrintRef.current) return;
      setExporting(true);
      try {
        const result = await shareToWhatsApp(
          singlePrintRef.current,
          `تقرير إنتاج - ${row.lineName} - ${row.date}`,
        );
        showShareFeedback(result);
      } finally {
        setExporting(false);
        setTimeout(() => setPrintReport(null), 500);
      }
    },
    [buildReportRow, showShareFeedback]
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
    setStartDate(getTodayDateString());
    setEndDate(getTodayDateString());
    setFilterLineId('');
    setFilterEmployeeId('');
  };

  const activeFilterCount = (filterLineId ? 1 : 0) + (filterEmployeeId ? 1 : 0);

  const openCreate = () => {
    setEditId(null);
    setSaveToast(null);
    setForm({ ...emptyForm, date: getTodayDateString() });
    setShowModal(true);
  };

  const openEdit = (report: ProductionReport) => {
    setEditId(report.id!);
    setSaveToast(null);
    setForm({
      employeeId: report.employeeId,
      productId: report.productId,
      lineId: report.lineId,
      date: report.date,
      quantityProduced: report.quantityProduced,
      quantityWaste: report.quantityWaste,
      workersCount: report.workersCount,
      workHours: report.workHours,
      notes: report.notes ?? '',
    });
    setShowModal(true);
  };

  const handleSave = async (printAfterSave = false) => {
    if (!form.lineId || !form.productId || !form.employeeId) return;
    setSaving(true);
    setSaveToast(null);

    if (editId) {
      await updateReport(editId, form);
      setSaving(false);
      setSaveToast('تم حفظ التعديلات بنجاح');
      setTimeout(() => setSaveToast(null), 3000);
      if (printAfterSave && can('print')) {
        await triggerSinglePrint({ ...form, id: editId });
      }
    } else {
      const createdId = await createReport(form);
      setSaving(false);
      setForm({ ...emptyForm, date: form.date, lineId: form.lineId });
      setSaveToast('تم حفظ التقرير بنجاح');
      setTimeout(() => setSaveToast(null), 3000);
      if (printAfterSave && can('print')) {
        await triggerSinglePrint({
          ...form,
          id: typeof createdId === 'string' ? createdId : undefined,
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    await deleteReport(id);
    setDeleteConfirmId(null);
  };

  const handleViewWorkers = async (lineId: string, date: string) => {
    setViewWorkersLoading(true);
    setViewWorkersData({ lineId, date, workers: [] });
    try {
      const workers = await lineAssignmentService.getByLineAndDate(lineId, date);
      setViewWorkersData({ lineId, date, workers });
    } catch {
      setViewWorkersData(null);
    } finally {
      setViewWorkersLoading(false);
    }
  };

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

  // ── Import from Excel ────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportParsing(true);
    setShowImportModal(true);
    setImportResult(null);
    try {
      const result = await parseExcelFile(file, {
        products: _rawProducts,
        lines: _rawLines,
        employees: _rawEmployees,
        existingReports: displayedReports,
      });
      setImportResult(result);
    } catch {
      setImportResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0, warningCount: 0, duplicateCount: 0 });
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
        await createReport(toReportData(row));
      } catch {
        // skip failed row
      }
      done++;
      setImportProgress({ done, total: validRows.length });
    }

    setImportSaving(false);
    setShowImportModal(false);
    setImportResult(null);
  };

  // ── SelectableTable config ──────────────────────────────────────────────────

  const reportColumns = useMemo<TableColumn<ProductionReport>[]>(() => {
    const getNoteRowKey = (r: ProductionReport) =>
      r.id ?? `${r.date}-${r.lineId}-${r.productId}-${r.employeeId}`;

    const cols: TableColumn<ProductionReport>[] = [
      { header: 'التاريخ', render: (r) => <span className="font-bold text-slate-700 dark:text-slate-300">{r.date}</span> },
      { header: 'خط الإنتاج', render: (r) => <span className="font-medium">{getLineName(r.lineId)}</span> },
      { header: 'المنتج', render: (r) => <span className="font-medium">{getProductName(r.productId)}</span> },
      { header: 'الموظف', render: (r) => <span className="font-medium">{getEmployeeName(r.employeeId)}</span> },
      {
        header: 'الكمية المنتجة',
        headerClassName: 'text-center',
        className: 'text-center',
        render: (r) => (
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm font-black ring-1 ring-emerald-500/20">
            {formatNumber(r.quantityProduced)}
          </span>
        ),
      },
      { header: 'الهالك', headerClassName: 'text-center', className: 'text-center text-rose-500 font-bold', render: (r) => <>{formatNumber(r.quantityWaste)}</> },
      {
        id: 'notes',
        header: 'الملحوظة',
        hideable: true,
        render: (r) => {
          const note = r.notes?.trim() || '';
          if (!note) return <span className="text-slate-300">—</span>;

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
              className={`text-sm text-right block max-w-[260px] ${shouldTruncate ? 'text-primary hover:underline cursor-pointer' : 'text-slate-600 dark:text-slate-300 cursor-default'}`}
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
            onClick={(e) => { e.stopPropagation(); handleViewWorkers(r.lineId, r.date); }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
            title="عرض العمالة"
          >
            {r.workersCount}
            <span className="material-icons-round text-xs">groups</span>
          </button>
        ),
      },
      { header: 'ساعات', headerClassName: 'text-center', className: 'text-center font-bold', render: (r) => <>{r.workHours}</> },
      {
        header: 'أمر شغل',
        headerClassName: 'text-center',
        className: 'text-center',
        render: (r) => {
          if (!r.workOrderId) return <span className="text-sm text-slate-300">—</span>;
          const wo = woMap.get(r.workOrderId);
          if (!wo) return <span className="text-sm text-slate-300">—</span>;
          return (
            <button
              onClick={(e) => { e.stopPropagation(); setViewWOReport(r); }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-primary/10 text-primary transition-colors text-sm font-bold"
              title="عرض تفاصيل أمر الشغل"
            >
              {wo.workOrderNumber}
              <span className="material-icons-round text-xs">assignment</span>
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
            <span className="text-sm font-black text-primary">{formatCost(reportCosts.get(r.id)!)} ج.م</span>
          ) : (
            <span className="text-sm text-slate-300">—</span>
          ),
      });
    }
    return cols;
  }, [canViewCosts, expandedNoteRows, getLineName, getProductName, getEmployeeName, reportCosts, woMap]);

  const handleBulkPrintSelected = useCallback(async (items: ProductionReport[]) => {
    setBulkPrintSource(items);
    await new Promise((r) => setTimeout(r, 300));
    await triggerBulkPrint();
    setTimeout(() => setBulkPrintSource(null), 1000);
  }, [triggerBulkPrint]);

  const handleBulkDeleteConfirmed = useCallback(async () => {
    if (!bulkDeleteItems) return;
    setBulkDeleting(true);
    for (const item of bulkDeleteItems) {
      try { await deleteReport(item.id!); } catch { /* skip */ }
    }
    setBulkDeleting(false);
    setBulkDeleteItems(null);
  }, [bulkDeleteItems, deleteReport]);

  const reportBulkActions = useMemo<TableBulkAction<ProductionReport>[]>(() => [
    { label: 'طباعة المحدد', icon: 'print', action: handleBulkPrintSelected, permission: 'print' },
    { label: 'تصدير المحدد', icon: 'download', action: (items) => exportReportsByDateRange(items, startDate, endDate, lookups, canViewCosts ? reportCosts : undefined), permission: 'export' },
    { label: 'حذف المحدد', icon: 'delete', action: (items) => setBulkDeleteItems(items), permission: 'reports.delete', variant: 'danger' },
  ], [handleBulkPrintSelected, startDate, endDate, lookups, canViewCosts, reportCosts]);

  const renderReportActions = (report: ProductionReport) => (
    <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      {can("print") && (
        <>
          <button onClick={() => triggerSingleShare(report)} className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 rounded-lg transition-all" title="مشاركة عبر واتساب" disabled={exporting}>
            <span className="material-icons-round text-lg">share</span>
          </button>
          <button onClick={() => triggerSinglePrint(report)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all" title="طباعة التقرير">
            <span className="material-icons-round text-lg">print</span>
          </button>
        </>
      )}
      {can("reports.edit") && (
        <button onClick={() => openEdit(report)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all" title="تعديل التقرير">
          <span className="material-icons-round text-lg">edit</span>
        </button>
      )}
      {can("reports.delete") && (
        <button onClick={() => setDeleteConfirmId(report.id!)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all" title="حذف التقرير">
          <span className="material-icons-round text-lg">delete</span>
        </button>
      )}
    </div>
  );

  const reportTableFooter = (
    <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
      <span className="text-sm text-slate-500 font-bold">إجمالي <span className="text-primary">{displayedReports.length}</span> تقرير</span>
      {displayedReports.length > 0 && (
        <div className="flex items-center gap-4 text-xs font-bold">
          <span className="text-emerald-600">إنتاج: {formatNumber(displayedReports.reduce((s, r) => s + r.quantityProduced, 0))}</span>
          <span className="text-rose-500">هالك: {formatNumber(displayedReports.reduce((s, r) => s + r.quantityWaste, 0))}</span>
        </div>
      )}
    </div>
  );

  const qualityReportRows = useMemo(
    () =>
      workOrders
        .filter((wo) => !!wo.qualitySummary)
        .slice()
        .sort((a, b) => {
          const aMs = a.qualitySummary?.lastInspectionAt?.toDate?.()?.getTime?.() ?? new Date(a.qualityApprovedAt || 0).getTime();
          const bMs = b.qualitySummary?.lastInspectionAt?.toDate?.()?.getTime?.() ?? new Date(b.qualityApprovedAt || 0).getTime();
          return (bMs || 0) - (aMs || 0);
        })
        .slice(0, 8),
    [workOrders],
  );

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">تقارير الإنتاج</h2>
          <p className="text-sm text-slate-500 font-medium">إنشاء ومراجعة تقارير الإنتاج اليومية.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {can("quality.reports.view") && (
            <Button variant="outline" onClick={() => window.location.hash = '#/quality/reports'}>
              <span className="material-icons-round text-sm">verified</span>
              <span className="hidden sm:inline">تقارير الجودة</span>
            </Button>
          )}
          {displayedReports.length > 0 && can("export") && (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  exportReportsByDateRange(displayedReports, startDate, endDate, lookups, canViewCosts ? reportCosts : undefined)
                }
              >
                <span className="material-icons-round text-sm">download</span>
                <span className="hidden sm:inline">تقارير Excel</span>
              </Button>
              {workOrders.length > 0 && can("workOrders.view") && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    exportWorkOrders(workOrders, { getProductName, getLineName, getSupervisorName: getEmployeeName })
                  }
                >
                  <span className="material-icons-round text-sm">assignment</span>
                  <span className="hidden sm:inline">أوامر الشغل Excel</span>
                </Button>
              )}
              <Button variant="outline" disabled={exporting} onClick={() => triggerBulkPrint()}>
                <span className="material-icons-round text-sm">print</span>
                <span className="hidden sm:inline">طباعة</span>
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handlePDF}>
                {exporting ? (
                  <span className="material-icons-round animate-spin text-sm">refresh</span>
                ) : (
                  <span className="material-icons-round text-sm">picture_as_pdf</span>
                )}
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handleWhatsApp}>
                <span className="material-icons-round text-sm">share</span>
                <span className="hidden sm:inline">واتساب</span>
              </Button>
            </>
          )}
          {can("import") && (
            <>
              <Button variant="outline" onClick={() => downloadReportsTemplate(templateLookups)}>
                <span className="material-icons-round text-sm">file_download</span>
                <span className="hidden sm:inline">تحميل قالب</span>
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <span className="material-icons-round text-sm">upload_file</span>
                <span className="hidden sm:inline">رفع Excel</span>
              </Button>
            </>
          )}
          {can("reports.create") && (
            <>
              <Button variant="primary" onClick={openCreate}>
                <span className="material-icons-round text-sm">note_add</span>
                إنشاء تقرير
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-center gap-3">
          <span className="material-icons-round text-rose-500">warning</span>
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {can('quality.reports.view') && (
        <Card title="ملخص تقارير الجودة (آخر أوامر الشغل)">
          {qualityReportRows.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد تقارير جودة مرتبطة بأوامر الشغل حاليًا.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-right py-2 px-2">أمر الشغل</th>
                    <th className="text-right py-2 px-2">الحالة</th>
                    <th className="text-right py-2 px-2">Inspected</th>
                    <th className="text-right py-2 px-2">Failed</th>
                    <th className="text-right py-2 px-2">Rework</th>
                    <th className="text-right py-2 px-2">FPY</th>
                    <th className="text-right py-2 px-2">Defect Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityReportRows.map((wo) => (
                    <tr key={wo.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 px-2 font-bold">#{wo.workOrderNumber}</td>
                      <td className="py-2 px-2">{wo.qualityStatus ?? 'pending'}</td>
                      <td className="py-2 px-2">{wo.qualitySummary?.inspectedUnits ?? 0}</td>
                      <td className="py-2 px-2">{wo.qualitySummary?.failedUnits ?? 0}</td>
                      <td className="py-2 px-2">{wo.qualitySummary?.reworkUnits ?? 0}</td>
                      <td className="py-2 px-2">{wo.qualitySummary?.firstPassYield ?? 0}%</td>
                      <td className="py-2 px-2">{wo.qualitySummary?.defectRate ?? 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <Button variant="outline" onClick={() => (window.location.hash = '#/quality/reports')}>
              <span className="material-icons-round text-sm">open_in_new</span>
              <span>فتح تقارير الجودة التفصيلية</span>
            </Button>
          </div>
        </Card>
      )}

      {/* WhatsApp Share Feedback Toast */}
      {shareToast && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3 animate-in fade-in duration-300">
          <span className="material-icons-round text-emerald-500">image</span>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex-1">{shareToast}</p>
          <button onClick={() => setShareToast(null)} className="p-1 text-emerald-400 hover:text-emerald-600 transition-colors shrink-0">
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
        {/* Row 1: Date filters */}
        <div className="flex flex-wrap gap-3 sm:gap-4 items-center">
          <Button
            variant={viewMode === 'today' ? 'primary' : 'outline'}
            onClick={handleShowToday}
            className="text-xs py-2"
          >
            <span className="material-icons-round text-sm">today</span>
            اليوم
          </Button>
          <div className="hidden sm:block h-8 w-[1px] bg-slate-200 dark:bg-slate-700"></div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500">من:</label>
              <input
                type="date"
                className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg py-2 px-2 sm:px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 w-[130px] sm:w-auto"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500">إلى:</label>
              <input
                type="date"
                className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg py-2 px-2 sm:px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 w-[130px] sm:w-auto"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={handleFetchRange} className="text-xs py-2">
              {reportsLoading ? (
                <span className="material-icons-round animate-spin text-sm">refresh</span>
              ) : (
                <span className="material-icons-round text-sm">search</span>
              )}
              عرض
            </Button>
          </div>
        </div>

        {/* Row 2: Line & Supervisor filters */}
        <div className="flex flex-wrap gap-3 items-center border-t border-slate-100 dark:border-slate-800 pt-3">
          <span className="material-icons-round text-slate-400 text-lg">filter_list</span>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 whitespace-nowrap">الخط:</label>
            <select
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg py-2 px-2 sm:px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 min-w-[140px]"
              value={filterLineId}
              onChange={(e) => setFilterLineId(e.target.value)}
            >
              <option value="">الكل</option>
              {_rawLines.map((l) => (
                <option key={l.id} value={l.id!}>{l.name}</option>
              ))}
            </select>
          </div>
          {!myEmployeeId && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 whitespace-nowrap">المشرف:</label>
              <select
                className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg py-2 px-2 sm:px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 min-w-[160px]"
                value={filterEmployeeId}
                onChange={(e) => setFilterEmployeeId(e.target.value)}
              >
                <option value="">الكل</option>
                {employees.filter((e) => e.level === 2).map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          )}
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterLineId(''); setFilterEmployeeId(''); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all"
            >
              <span className="material-icons-round text-sm">close</span>
              مسح الفلاتر ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Reports Table */}
      <SelectableTable<ProductionReport>
        data={displayedReports}
        columns={reportColumns}
        enableColumnVisibility
        highlightRowId={highlightReportId}
        getId={(r) => r.id!}
        bulkActions={reportBulkActions}
        renderActions={renderReportActions}
        emptyIcon="bar_chart"
        emptyTitle={`لا توجد تقارير${viewMode === 'today' ? ' لهذا اليوم' : ' في هذه الفترة'}`}
        emptySubtitle={can("reports.create") ? 'اضغط "إنشاء تقرير" لإضافة تقرير جديد' : 'لا توجد تقارير لعرضها حالياً'}
        footer={reportTableFooter}
      />

      {/* ══ Hidden print components (off-screen, only rendered for print) ══ */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <ProductionReportPrint
          ref={bulkPrintRef}
          title={viewMode === 'today' ? `تقارير إنتاج اليوم — ${getTodayDateString()}` : `تقارير الإنتاج — ${startDate} إلى ${endDate}`}
          subtitle={`${printRows.length} تقرير`}
          rows={printRows}
          totals={printTotals}
          printSettings={printTemplate}
        />
        <SingleReportPrint ref={singlePrintRef} report={printReport} printSettings={printTemplate} />
      </div>

      {/* ══ Create / Edit Report Modal ══ */}
      {showModal && (can("reports.create") || can("reports.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); setEditId(null); setSaveToast(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold">{editId ? 'تعديل تقرير إنتاج' : 'إنشاء تقرير إنتاج'}</h3>
              <button onClick={() => { setShowModal(false); setEditId(null); setSaveToast(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
              {saveToast && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex items-center gap-2 animate-in fade-in duration-300">
                  <span className="material-icons-round text-emerald-500 text-lg">check_circle</span>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex-1">{saveToast}</p>
                  <button onClick={() => setSaveToast(null)} className="text-emerald-400 hover:text-emerald-600 transition-colors">
                    <span className="material-icons-round text-sm">close</span>
                  </button>
                </div>
              )}
              {/* Work Order Selector */}
              {!editId && can('workOrders.view') && (() => {
                const activeWOs = workOrders.filter((w) => w.status === 'pending' || w.status === 'in_progress');
                if (activeWOs.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">
                      <span className="material-icons-round text-sm align-middle ml-1 text-primary">assignment</span>
                      أمر شغل (اختياري)
                    </label>
                    <select
                      className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-bold transition-all"
                      value=""
                      onChange={(e) => {
                        const wo = activeWOs.find((w) => w.id === e.target.value);
                        if (!wo) return;
                        setForm({
                          ...form,
                          lineId: wo.lineId,
                          productId: wo.productId,
                          employeeId: wo.supervisorId,
                        });
                      }}
                    >
                      <option value="">اختر أمر شغل لتعبئة البيانات تلقائياً</option>
                      {activeWOs.map((wo) => {
                        const pName = _rawProducts.find((p) => p.id === wo.productId)?.name ?? '';
                        const lName = _rawLines.find((l) => l.id === wo.lineId)?.name ?? '';
                        const remaining = wo.quantity - (wo.producedQuantity || 0);
                        return (
                          <option key={wo.id} value={wo.id!}>
                            {wo.workOrderNumber} — {pName} — {lName} — متبقي: {remaining} وحدة
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })()}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">التاريخ *</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">المشرف *</label>
                  <SearchableSelect
                    placeholder="اختر المشرف"
                    options={employees.filter((s) => s.level === 2).map((s) => ({ value: s.id, label: s.name }))}
                    value={form.employeeId}
                    onChange={(v) => setForm({ ...form, employeeId: v })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">خط الإنتاج *</label>
                  <SearchableSelect
                    placeholder="اختر الخط"
                    options={_rawLines.map((l) => ({ value: l.id!, label: l.name }))}
                    value={form.lineId}
                    onChange={(v) => setForm({ ...form, lineId: v })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">المنتج *</label>
                  <SearchableSelect
                    placeholder="اختر المنتج"
                    options={_rawProducts.map((p) => ({ value: p.id!, label: p.name }))}
                    value={form.productId}
                    onChange={(v) => setForm({ ...form, productId: v })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الكمية المنتجة *</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.quantityProduced || ''}
                    onChange={(e) => setForm({ ...form, quantityProduced: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الهالك</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.quantityWaste || ''}
                    onChange={(e) => setForm({ ...form, quantityWaste: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">عدد العمال *</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.workersCount || ''}
                    onChange={(e) => setForm({ ...form, workersCount: Number(e.target.value) })}
                    placeholder="0"
                  />
                  {formLineWorkers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleViewWorkers(form.lineId, form.date)}
                      className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                    >
                      <span className="material-icons-round text-xs">groups</span>
                      تم جلب {formLineWorkers.length} عامل مسجل — اضغط للعرض
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">ساعات العمل *</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.workHours || ''}
                    onChange={(e) => setForm({ ...form, workHours: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">ملحوظة</label>
                <textarea
                  rows={3}
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all resize-y"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="اكتب أي ملاحظة إضافية للتقرير..."
                />
              </div>
            </div>
            {canViewCosts && form.workersCount > 0 && form.workHours > 0 && form.quantityProduced > 0 && form.lineId && (
              (() => {
                const est = estimateReportCost(
                  form.workersCount, form.workHours, form.quantityProduced,
                  laborSettings?.hourlyRate ?? 0,
                  (_rawEmployees.find((e) => e.id === form.employeeId)?.hourlyRate ?? 0),
                  form.lineId,
                  costCenters, costCenterValues, costAllocations
                );
                return (
                  <div className="mx-4 sm:mx-6 mb-2 bg-primary/5 border border-primary/10 rounded-xl p-4 flex flex-wrap items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-primary text-lg">price_check</span>
                      <span className="text-xs font-bold text-slate-500">تكلفة تقديرية:</span>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-6 text-xs font-bold">
                      <span className="text-slate-600 dark:text-slate-400">عمالة: <span className="text-slate-800 dark:text-white">{formatCost(est.laborCost)} ج.م</span></span>
                      <span className="text-slate-600 dark:text-slate-400">غير مباشرة: <span className="text-slate-800 dark:text-white">{formatCost(est.indirectCost)} ج.م</span></span>
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
                    <div className="mx-4 sm:mx-6 mb-2 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex items-center gap-3">
                      <span className="material-icons-round text-emerald-600 text-lg">event_available</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">خطة مرتبطة</p>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-500">
                          {formatNumber(linked.producedQuantity ?? 0)} / {formatNumber(linked.plannedQuantity)} —
                          {' '}{Math.min(Math.round(((linked.producedQuantity ?? 0) / linked.plannedQuantity) * 100), 100)}%
                        </p>
                      </div>
                    </div>
                  )}
                  {blockWithoutPlan && (
                    <div className="mx-4 sm:mx-6 mb-2 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl p-3 flex items-center gap-3">
                      <span className="material-icons-round text-rose-500 text-lg">block</span>
                      <p className="text-xs font-bold text-rose-600 dark:text-rose-400">لا يوجد خطة إنتاج نشطة لهذا الخط والمنتج — التقارير بدون خطة غير مسموحة</p>
                    </div>
                  )}
                  {overProduced && (
                    <div className="mx-4 sm:mx-6 mb-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-center gap-3">
                      <span className="material-icons-round text-amber-500 text-lg">warning</span>
                      <p className="text-xs font-bold text-amber-600 dark:text-amber-400">تم الوصول للكمية المخططة — الإنتاج الزائد غير مسموح</p>
                    </div>
                  )}
                </>
              );
            })()}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
              <Button variant="outline" onClick={() => { setShowModal(false); setEditId(null); setSaveToast(null); }}>إلغاء</Button>
              {can('print') && (
                <Button
                  variant="outline"
                  onClick={() => handleSave(true)}
                  disabled={saving || !form.lineId || !form.productId || !form.employeeId || !form.quantityProduced || !form.workersCount || !form.workHours}
                >
                  {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                  <span className="material-icons-round text-sm">print</span>
                  حفظ وطباعة
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => handleSave(false)}
                disabled={saving || !form.lineId || !form.productId || !form.employeeId || !form.quantityProduced || !form.workersCount || !form.workHours}
              >
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">{editId ? 'save' : 'add'}</span>
                {editId ? 'حفظ التعديلات' : 'حفظ التقرير'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Delete Confirmation ══ */}
      {deleteConfirmId && can("reports.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد حذف التقرير</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف هذا التقرير؟</p>
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

      {/* ══ Bulk Delete Confirmation ══ */}
      {bulkDeleteItems && can("reports.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!bulkDeleting) setBulkDeleteItems(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_sweep</span>
            </div>
            <h3 className="text-lg font-bold mb-2">حذف {bulkDeleteItems.length} تقرير</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف التقارير المحددة؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setBulkDeleteItems(null)}
                disabled={bulkDeleting}
                className="px-4 py-2.5 rounded-lg font-bold text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleBulkDeleteConfirmed}
                disabled={bulkDeleting}
                className="px-4 py-2.5 rounded-lg font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {bulkDeleting ? (
                  <span className="material-icons-round animate-spin text-sm">refresh</span>
                ) : (
                  <span className="material-icons-round text-sm">delete</span>
                )}
                {bulkDeleting ? 'جاري الحذف...' : `حذف ${bulkDeleteItems.length} تقرير`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Import from Excel Modal ══ */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!importSaving) { setShowImportModal(false); setImportResult(null); } }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
                  <span className="material-icons-round text-emerald-600 dark:text-emerald-400">upload_file</span>
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold">استيراد تقارير من Excel</h3>
                    <button onClick={() => downloadReportsTemplate(templateLookups)} className="text-primary hover:text-primary/80 text-xs font-bold flex items-center gap-1 underline">
                      <span className="material-icons-round text-sm">download</span>
                      تحميل نموذج
                    </button>
                  </div>
                  {importResult && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {importResult.totalRows} صف — {importResult.validCount} صالح — {importResult.errorCount} خطأ
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => { if (!importSaving) { setShowImportModal(false); setImportResult(null); } }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                disabled={importSaving}
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {importParsing ? (
                <div className="text-center py-12">
                  <span className="material-icons-round text-4xl text-primary animate-spin block mb-3">refresh</span>
                  <p className="font-bold text-slate-600 dark:text-slate-400">جاري قراءة الملف...</p>
                </div>
              ) : importResult && importResult.rows.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-icons-round text-5xl text-slate-300 block mb-3">warning</span>
                  <p className="font-bold text-slate-600 dark:text-slate-400">لا توجد بيانات في الملف</p>
                  <p className="text-sm text-slate-400 mt-1">تأكد أن الملف يحتوي على أعمدة: التاريخ، خط الإنتاج، المنتج، المشرف، الكمية المنتجة، الهالك، عدد العمال، ساعات العمل</p>
                  <button onClick={() => downloadReportsTemplate(templateLookups)} className="text-primary hover:text-primary/80 text-sm font-bold flex items-center gap-1 underline mt-3 mx-auto">
                    <span className="material-icons-round text-sm">download</span>
                    تحميل نموذج التقارير
                  </button>
                </div>
              ) : importResult ? (
                <div className="space-y-4">
                  {/* Summary Badges */}
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400">
                      <span className="material-icons-round text-sm">description</span>
                      {importResult.totalRows} صف
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="material-icons-round text-sm">check_circle</span>
                      {importResult.validCount} صالح
                    </div>
                    {importResult.errorCount > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 dark:bg-rose-900/20 rounded-lg text-xs font-bold text-rose-500">
                        <span className="material-icons-round text-sm">error</span>
                        {importResult.errorCount} خطأ
                      </div>
                    )}
                    {importResult.warningCount > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs font-bold text-amber-600 dark:text-amber-400">
                        <span className="material-icons-round text-sm">warning</span>
                        {importResult.warningCount} تحذير
                      </div>
                    )}
                    {importResult.duplicateCount > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-xs font-bold text-orange-600 dark:text-orange-400">
                        <span className="material-icons-round text-sm">content_copy</span>
                        {importResult.duplicateCount} مكرر
                      </div>
                    )}
                  </div>

                  {/* Preview Table */}
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-right border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">#</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">الحالة</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">التاريخ</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">خط الإنتاج</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">المنتج</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">المشرف</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">الكود</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500 text-center">الكمية</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500 text-center">الهالك</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500 text-center">عمال</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500 text-center">ساعات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
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
                              <td className="px-3 py-2 text-slate-400 font-mono text-xs">{row.rowIndex}</td>
                              <td className="px-3 py-2">
                                {!isValid ? (
                                  <span className="material-icons-round text-rose-500 text-sm" title={row.errors.join('\n')}>error</span>
                                ) : row.isDuplicate ? (
                                  <span className="material-icons-round text-orange-500 text-sm" title="تقرير مكرر">content_copy</span>
                                ) : hasWarnings ? (
                                  <span className="material-icons-round text-amber-500 text-sm" title={row.warnings.join('\n')}>warning</span>
                                ) : (
                                  <span className="material-icons-round text-emerald-500 text-sm">check_circle</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-medium">{row.date}</td>
                              <td className={`px-3 py-2 ${row.lineId ? '' : 'text-rose-500'}`}>{row.lineName || '—'}</td>
                              <td className={`px-3 py-2 ${row.productId ? '' : 'text-rose-500'}`}>{row.productName || '—'}</td>
                              <td className={`px-3 py-2 ${row.employeeId ? '' : 'text-rose-500'}`}>{row.employeeName || '—'}</td>
                              <td className="px-3 py-2 text-slate-400 font-mono text-xs">{row.employeeCode || '—'}</td>
                              <td className="px-3 py-2 text-center font-bold">{row.quantityProduced}</td>
                              <td className="px-3 py-2 text-center text-rose-500">{row.quantityWaste}</td>
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
                    <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl p-4">
                      <p className="text-sm font-bold text-rose-600 dark:text-rose-400 mb-2">
                        <span className="material-icons-round text-sm align-middle ml-1">error</span>
                        الصفوف التالية تحتاج تعديل ولن يتم حفظها:
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {importResult.rows.filter((r) => r.errors.length > 0).map((row) => (
                          <p key={row.rowIndex} className="text-xs text-rose-600 dark:text-rose-400">
                            صف {row.rowIndex}: {row.errors.join(' · ')}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warning details */}
                  {importResult.warningCount > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                      <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-2">
                        <span className="material-icons-round text-sm align-middle ml-1">warning</span>
                        تنبيهات (سيتم الحفظ لكن يرجى المراجعة):
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {importResult.rows.filter((r) => r.warnings.length > 0).map((row) => (
                          <p key={row.rowIndex} className="text-xs text-amber-600 dark:text-amber-400">
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
            {importResult && importResult.validCount > 0 && (
              <div className="px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                {importSaving ? (
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
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
                    <Button variant="outline" onClick={() => { setShowImportModal(false); setImportResult(null); }}>إلغاء</Button>
                    <Button variant="primary" onClick={handleImportSave}>
                      <span className="material-icons-round text-sm">save</span>
                      حفظ {importResult.validCount} تقرير
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
          pending: { label: 'قيد الانتظار', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
          in_progress: { label: 'قيد التنفيذ', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
          completed: { label: 'مكتمل', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
          cancelled: { label: 'ملغي', color: 'text-rose-600 bg-rose-50 dark:bg-rose-900/20' },
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
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="material-icons-round text-primary">assignment</span>
                  <h3 className="font-bold">{wo.workOrderNumber}</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                </div>
                <button onClick={() => setViewWOReport(null)} className="text-slate-400 hover:text-slate-600">
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {rows.map((r) => (
                    <div key={r.label} className="text-sm">
                      <span className="text-slate-400 block text-xs mb-0.5">{r.label}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{r.value}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h4 className="text-sm font-bold text-slate-500 mb-3">المخطط vs الفعلي</h4>
                  <div className="space-y-3">
                    {compareRows.map((cr) => (
                      <div key={cr.label} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <span className="material-icons-round text-primary text-lg">{cr.icon}</span>
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300 w-16">{cr.label}</span>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 text-center">
                            <span className="text-xs text-slate-400 block">مخطط</span>
                            <span className="text-sm font-black text-slate-700 dark:text-white">{cr.planned}</span>
                          </div>
                          <span className="material-icons-round text-slate-300 text-sm">arrow_forward</span>
                          <div className="flex-1 text-center">
                            <span className="text-xs text-slate-400 block">فعلي</span>
                            <span className="text-sm font-black text-primary">{cr.actual}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {wo.notes && (
                  <div className="text-sm">
                    <span className="text-slate-400 block text-xs mb-1">ملاحظات</span>
                    <p className="text-slate-600 dark:text-slate-300 font-medium">{wo.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ View Workers Modal ══ */}
      {viewWorkersData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewWorkersData(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] border border-slate-200 dark:border-slate-800 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-primary">groups</span>
                <h3 className="font-bold">عمالة {getLineName(viewWorkersData.lineId)}</h3>
                <span className="text-xs text-slate-400 font-medium">{viewWorkersData.date}</span>
              </div>
              <button onClick={() => setViewWorkersData(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {viewWorkersLoading ? (
                <div className="text-center py-8">
                  <span className="material-icons-round text-3xl text-primary animate-spin block mb-2">refresh</span>
                  <p className="text-sm text-slate-500">جاري التحميل...</p>
                </div>
              ) : viewWorkersData.workers.length === 0 ? (
                <div className="text-center py-8">
                  <span className="material-icons-round text-4xl text-slate-300 dark:text-slate-700 block mb-2">person_off</span>
                  <p className="text-sm text-slate-500 font-medium">لا يوجد عمالة مسجلة على هذا الخط في هذا اليوم</p>
                </div>
              ) : (
                <>
                  <div className="mb-3 px-3 py-2 bg-primary/5 rounded-xl text-center">
                    <span className="text-sm font-bold text-primary">{viewWorkersData.workers.length} عامل</span>
                  </div>
                  <div className="divide-y divide-slate-50 dark:divide-slate-800">
                    {viewWorkersData.workers.map((w, i) => (
                      <div key={w.id || i} className="flex items-center gap-3 py-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="material-icons-round text-primary text-sm">person</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-slate-800 dark:text-white truncate">{w.employeeName}</p>
                          <p className="text-xs text-slate-400 font-mono">{w.employeeCode}</p>
                        </div>
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
