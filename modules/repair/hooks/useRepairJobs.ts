import { useEffect, useState, useMemo } from 'react';
import { repairJobService } from '../services/repairJobService';
import { repairBranchService } from '../services/repairBranchService';
import type { RepairJob } from '../types';
import { useAppStore } from '../../../store/useAppStore';

interface UseRepairJobsOptions {
  /** If true, subscribe to ALL branches (admin mode) */
  allBranches?: boolean;
  /** Explicit branch IDs to filter by (overrides user assignment lookup) */
  branchIds?: string[];
}

export function useRepairJobs(opts: UseRepairJobsOptions = {}) {
  const uid = useAppStore((s) => s.uid);
  const userPermissions = useAppStore((s) => s.userPermissions);
  const isAdmin = userPermissions?.['repair.branches.manage'] === true || userPermissions?.['repair.admin.view'] === true;

  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedBranchIds, setResolvedBranchIds] = useState<string[]>([]);

  // Resolve which branch IDs this user can see
  useEffect(() => {
    if (!uid) return;
    if (opts.branchIds) {
      setResolvedBranchIds(opts.branchIds);
      return;
    }
    if (opts.allBranches || isAdmin) {
      // Admin sees all — we'll use subscribeAll
      setResolvedBranchIds([]);
      return;
    }
    // Regular user/technician — look up their assigned branches
    repairBranchService.getBranchIdsForTechnician(uid).then(setResolvedBranchIds);
  }, [uid, isAdmin, opts.allBranches, opts.branchIds?.join(',')]);

  // Subscribe to jobs
  useEffect(() => {
    if (!uid) return;
    setLoading(true);

    let unsub: () => void;

    if (opts.allBranches || isAdmin) {
      unsub = repairJobService.subscribeAll((data) => {
        setJobs(data);
        setLoading(false);
      });
    } else if (resolvedBranchIds.length > 0) {
      unsub = repairJobService.subscribe(resolvedBranchIds, (data) => {
        setJobs(data);
        setLoading(false);
      });
    } else {
      setJobs([]);
      setLoading(false);
      return;
    }

    return () => unsub?.();
  }, [uid, isAdmin, opts.allBranches, resolvedBranchIds.join(',')]);

  return { jobs, loading, resolvedBranchIds };
}
