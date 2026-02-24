import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, KPIBox } from '../components/UI';
import { useShallowStore } from '../store/useAppStore';
import { scanEventService } from '../services/scanEventService';
import { formatNumber } from '../utils/calculations';

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
  }));

  const [serialInput, setSerialInput] = useState('');
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const handleScan = async (rawCode: string) => {
    if (!workOrder || !workOrderId) return;
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

  useEffect(() => {
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
  }, [busy, handleScan]);

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
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">لا توجد جلسات اسكان بعد</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  );
};

