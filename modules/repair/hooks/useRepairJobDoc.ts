import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { REPAIR_JOBS_COLLECTION } from '../collections';
import type { RepairJob } from '../types';
import { repairJobService } from '../services/repairJobService';
import { repairTechnicianService } from '../services/repairTechnicianService';

/** مستمع واحد على طلب محدد — للورشة/الفني، من غير ما نحمّل كل الطلبات لحظيًا */
export function useRepairJobDoc(jobId: string | undefined, technicianMode = false) {
  const [job, setJob] = useState<RepairJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);

  useEffect(() => {
    if (!isConfigured || !jobId) {
      setJob(null);
      setLoading(false);
      return () => {};
    }
    setLoading(true);
    setError(null);
    if (technicianMode) {
      let cancelled = false;
      const load = async () => {
        try {
          const row = await repairTechnicianService.get(jobId);
          if (!cancelled) setJob(row);
        } catch (err: unknown) {
          if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تحميل طلب الفني.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      };
      void load();
      const timer = window.setInterval(() => void load(), 20_000);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    }
    const ref = doc(db, REPAIR_JOBS_COLLECTION, jobId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setJob(null);
          setLoading(false);
          return;
        }
        const row = repairJobService.normalizeRead({ id: snap.id, ...snap.data() } as RepairJob);
        setJob(row);
        setLoading(false);
      },
      (err) => {
        console.error('useRepairJobDoc:', err);
        setError(err?.message || 'listener error');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [jobId, technicianMode, reloadSeq]);

  return { job, loading, error, refetch: () => setReloadSeq((value) => value + 1) };
}
