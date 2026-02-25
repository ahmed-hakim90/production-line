import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, KPIBox } from '../components/UI';
import { useShallowStore } from '../store/useAppStore';
import { scanEventService } from '../services/scanEventService';
import { formatNumber } from '../utils/calculations';
import { qualitySettingsService } from '../modules/quality/services/qualitySettingsService';

const formatTs = (ts: any) => {
  if (!ts) return '—';
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const WorkOrderScanner: React.FC = () => {
  const { id: workOrderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    workOrders,
    _rawProducts,
    _rawLines,
    _rawEmployees,
    currentEmployee,
    workOrderScanEvents,
    liveProduction,
    fetchWorkOrders,
    subscribeToWorkOrderScans,
    toggleBarcodeScan,
    updateWorkOrder,
  } = useShallowStore((s) => ({
    workOrders: s.workOrders,
    _rawProducts: s._rawProducts,
    _rawLines: s._rawLines,
    _rawEmployees: s._rawEmployees,
    currentEmployee: s.currentEmployee,
    workOrderScanEvents: s.workOrderScanEvents,
    liveProduction: s.liveProduction,
    fetchWorkOrders: s.fetchWorkOrders,
    subscribeToWorkOrderScans: s.subscribeToWorkOrderScans,
    toggleBarcodeScan: s.toggleBarcodeScan,
    updateWorkOrder: s.updateWorkOrder,
  }));

  const [serialInput, setSerialInput] = useState('');
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeWorkers, setCloseWorkers] = useState(0);
  const [closeConfirmedQty, setCloseConfirmedQty] = useState('');
  const [closeBusy, setCloseBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playFeedbackTone = useCallback((type: 'success' | 'error') => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioCtx();
    }

    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = type === 'success' ? 'sine' : 'square';
    oscillator.frequency.value = type === 'success' ? 880 : 220;
    gainNode.gain.value = 0.0001;
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;
    const end = now + 0.12;
    gainNode.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.start(now);
    oscillator.stop(end);
  }, []);

  useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders]);

  useEffect(() => {
    if (!workOrderId) return;
    const unsub = subscribeToWorkOrderScans(workOrderId);
    return () => unsub();
  }, [workOrderId, subscribeToWorkOrderScans]);

  const workOrder = useMemo(
    () => workOrders.find((w) => w.id === workOrderId) ?? null,
    [workOrders, workOrderId],
  );

  const productName = useMemo(
    () => _rawProducts.find((p) => p.id === workOrder?.productId)?.name ?? '—',
    [_rawProducts, workOrder?.productId],
  );
  const lineName = useMemo(
    () => _rawLines.find((l) => l.id === workOrder?.lineId)?.name ?? '—',
    [_rawLines, workOrder?.lineId],
  );
  const supervisorName = useMemo(
    () => _rawEmployees.find((e) => e.id === workOrder?.supervisorId)?.name ?? '—',
    [_rawEmployees, workOrder?.supervisorId],
  );

  const sessions = useMemo(
    () => scanEventService.sessionsFromEvents(workOrderScanEvents),
    [workOrderScanEvents],
  );

  const summary = liveProduction[workOrderId ?? ''] ?? scanEventService.summaryFromSessions(sessions);

  const openCloseModal = useCallback(() => {
    setCloseWorkers(summary.activeWorkers || workOrder?.actualWorkersCount || workOrder?.maxWorkers || 0);
    setCloseConfirmedQty(String(summary.completedUnits || 0));
    setCloseModalOpen(true);
  }, [summary.activeWorkers, summary.completedUnits, workOrder?.actualWorkersCount, workOrder?.maxWorkers]);

  const handleScan = async (rawCode: string) => {
    if (!workOrder || !workOrderId) return;
    if (workOrder.status === 'completed') {
      setScanError('تم إغلاق أمر الشغل — المسح غير متاح');
      return;
    }
    const code = rawCode.trim();
    if (!code) return;

    setBusy(true);
    setScanMsg(null);
    setScanError(null);
    try {
      const result = await toggleBarcodeScan({
        workOrderId,
        lineId: workOrder.lineId,
        productId: workOrder.productId,
        serialBarcode: code,
        ...(currentEmployee?.id ? { employeeId: currentEmployee.id } : {}),
      });
      if (result.action === 'IN') {
        setScanMsg(`تم تسجيل دخول للوحدة: ${code}`);
      } else {
        setScanMsg(`تم تسجيل خروج للوحدة: ${code} — زمن الدورة ${formatNumber(result.cycleSeconds || 0)} ثانية`);
      }
      playFeedbackTone('success');
      setSerialInput('');
    } catch (error: any) {
      setScanError(error?.message || 'فشل تسجيل الاسكان، حاول مرة أخرى');
      playFeedbackTone('error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (!workOrderId) return;
    const ok = window.confirm('هل تريد حذف هذه الجلسة؟ سيتم حذف الدخول والخروج المرتبطين بها.');
    if (!ok) return;
    setScanMsg(null);
    setScanError(null);
    setDeletingSessionId(sessionId);
    try {
      await scanEventService.deleteSession(workOrderId, sessionId);
      const latest = await scanEventService.buildWorkOrderSummary(workOrderId);
      await updateWorkOrder(workOrderId, {
        actualProducedFromScans: latest.summary.completedUnits || 0,
        actualWorkersCount: latest.summary.activeWorkers || 0,
        scanSummary: latest.summary,
      });
      setScanMsg('تم حذف الجلسة بنجاح');
      playFeedbackTone('success');
    } catch (error: any) {
      setScanError(error?.message || 'فشل حذف الجلسة');
      playFeedbackTone('error');
    } finally {
      setDeletingSessionId(null);
    }
  }, [playFeedbackTone, updateWorkOrder, workOrderId]);

  const handleCloseWorkOrder = useCallback(async () => {
    if (!workOrder || !workOrderId) return;
    setCloseBusy(true);
    setScanMsg(null);
    setScanError(null);
    try {
      const qualityPolicies = await qualitySettingsService.getPolicies();
      if (qualityPolicies.closeRequiresQualityApproval && workOrder.qualityStatus !== 'approved') {
        setScanError('لا يمكن إنهاء أمر الشغل قبل اعتماد الجودة');
        playFeedbackTone('error');
        return;
      }
      const latest = await scanEventService.buildWorkOrderSummary(workOrderId);
      const scannedQty = latest.summary.completedUnits || 0;
      const parsedConfirmedQty = Number(closeConfirmedQty);
      const confirmedQty = Number.isFinite(parsedConfirmedQty) ? parsedConfirmedQty : scannedQty;

      const closeNotes: string[] = [];
      if (confirmedQty !== scannedQty) {
        closeNotes.push(`الكمية المؤكدة عند الإغلاق: ${confirmedQty} (كمية الاسكان: ${scannedQty})`);
      }
      closeNotes.push(`العمالة الفعلية عند الإغلاق: ${Number(closeWorkers) || 0}`);
      const mergedNote = [workOrder.notes, ...closeNotes].filter(Boolean).join(' | ');

      await updateWorkOrder(workOrderId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        // Keep scan tracked quantity as the official scan result.
        actualProducedFromScans: scannedQty,
        actualWorkersCount: Number(closeWorkers) || 0,
        scanSummary: latest.summary,
        scanSessionClosedAt: new Date().toISOString(),
        notes: mergedNote,
      });

      setCloseModalOpen(false);
      setScanMsg('تم إنهاء أمر الشغل بنجاح');
      playFeedbackTone('success');
    } catch (error: any) {
      setScanError(error?.message || 'فشل إنهاء أمر الشغل');
      playFeedbackTone('error');
    } finally {
      setCloseBusy(false);
    }
  }, [closeConfirmedQty, closeWorkers, playFeedbackTone, updateWorkOrder, workOrder, workOrderId]);

  useEffect(() => {
    if (workOrder?.status === 'completed') return;

    const flushBuffer = () => {
      const code = scanBufferRef.current.trim();
      scanBufferRef.current = '';
      if (!code || busy) return;
      void handleScan(code);
    };

    const scheduleFlush = () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      // Barcode scanners usually send characters very fast; short idle means scan end.
      scanTimerRef.current = setTimeout(flushBuffer, 120);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Enter') {
        if (scanBufferRef.current.trim()) {
          e.preventDefault();
          flushBuffer();
        }
        return;
      }
      if (e.key.length !== 1) return;
      scanBufferRef.current += e.key;
      scheduleFlush();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [busy, handleScan, workOrder?.status]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (!workOrderId) {
    return (
      <Card>
        <p className="text-sm font-bold text-rose-600">رقم أمر الشغل غير صحيح.</p>
      </Card>
    );
  }

  if (!workOrder) {
    return (
      <Card>
        <div className="space-y-3">
          <p className="text-sm font-bold text-slate-500">جاري تحميل أمر الشغل...</p>
          <Button variant="outline" onClick={() => navigate('/work-orders')}>رجوع لأوامر الشغل</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white">ماسح أمر الشغل</h2>
            <p className="text-sm text-slate-500">
              {workOrder.workOrderNumber} — {productName} — {lineName}
            </p>
            <p className="text-xs text-slate-400 mt-1">المشرف: {supervisorName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={workOrder.status === 'completed' ? 'success' : workOrder.status === 'in_progress' ? 'warning' : 'info'}>
              {workOrder.status === 'completed' ? 'مكتمل' : workOrder.status === 'in_progress' ? 'قيد التنفيذ' : 'قيد الانتظار'}
            </Badge>
            {workOrder.status !== 'completed' && (
              <Button variant="primary" onClick={openCloseModal}>
                <span className="material-icons-round text-sm">task_alt</span>
                الانتهاء
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/work-orders')}>رجوع</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPIBox label="وحدات مكتملة" value={summary.completedUnits} icon="check_circle" colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" />
        <KPIBox label="وحدات قيد التشغيل" value={summary.inProgressUnits} icon="hourglass_top" colorClass="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
        <KPIBox label="عمالة فعالة" value={summary.activeWorkers} icon="groups" colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <KPIBox label="متوسط السيكل تايم" value={summary.avgCycleSeconds} icon="timer" unit="ث" colorClass="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" />
      </div>

      <Card>
        {workOrder.status !== 'completed' ? (
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 mb-1">باركود القطعة (Serial)</label>
              <input
                ref={inputRef}
                type="text"
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && serialInput.trim() && !busy) {
                    handleScan(serialInput);
                  }
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                placeholder="امسح أو أدخل السيريال ثم Enter"
                autoFocus
                onBlur={() => {
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="primary" onClick={() => handleScan(serialInput)} disabled={busy || !serialInput.trim()}>
                {busy && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                تسجيل الاسكان
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm font-bold text-slate-500">تم إغلاق أمر الشغل — عرض السجل فقط.</p>
        )}
        {scanMsg && (
          <p className="mt-3 text-sm font-bold text-emerald-600">{scanMsg}</p>
        )}
        {scanError && (
          <p className="mt-3 text-sm font-bold text-rose-600">{scanError}</p>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">سجل الوحدات</h3>
          <span className="text-xs text-slate-400">آخر {sessions.length} جلسة</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold">
                <th className="text-right py-3 px-3">المنتج</th>
                <th className="text-right py-3 px-3">الباركود</th>
                <th className="text-right py-3 px-3">الحالة</th>
                <th className="text-right py-3 px-3">دخول</th>
                <th className="text-right py-3 px-3">خروج</th>
                <th className="text-right py-3 px-3">السيكل تايم</th>
                <th className="text-right py-3 px-3">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">لا توجد جلسات اسكان بعد</td>
                </tr>
              )}
              {sessions.map((session) => (
                <tr key={session.sessionId} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="py-3 px-3 font-bold">{productName}</td>
                  <td className="py-3 px-3 font-mono text-xs">{session.serialBarcode}</td>
                  <td className="py-3 px-3">
                    <Badge variant={session.status === 'closed' ? 'success' : 'warning'}>
                      {session.status === 'closed' ? 'مكتمل' : 'قيد التشغيل'}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 text-slate-500 font-mono text-xs">{formatTs(session.inAt)}</td>
                  <td className="py-3 px-3 text-slate-500 font-mono text-xs">{formatTs(session.outAt)}</td>
                  <td className="py-3 px-3 font-mono text-xs font-bold">
                    {session.cycleSeconds ? `${formatNumber(session.cycleSeconds)} ث` : '—'}
                  </td>
                  <td className="py-3 px-3">
                    {workOrder.status !== 'completed' ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteSession(session.sessionId)}
                        disabled={deletingSessionId === session.sessionId}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 disabled:opacity-60 transition-colors"
                      >
                        {deletingSessionId === session.sessionId ? (
                          <span className="material-icons-round animate-spin text-sm">refresh</span>
                        ) : (
                          <span className="material-icons-round text-sm">delete</span>
                        )}
                        إزالة
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 font-bold">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {closeModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !closeBusy && setCloseModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-black mb-1">تأكيد إنهاء أمر الشغل</h3>
            <p className="text-xs text-slate-500 mb-4">{workOrder.workOrderNumber} — {productName}</p>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                <p className="text-xs text-slate-500 font-bold mb-1">كمية الاسكان الحالية (لحظي)</p>
                <p className="text-xl font-black text-emerald-600">{formatNumber(summary.completedUnits)}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">الكمية المؤكدة (اختياري لو في اختلاف)</label>
                <input
                  type="number"
                  min={0}
                  value={closeConfirmedQty}
                  onChange={(e) => setCloseConfirmedQty(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
                />
                <p className="text-[11px] text-slate-400 mt-1">كمية الاسكان ستظل كما هي، وسيتم فقط تسجيل الاختلاف كملاحظة.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">عدد العمالة الفعلية</label>
                <input
                  type="number"
                  min={0}
                  value={closeWorkers}
                  onChange={(e) => setCloseWorkers(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-5">
              <Button variant="outline" onClick={() => setCloseModalOpen(false)} disabled={closeBusy}>إلغاء</Button>
              <Button variant="primary" onClick={handleCloseWorkOrder} disabled={closeBusy}>
                {closeBusy && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                تأكيد الإنهاء
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

