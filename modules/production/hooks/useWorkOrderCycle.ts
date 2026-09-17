import { useCallback, useEffect, useRef, useState } from 'react';
import { workOrderCycleService, type CycleWorkspace } from '../services/workOrderCycleService';

export function useWorkOrderCycle(orderId?: string, directory = false) {
  const [data, setData] = useState<CycleWorkspace | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const directoryLoaded = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!navigator.onLine) { setError('الاتصال مقطوع. أعد الاتصال لتحديث الحالة قبل تنفيذ أي إجراء.'); setLoading(false); return; }
    const needDirectory = directory && !directoryLoaded.current;
    try {
      const result = await workOrderCycleService.read({ orderId, directory: needDirectory });
      if (request === generation.current) {
        setData(previous => needDirectory || !previous ? result : { ...result, directory: previous.directory });
        if (needDirectory) directoryLoaded.current = true;
        setError('');
      }
    } catch (reason) {
      if (request === generation.current) setError(reason instanceof Error ? reason.message : 'تعذر تحديث البيانات.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [orderId, directory]);
  useEffect(() => {
    setData(null); setLoading(true); directoryLoaded.current = false; void refresh();
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const offline = () => { generation.current++; setError('الاتصال مقطوع. أعد الاتصال لتحديث الحالة قبل تنفيذ أي إجراء.'); setLoading(false); };
    const timer = window.setInterval(update, 15000);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    window.addEventListener('offline', offline);
    return () => { generation.current++; clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('online', update); window.removeEventListener('offline', offline); };
  }, [refresh]);
  return { data, error, loading, refresh };
}
