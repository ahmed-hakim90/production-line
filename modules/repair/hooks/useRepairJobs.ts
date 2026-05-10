import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { RepairJob } from '../types';
import { repairJobService } from '../services/repairJobService';
import { customerPhonesMatch, normalizeCustomerPhoneDigits } from '../utils/customerPhone';

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
  technicianOnly?: boolean;
  technicianIds?: string[];
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
    if (!phoneQueryGate) return false;
    if (params.technicianOnly) {
      return technicianIdsKey.length > 0;
    }
    if (params.canViewAllBranches) return true;
    if (branchIdsKey.length > 1) return true;
    if (branchIdsKey.length === 1) return true;
    return Boolean(params.branchId && params.branchId.trim().length > 0);
  }, [
    phoneQueryGate,
    params.technicianOnly,
    params.canViewAllBranches,
    params.branchId,
    branchIdsKey.length,
    technicianIdsKey.length,
  ]);

  const { data: jobs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      'repairJobs',
      params.canViewAllBranches ? 'all' : 'scoped',
      params.branchId || '',
      branchIdsKey.join('|'),
      params.technicianOnly ? 'tech' : 'desk',
      technicianIdsKey.join('|'),
      params.minPhoneDigitsForQuery ?? '',
      phoneFilterRaw,
    ],
    queryFn: async (): Promise<RepairJob[]> => {
      if (params.technicianOnly) {
        if (technicianIdsKey.length === 0) return [];
        return repairJobService.listByTechnicianIds(technicianIdsKey);
      }
      if (params.canViewAllBranches) {
        return repairJobService.listAllBranches();
      }
      if (branchIdsKey.length > 1) {
        const chunks = await Promise.all(branchIdsKey.map((bid) => repairJobService.listByBranch(bid)));
        const byId = new Map<string, RepairJob>();
        chunks.flat().forEach((j) => {
          if (j.id) byId.set(j.id, j);
        });
        return Array.from(byId.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      }
      const single = params.branchId || branchIdsKey[0] || '';
      if (!single) return [];
      return repairJobService.listByBranch(single);
    },
    enabled,
    refetchInterval: 45_000,
    staleTime: 20_000,
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

  return { jobs: filteredJobs, rawJobs: jobs, loading: isLoading, refetch, isFetching };
}
