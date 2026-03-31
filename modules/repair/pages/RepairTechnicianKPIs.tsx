import React, { useEffect, useMemo, useState } from 'react';
import { repairJobService } from '../services/repairJobService';
import { repairBranchService } from '../services/repairBranchService';
import type { RepairJob, RepairBranch, RepairTechnicianAssignment, TechnicianKPI } from '../types';

export const RepairTechnicianKPIs: React.FC = () => {
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [assignments, setAssignments] = useState<RepairTechnicianAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedBranch, setSelectedBranch] = useState('all');

  useEffect(() => {
    Promise.all([
      repairJobService.getAll(),
      repairBranchService.getAll(),
      repairBranchService.getAllAssignments(),
    ]).then(([j, b, a]) => {
      setJobs(j);
      setBranches(b);
      setAssignments(a);
      setLoading(false);
    });
  }, []);

  const kpis = useMemo<TechnicianKPI[]>(() => {
    if (assignments.length === 0) return [];

    return assignments.map((assignment) => {
      const techJobs = jobs.filter((j) => {
        const matchTech = j.technicianId === assignment.technicianId;
        const matchMonth = j.createdAt.startsWith(selectedMonth);
        const matchBranch = selectedBranch === 'all' || j.branchId === selectedBranch;
        return matchTech && matchMonth && matchBranch;
      });

      const delivered = techJobs.filter((j) => j.status === 'delivered');
      const unrepairable = techJobs.filter((j) => j.status === 'unrepairable');
      const open = techJobs.filter((j) => !['delivered', 'unrepairable'].includes(j.status));

      const successRate =
        delivered.length + unrepairable.length > 0
          ? Math.round((delivered.length / (delivered.length + unrepairable.length)) * 100)
          : 0;

      const avgRepairDays =
        delivered.length > 0
          ? Math.round(
              delivered.reduce((s, j) => {
                const start = new Date(j.createdAt).getTime();
                const end = j.deliveredAt ? new Date(j.deliveredAt).getTime() : Date.now();
                return s + (end - start) / (1000 * 60 * 60 * 24);
              }, 0) / delivered.length,
            )
          : 0;

      const totalRevenue = delivered.reduce((s, j) => s + (j.finalCost ?? 0), 0);

      return {
        technicianId: assignment.technicianId,
        technicianName: assignment.technicianName,
        totalJobs: techJobs.length,
        deliveredJobs: delivered.length,
        unrepairableJobs: unrepairable.length,
        openJobs: open.length,
        successRate,
        avgRepairDays,
        totalRevenue,
      };
    });
  }, [jobs, assignments, selectedMonth, selectedBranch]);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900">أداء الفنيين</h1>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">الشهر</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">الفرع</label>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">جميع الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {kpis.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center text-gray-400">
          لا يوجد فنيون مرتبطون بعد
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {kpis.map((kpi) => (
            <TechCard key={kpi.technicianId} kpi={kpi} />
          ))}
        </div>
      )}
    </div>
  );
};

const TechCard: React.FC<{ kpi: TechnicianKPI }> = ({ kpi }) => {
  const successColor =
    kpi.successRate >= 80 ? 'text-green-600' : kpi.successRate >= 60 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
          {kpi.technicianName.charAt(0)}
        </div>
        <div>
          <p className="font-bold text-gray-800">{kpi.technicianName}</p>
          <p className="text-xs text-gray-500">{kpi.openJobs} طلب مفتوح</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="إجمالي الطلبات" value={kpi.totalJobs} color="text-blue-600" />
        <Metric label="تم التسليم" value={kpi.deliveredJobs} color="text-green-600" />
        <Metric label="غير قابل" value={kpi.unrepairableJobs} color="text-red-500" />
        <Metric
          label="نسبة النجاح"
          value={`${kpi.successRate}%`}
          color={successColor}
        />
        <Metric
          label="متوسط الإصلاح"
          value={`${kpi.avgRepairDays} يوم`}
          color="text-gray-700"
        />
        <Metric
          label="الإيرادات"
          value={`${kpi.totalRevenue.toLocaleString('ar-EG')} ج`}
          color="text-emerald-600"
        />
      </div>

      {/* Success bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>نسبة النجاح</span>
          <span>{kpi.successRate}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              kpi.successRate >= 80 ? 'bg-green-500' : kpi.successRate >= 60 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${kpi.successRate}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string | number; color: string }> = ({
  label, value, color,
}) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`text-lg font-bold ${color}`}>{value}</p>
  </div>
);
