import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { RepairJob } from '../types';
import { repairJobService } from '../services/repairJobService';
import { customerPhonesMatch, normalizeCustomerPhoneDigits } from '../utils/customerPhone';
import { canLoadRepairJobList } from '../utils/repairJobListScope';
import { repairTechnicianService } from '../services/repairTechnicianService';
import { repairCustomerOperationsService } from '../services/repairCustomerOperationsService';

const searchFields = (job: RepairJob): string =>
  [
    job.customerName,
    job.customerPhone,
    job.receiptNo,
    job.deviceBrand,
    job.deviceModel,
    job.deviceSerial,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export function useRepairJobs(params: {
  branchId?: string;
  branchIds?: string[];
  canViewAllBranches?: boolean;
  searchText?: string;
  /** فلترة مرنة على رقم العميل (أرقام فقط أو مع فواصل) */
  phoneDigitsFilter?: string;
  /** إن وُجد: لا يُجلب من الشبكة إلا عندما يصل طول الأرقام لهذا الحد (مثلاً شاشة كول سنتر) */
  minPhoneDigitsForQuery?: number;
  /** عند false: لا يُجلب من الشبكة (مثلاً قبل إدخال نص بحث كافٍ) */
  fetchEnabled?: boolean;
  technicianOnly?: boolean;
  technicianIds?: string[];
  /** بحث خادمي آمن لموظف مركز الاتصال عبر كل المراكز. */
  callCenterGlobal?: boolean;
  /** Override list cap (dashboards may use REPAIR_JOB_DASHBOARD_LIMIT). */
  listLimit?: number;
}) {
  const [debouncedSearch, setDebouncedSearch] = useState(params.searchText || '');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(params.searchText || '');
    }, 220);
    return () => window.clearTimeout(timer);
  }, [params.searchText]);

  const technicianIdsKey = useMemo(
    () =>
      Array.from(
        new Set(
          (params.technicianIds || []).filter((id) => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()),
        ),
      ).sort(),
    [params.technicianIds],
  );

  const branchIdsKey = useMemo(
    () =>
      Array.from(new Set((params.branchIds || []).filter((id) => typeof id === 'string' && id.trim().length > 0))).sort(),
    [params.branchIds],
  );

  const phoneFilterRaw = String(params.phoneDigitsFilter || '').trim();
  const phoneDigitsLen = normalizeCustomerPhoneDigits(phoneFilterRaw).length;
  const phoneQueryGate =
    params.minPhoneDigitsForQuery != null ? phoneDigitsLen >= params.minPhoneDigitsForQuery : true;

  const enabled = useMemo(() => {
    if (params.fetchEnabled === false) return false;
    if (!phoneQueryGate) return false;
    return canLoadRepairJobList({
      canViewAllBranches: params.canViewAllBranches,
      branchIds: branchIdsKey,
      branchId: params.branchId,
      technicianOnly: params.technicianOnly,
      technicianIds: technicianIdsKey,
    });
  }, [
    phoneQueryGate,
    params.fetchEnabled,
    params.technicianOnly,
    params.canViewAllBranches,
    params.branchId,
    branchIdsKey,
    technicianIdsKey,
  ]);

  const { data: jobs = [], isLoading, refetch, isFetching, error, isError } = useQuery({
    queryKey: [
      'repairJobs',
      params.canViewAllBranches ? 'all' : 'scoped',
      params.branchId || '',
      branchIdsKey.join('|'),
      params.technicianOnly ? 'tech' : 'desk',
      technicianIdsKey.join('|'),
      params.minPhoneDigitsForQuery ?? '',
      phoneFilterRaw,
      params.callCenterGlobal ? debouncedSearch : '',
      params.listLimit ?? '',
    ],
    queryFn: async (): Promise<RepairJob[]> => {
      if (
        !canLoadRepairJobList({
          canViewAllBranches: params.canViewAllBranches,
          branchIds: branchIdsKey,
          branchId: params.branchId,
          technicianOnly: params.technicianOnly,
          technicianIds: technicianIdsKey,
        })
      ) {
        return [];
      }
      const listOpts = params.listLimit ? { limit: params.listLimit } : undefined;
      if (params.technicianOnly) {
        return repairTechnicianService.list();
      }
      if (params.callCenterGlobal) {
        return repairCustomerOperationsService.listCallCenterJobs(debouncedSearch);
      }
      if (params.canViewAllBranches) {
        return repairJobService.listAllBranches(listOpts);
      }
      if (branchIdsKey.length > 0) {
        return repairJobService.listByBranches(branchIdsKey, listOpts);
      }
      const single = params.branchId || '';
      if (!single) return [];
      return repairJobService.listByBranch(single, listOpts);
    },
    enabled,
    refetchInterval: 90_000,
    staleTime: 45_000,
    placeholderData: (previous) => previous,
    retry: 1,
  });

  const phoneFilter = phoneFilterRaw;

  const filteredJobs = useMemo(() => {
    if (params.minPhoneDigitsForQuery != null && phoneDigitsLen < params.minPhoneDigitsForQuery) {
      return [];
    }
    let rows = jobs;
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((j) => searchFields(j).includes(q));
    }
    if (phoneFilter) {
      rows = rows.filter((j) => customerPhonesMatch(j.customerPhone, phoneFilter));
    }
    return rows;
  }, [jobs, debouncedSearch, phoneFilter, params.minPhoneDigitsForQuery, phoneDigitsLen]);

  return { jobs: filteredJobs, rawJobs: jobs, loading: isLoading, refetch, isFetching, error: isError ? error : null };
}
