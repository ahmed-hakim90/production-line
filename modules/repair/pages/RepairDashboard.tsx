import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { StatusBadge } from '../components/StatusBadge';
import type { RepairJob } from '../types';

const KPICard: React.FC<{ label: string; value: string | number; sub?: string; color?: string }> = ({
  label, value, sub, color = 'text-blue-600',
}) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
    <p className="text-sm text-gray-500 mb-1">{label}</p>
    <p className={`text-3xl font-bold ${color}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

export const RepairDashboard: React.FC = () => {
  const { jobs, loading } = useRepairJobs();

  const open = jobs.filter((j) => !['delivered', 'unrepairable'].includes(j.status));
  const received = jobs.filter((j) => j.status === 'received').length;
  const inProgress = jobs.filter((j) => ['inspection', 'repair'].includes(j.status)).length;
  const ready = jobs.filter((j) => j.status === 'ready').length;
  const delivered = jobs.filter((j) => j.status === 'delivered').length;
  const unrepairable = jobs.filter((j) => j.status === 'unrepairable').length;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthJobs = jobs.filter((j) => j.createdAt.startsWith(thisMonth));
  const monthRevenue = monthJobs
    .filter((j) => j.status === 'delivered')
    .reduce((s, j) => s + (j.finalCost ?? 0), 0);

  const recentJobs = jobs.slice(0, 8);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">لوحة الصيانة</h1>
        <Link
          to="/repair/jobs/new"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">add_circle</span>
          جهاز جديد
        </Link>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="طلبات مفتوحة" value={open.length} color="text-blue-600" />
        <KPICard label="جاهزة للاستلام" value={ready} color="text-green-600" sub="تحتاج تسليم" />
        <KPICard label="سُلّمت هذا الشهر" value={delivered} color="text-gray-700" />
        <KPICard
          label="إيرادات الشهر"
          value={`${monthRevenue.toLocaleString('ar-EG')} ج`}
          color="text-emerald-600"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="وارد" value={received} color="text-blue-500" />
        <KPICard label="فحص / إصلاح" value={inProgress} color="text-orange-500" />
        <KPICard label="غير قابل للإصلاح" value={unrepairable} color="text-red-500" />
        <KPICard label="إجمالي طلبات الشهر" value={monthJobs.length} color="text-purple-600" />
      </div>

      {/* Recent Jobs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">آخر الطلبات</h2>
          <Link to="/repair/jobs" className="text-blue-600 text-sm hover:underline">
            عرض الكل
          </Link>
        </div>
        {recentJobs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">لا توجد طلبات بعد</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentJobs.map((job) => (
              <Link
                key={job.id}
                to={`/repair/jobs/${job.id}`}
                className="flex items-center px-6 py-4 hover:bg-gray-50 transition-colors gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{job.customerName}</p>
                  <p className="text-sm text-gray-500">
                    {job.deviceBrand} {job.deviceModel} • {job.receiptNo}
                  </p>
                </div>
                <StatusBadge status={job.status} size="sm" />
                <p className="text-xs text-gray-400 hidden lg:block">
                  {new Date(job.createdAt).toLocaleDateString('ar-EG')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
