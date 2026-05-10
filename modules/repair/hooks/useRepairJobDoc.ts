import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { REPAIR_JOBS_COLLECTION } from '../collections';
import type { RepairJob } from '../types';
import { repairJobService } from '../services/repairJobService';

/** مستمع واحد على طلب محدد — للورشة/الفني، من غير ما نحمّل كل الطلبات لحظيًا */
export function useRepairJobDoc(jobId: string | undefined) {
  const [job, setJob] = useState<RepairJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured || !jobId) {
      setJob(null);
      setLoading(false);
      return () => {};
    }
    setLoading(true);
    setError(null);
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
  }, [jobId]);

  return { job, loading, error };
}
