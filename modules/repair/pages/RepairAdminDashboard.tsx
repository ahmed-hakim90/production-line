import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { repairBranchService } from '../services/repairBranchService';
import { repairJobService } from '../services/repairJobService';
import { repairCashService } from '../services/repairCashService';
import type { RepairBranch, RepairJob, BranchKPI } from '../types';

export const RepairAdminDashboard: React.FC = () => {
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [kpis, setKpis] = useState<BranchKPI[]>([]);
  const [loading, setLoading] = useState(true);

  const thisMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    Promise.all([
      repairBranchService.getAll(),
      repairJobService.getAll(),
      repairBranchService.getAllAssignments(),
    ]).then(([branchList, jobList, assignmentList]) => {
      setBranches(branchList);
      setJobs(jobList);

      // Count technicians per branch
      const techCount: Record<string, number> = {};
      for (const a of assignmentList) {
        for (const bId of a.branchIds) {
          techCount[bId] = (techCount[bId] ?? 0) + 1;
        }
      }
      setAssignments(techCount);

      // Build KPIs
      const computed: BranchKPI[] = branchList.map((b) => {
        const branchJobs = jobList.filter((j) => j.branchId === b.id);
        const monthJobs = branchJobs.filter((j) => j.createdAt.startsWith(thisMonth));
        const monthDelivered = monthJobs.filter((j) => j.status === 'delivered');
        const monthRevenue = monthDelivered.reduce((s, j) => s + (j.finalCost ?? 0), 0);
        const openJobs = branchJobs.filter((j) => !['delivered', 'unrepairable'].includes(j.status)).length;

        return {
          branchId: b.id!,
          branchName: b.name,
          isMain: b.isMain,
          monthlyJobs: monthJobs.length,
          monthlyRevenue: monthRevenue,
          monthlyExpenses: 0, // would need cash service per branch
          netProfit: monthRevenue,
          openJobs,
          jobsWithoutStock: 0, // TODO: check parts stock
          technicianCount: techCount[b.id!] ?? 0,
        };
      });

      setKpis(computed);
      setLoading(false);
    });
  }, []);

  const totalRevenue = kpis.reduce((s, k) => s + k.monthlyRevenue, 0);
  const totalJobs = kpis.reduce((s, k) => s + k.monthlyJobs, 0);
  const totalOpen = kpis.reduce((s, k) => s + k.openJobs, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">لوحة الأدمن — الصيانة</h1>
          <p className="text-sm text-gray-500">نظرة عامة على جميع الفروع</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/repair/branches"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            إدارة الفروع
          </Link>
          <Link
            to="/repair/technician-kpis"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            أداء الفنيين
          </Link>
        </div>
      </div>

      {/* Overall KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="إجمالي طلبات الشهر" value={totalJobs} color="text-blue-600" />
        <SummaryCard label="طلبات مفتوحة" value={totalOpen} color="text-orange-500" />
        <SummaryCard label="إيرادات الشهر" value={`${totalRevenue.toLocaleString('ar-EG')} ج`} color="text-green-600" />
        <SummaryCard label="عدد الفروع" value={branches.length} color="text-purple-600" />
      </div>

      {/* Branch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <BranchCard key={kpi.branchId} kpi={kpi} />
        ))}
      </div>
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: string | number; color: string }> = ({
  label, value, color,
}) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
    <p className="text-sm text-gray-500 mb-1">{label}</p>
    <p className={`text-3xl font-bold ${color}`}>{value}</p>
  </div>
);

const BranchCard: React.FC<{ kpi: BranchKPI }> = ({ kpi }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between mb-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-600">store</span>
          <h3 className="font-bold text-gray-800">{kpi.branchName}</h3>
          {kpi.isMain && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              رئيسي
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{kpi.technicianCount} فني</p>
      </div>
      <Link
        to={`/repair/jobs?branchId=${kpi.branchId}`}
        className="text-blue-600 text-xs hover:underline"
      >
        عرض الطلبات
      </Link>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <Metric label="طلبات الشهر" value={kpi.monthlyJobs} color="text-blue-600" />
      <Metric label="مفتوحة" value={kpi.openJobs} color="text-orange-500" />
      <Metric
        label="إيرادات"
        value={`${kpi.monthlyRevenue.toLocaleString('ar-EG')} ج`}
        color="text-green-600"
      />
      <Metric
        label="مصاريف"
        value={`${kpi.monthlyExpenses.toLocaleString('ar-EG')} ج`}
        color="text-red-500"
      />
    </div>

    {kpi.jobsWithoutStock > 0 && (
      <div className="mt-3 flex items-center gap-2 bg-red-50 rounded-lg p-2 text-red-700 text-xs">
        <span className="material-symbols-outlined text-base">warning</span>
        {kpi.jobsWithoutStock} طلب بدون مخزون
      </div>
    )}
  </div>
);

const Metric: React.FC<{ label: string; value: string | number; color: string }> = ({
  label, value, color,
}) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`text-lg font-bold ${color}`}>{value}</p>
  </div>
);
