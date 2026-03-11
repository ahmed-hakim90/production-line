import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedPrint } from '@/utils/printManager';
import { Card, Button, SearchableSelect } from '../components/UI';
import { usePermission } from '../../../utils/permissions';
import { exportToPDF, shareToWhatsApp, ShareResult } from '../../../utils/reportExport';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import { formatNumber, getOperationalDateString } from '../../../utils/calculations';
import type { LineWorkerAssignment, ReportComponentScrapItem } from '../../../types';
import { ProductionLineStatus } from '../../../types';
import {
  SingleReportPrint,
  ReportPrintRow,
} from '../components/ProductionReportPrint';
import { getReportDuplicateMessage } from '../utils/reportDuplicateError';
import { PageHeader } from '../../../components/PageHeader';

export const QuickAction: React.FC = () => {
  const { can } = usePermission();
  const createReport = useAppStore((s) => s.createReport);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const lineStatuses = useAppStore((s) => s.lineStatuses);
  const employees = useAppStore((s) => s.employees);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const saveErrorFromStore = useAppStore((s) => s.error);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);

  const [employeeId, setEmployeeId] = useState('');
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [reportType, setReportType] = useState<'finished_product' | 'component_injection'>('finished_product');
  const [quantity, setQuantity] = useState('');
  const [workersProduction, setWorkersProduction] = useState('');
  const [workersPackaging, setWorkersPackaging] = useState('');
  const [workersQuality, setWorkersQuality] = useState('');
  const [workersMaintenance, setWorkersMaintenance] = useState('');
  const [workersExternal, setWorkersExternal] = useState('');
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');
  const [componentScrapItems, setComponentScrapItems] = useState<ReportComponentScrapItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [printReport, setPrintReport] = useState<ReportPrintRow | null>(null);
  const [lineWorkers, setLineWorkers] = useState<LineWorkerAssignment[]>([]);
  const [showLineWorkers, setShowLineWorkers] = useState(false);
  const [loadingWorkersCount, setLoadingWorkersCount] = useState(false);
  const [workerPickerId, setWorkerPickerId] = useState('');
  const [workerActionBusy, setWorkerActionBusy] = useState(false);
  const [workerActionError, setWorkerActionError] = useState<string | null>(null);
  const [rawMaterialOptions, setRawMaterialOptions] = useState<Array<{ id: string; name: string; code: string }>>([]);

  const printRef = useRef<HTMLDivElement>(null);

  const [today, setToday] = useState(() => getOperationalDateString(8));
  const canCreateFinishedReportsBase = can('reports.create');
  const canManageComponentInjectionReports = can('reports.componentInjection.manage') || can('reports.componentInjection.only');
  const forceInjectionOnly = can('reports.componentInjection.only') && !canCreateFinishedReportsBase;
  const canCreateFinishedReports = canCreateFinishedReportsBase && !forceInjectionOnly;

  useEffect(() => {
    if (forceInjectionOnly) {
      setReportType('component_injection');
    }
  }, [forceInjectionOnly]);

  useEffect(() => {
    let mounted = true;
    rawMaterialService.getAll().then((list) => {
      if (!mounted) return;
      setRawMaterialOptions(
        list
          .filter((m) => m.id && m.isActive !== false)
          .map((m) => ({ id: m.id!, name: m.name, code: m.code || '' }))
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

  const selectableLines = useMemo(() => (
    reportType === 'component_injection'
      ? _rawLines.filter((line) => line.id && injectionLineIds.has(line.id))
      : _rawLines
  ), [reportType, _rawLines, injectionLineIds]);

  const selectableProducts = useMemo(() => (
    reportType === 'component_injection'
      ? rawMaterialOptions.map((m) => ({ value: m.id, label: m.code ? `${m.name} (${m.code})` : m.name }))
      : _rawProducts.map((p) => ({ value: p.id!, label: p.name }))
  ), [reportType, rawMaterialOptions, _rawProducts]);

  useEffect(() => {
    if (reportType !== 'component_injection') return;
    if (lineId && !injectionLineIds.has(lineId)) setLineId('');
  }, [reportType, lineId, injectionLineIds]);

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

  const workersTotal = useMemo(() => (
    (Number(workersProduction) || 0)
    + (Number(workersPackaging) || 0)
    + (Number(workersQuality) || 0)
    + (Number(workersMaintenance) || 0)
    + (Number(workersExternal) || 0)
  ), [workersProduction, workersPackaging, workersQuality, workersMaintenance, workersExternal]);

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

  useEffect(() => {
    if (!isSupervisorReporter || !currentEmployee?.id) return;
    setEmployeeId((prev) => (prev === currentEmployee.id ? prev : currentEmployee.id));
  }, [isSupervisorReporter, currentEmployee?.id]);

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
    const canSaveCurrentType = reportType === 'component_injection' ? canManageComponentInjectionReports : canCreateFinishedReports;
    if (!canSaveCurrentType) return;
    if (!lineId || !productId || !employeeId) {
      setSaveError('أكمل بيانات الخط والمنتج والمشرف أولاً.');
      return;
    }
    if (Number(quantity || 0) <= 0 || Number(hours || 0) <= 0 || (requiresWorkers && workersTotal <= 0)) {
      setSaveError('أكمل الحقول المطلوبة أولاً (الكمية، تفاصيل العمالة، وساعات العمل).');
      return;
    }
    setSaving(true);
    setSaveError(null);

    const data = {
      employeeId,
      lineId,
      productId,
      reportType,
      date: today,
      quantityProduced: Number(quantity),
      workersCount: requiresWorkers ? workersTotal : 0,
      workersProductionCount: requiresWorkers ? (Number(workersProduction) || 0) : 0,
      workersPackagingCount: requiresWorkers ? (Number(workersPackaging) || 0) : 0,
      workersQualityCount: requiresWorkers ? (Number(workersQuality) || 0) : 0,
      workersMaintenanceCount: requiresWorkers ? (Number(workersMaintenance) || 0) : 0,
      workersExternalCount: requiresWorkers ? (Number(workersExternal) || 0) : 0,
      workHours: Number(hours),
      notes: notes.trim(),
      componentScrapItems,
    };

    const id = await createReport(data);

    if (id) {
      const row: ReportPrintRow = {
        date: today,
        lineName: getLineName(lineId),
        productName: getProductName(productId),
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
      };
      setPrintReport(row);
      setSaved(true);
      setSaveError(null);
    } else {
      setSaveError(getReportDuplicateMessage(saveErrorFromStore, 'تعذر حفظ التقرير'));
    }
    setSaving(false);
  };

  const handleReset = () => {
    setEmployeeId(isSupervisorReporter && currentEmployee?.id ? currentEmployee.id : '');
    setLineId('');
    setProductId('');
    setReportType(forceInjectionOnly ? 'component_injection' : 'finished_product');
    setQuantity('');
    setWorkersProduction('');
    setWorkersPackaging('');
    setWorkersQuality('');
    setWorkersMaintenance('');
    setWorkersExternal('');
    setHours('');
    setNotes('');
    setComponentScrapItems([]);
    setSaved(false);
    setSaveError(null);
    setPrintReport(null);
  };

  const handlePrint = useManagedPrint({ contentRef: printRef, printSettings: printTemplate });

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
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
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير-سريع-${today}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setExporting(false);
    }
  };

  const showShareFeedback = (result: ShareResult) => {
    if (result.method === 'native_share' || result.method === 'cancelled') return;
    const msg = result.copied
      ? 'تم تحميل الصورة ونسخها — افتح المحادثة والصق الصورة (Ctrl+V)'
      : 'تم تحميل صورة التقرير — أرفقها في محادثة واتساب';
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 6000);
  };

  const handleShareWhatsApp = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const result = await shareToWhatsApp(
        printRef.current,
        `تقرير إنتاج - ${getLineName(lineId)} - ${today}`
      );
      showShareFeedback(result);
    } finally {
      setExporting(false);
    }
  };

  const workOrders = useAppStore((s) => s.workOrders);
  const activeEmployees = employees.filter((s) => s.isActive && s.level === 2);
  const activeWOs = useMemo(
    () => {
      const activeOnly = workOrders.filter((w) => w.status === 'pending' || w.status === 'in_progress');
      if (!isSupervisorReporter || !currentEmployee?.id) return activeOnly;

      const currentName = (currentEmployee.name || '').trim().toLowerCase();
      return activeOnly.filter((w) => {
        if (w.supervisorId === currentEmployee.id) return true;
        return (w.supervisorId || '').trim().toLowerCase() === currentName;
      });
    },
    [workOrders, isSupervisorReporter, currentEmployee?.id, currentEmployee?.name],
  );

  const handleSelectWO = useCallback((woId: string) => {
    const wo = activeWOs.find((w) => w.id === woId);
    if (!wo) return;
    setLineId(wo.lineId);
    setProductId(wo.productId);
    setEmployeeId(isSupervisorReporter && currentEmployee?.id ? currentEmployee.id : wo.supervisorId);
  }, [activeWOs, isSupervisorReporter, currentEmployee?.id]);

  const totalComponentScrapQty = useMemo(
    () => componentScrapItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [componentScrapItems],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدخال سريع"
        subtitle="إدخال بيانات الإنتاج بسرعة — حفظ، طباعة، ومشاركة."
        icon="bolt"
      />

      {/* WhatsApp Share Feedback Toast */}
      {shareToast && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3 animate-in fade-in duration-300">
          <span className="material-icons-round text-emerald-500">image</span>
          <p className="text-sm font-medium text-emerald-700 flex-1">{shareToast}</p>
          <button onClick={() => setShareToast(null)} className="p-1 text-emerald-400 hover:text-emerald-600 transition-colors shrink-0">
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
      )}

      {saveError && (
        <div className="bg-rose-50 border border-rose-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
          <span className="material-icons-round text-rose-500">error</span>
          <p className="text-sm font-bold text-rose-700 flex-1">{saveError}</p>
          <button onClick={() => setSaveError(null)} className="p-1 text-rose-400 hover:text-rose-600 transition-colors shrink-0">
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
      )}
      {forceInjectionOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
          <span className="material-icons-round text-amber-500">warning</span>
          <p className="text-sm font-bold text-amber-700">
            هذا المستخدم مخصص لتقارير الحقن فقط.
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
              <select
                className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold focus:border-primary focus:ring-2 focus:ring-primary/12"
                value=""
                onChange={(e) => handleSelectWO(e.target.value)}
              >
                <option value="">اختر أمر شغل لتعبئة البيانات تلقائياً</option>
                {activeWOs.map((wo) => {
                  const pName = _rawProducts.find((p) => p.id === wo.productId)?.name ?? '';
                  const lName = _rawLines.find((l) => l.id === wo.lineId)?.name ?? '';
                  const remaining = wo.quantity - (wo.producedQuantity || 0);
                  return (
                    <option key={wo.id} value={wo.id!}>
                      {wo.workOrderNumber} — {pName} — {lName} — متبقي: {formatNumber(remaining)} وحدة
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">نوع التقرير</label>
              <select
                value={reportType}
                onChange={(e) => {
                  const nextType = e.target.value === 'component_injection' ? 'component_injection' : 'finished_product';
                  if (nextType === 'component_injection' && !canManageComponentInjectionReports) return;
                  if (nextType === 'finished_product' && !canCreateFinishedReports) return;
                  setReportType(nextType);
                  setLineId('');
                  setProductId('');
                }}
                className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold focus:border-primary focus:ring-2 focus:ring-primary/12"
              >
                {canCreateFinishedReports && <option value="finished_product">تقرير إنتاج</option>}
                {canManageComponentInjectionReports && <option value="component_injection">تقرير مكون حقن</option>}
              </select>
            </div>
            <div>
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">المشرف *</label>
              {isSupervisorReporter && currentEmployee ? (
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
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">{reportType === 'component_injection' ? 'الخط *' : 'خط الإنتاج *'}</label>
              <SearchableSelect
                placeholder="اختر الخط"
                options={selectableLines.map((l) => ({ value: l.id!, label: l.name }))}
                value={lineId}
                onChange={setLineId}
              />
            </div>
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
            {reportType !== 'component_injection' && (
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
                  تم جلب {lineWorkers.length} عامل مسجل — اضغط للعرض
                </button>
              )}
              {lineId && lineWorkers.length === 0 && (
                <p className="mt-1.5 text-[11px] text-slate-400">لا توجد عمالة مسجلة على هذا الخط اليوم.</p>
              )}
            </div>
            )}
            <div className="md:col-span-2">
              <label className="text-sm font-bold text-[var(--color-text-muted)] mb-2 block">ملحوظة</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/12 resize-y"
                placeholder="اكتب أي ملحوظة إضافية للتقرير..."
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap gap-3 mt-6 pt-4 border-t border-[var(--color-border)]">
            <Button
              onClick={handleSave}
              disabled={saving || !lineId || !productId || !employeeId || !quantity || (reportType !== 'component_injection' && workersTotal <= 0) || !hours || (reportType === 'component_injection' ? !canManageComponentInjectionReports : !canCreateFinishedReports)}
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
            <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto">
              <span className="material-icons-round text-lg">refresh</span>
              مسح
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Success Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-[var(--border-radius-lg)] px-5 py-4 flex items-center gap-3">
            <span className="material-icons-round text-emerald-500 text-2xl">check_circle</span>
            <div>
              <p className="font-bold text-emerald-700">تم حفظ التقرير بنجاح!</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-500">يمكنك الآن الطباعة أو التصدير أو المشاركة.</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <Button onClick={() => handlePrint()} className="w-full sm:w-auto">
              <span className="material-icons-round text-lg">print</span>
              طباعة
            </Button>
            <Button variant="secondary" disabled={exporting} onClick={handleExportPDF} className="w-full sm:w-auto">
              {exporting ? (
                <span className="material-icons-round animate-spin text-sm">refresh</span>
              ) : (
                <span className="material-icons-round text-lg">picture_as_pdf</span>
              )}
              تصدير PDF
            </Button>
            <Button variant="secondary" disabled={exporting} onClick={handleExportImage} className="w-full sm:w-auto">
              <span className="material-icons-round text-lg">image</span>
              تصدير كصورة
            </Button>
            <Button variant="outline" disabled={exporting} onClick={handleShareWhatsApp} className="w-full sm:w-auto">
              <span className="material-icons-round text-lg">share</span>
              مشاركة عبر WhatsApp
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
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">الموظف</p>
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
                {printReport.notes?.trim() && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 rounded-[var(--border-radius-lg)] p-3 border border-amber-100 dark:border-amber-900/20">
                    <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">ملحوظة</p>
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

      {/* Hidden print component */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <SingleReportPrint ref={printRef} report={printReport} printSettings={printTemplate} />
      </div>
    </div>
  );
};
