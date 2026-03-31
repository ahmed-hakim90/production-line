import { useEffect, useMemo, useState } from 'react';
import type { RepairJob } from '../types';
import { repairJobService } from '../services/repairJobService';

const searchFields = (job: RepairJob): string =>
  [
    job.customerName,
    job.customerPhone,
    job.receiptNo,
    job.deviceBrand,
    job.deviceModel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export function useRepairJobs(params: {
  branchId?: string;
  branchIds?: string[];
  canViewAllBranches?: boolean;
  searchText?: string;
}) {
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [debouncedSearch, setDebouncedSearch] = useState(params.searchText || '');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(params.searchText || '');
    }, 220);
    return () => window.clearTimeout(timer);
  }, [params.searchText]);

  useEffect(() => {
    setLoading(true);
    const normalizedBranchIds = Array.isArray(params.branchIds)
      ? Array.from(new Set(params.branchIds.filter((id) => typeof id === 'string' && id.trim().length > 0)))
      : [];
    if (!params.canViewAllBranches && normalizedBranchIds.length === 0 && !params.branchId) {
      setJobs([]);
      setLoading(false);
      return () => {};
    }
    const unsub = params.canViewAllBranches
      ? repairJobService.subscribeAll((rows) => {
          setJobs(rows);
          setLoading(false);
        })
      : normalizedBranchIds.length > 1
        ? repairJobService.subscribeByBranches(normalizedBranchIds, (rows) => {
            setJobs(rows);
            setLoading(false);
          })
      : repairJobService.subscribeByBranch(params.branchId || normalizedBranchIds[0] || '', (rows) => {
          setJobs(rows);
          setLoading(false);
        });
    return () => unsub();
  }, [params.branchId, params.canViewAllBranches, JSON.stringify(params.branchIds || [])]);

  const filteredJobs = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => searchFields(j).includes(q));
  }, [jobs, debouncedSearch]);

  return { jobs: filteredJobs, rawJobs: jobs, loading };
}
