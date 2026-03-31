import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRepairJobs } from '../hooks/useRepairJobs';
import { StatusBadge } from '../components/StatusBadge';
import type { RepairJobStatus } from '../types';
import { REPAIR_STATUS_LABELS } from '../types';

const STATUS_FILTERS: { value: RepairJobStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'received', label: 'وارد' },
  { value: 'inspection', label: 'فحص' },
  { value: 'repair', label: 'إصلاح' },
  { value: 'ready', label: 'جاهز' },
  { value: 'delivered', label: 'تم التسليم' },
  { value: 'unrepairable', label: 'غير قابل' },
];

export const RepairJobs: React.FC = () => {
  const { jobs, loading } = useRepairJobs();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairJobStatus | 'all'>('all');

  const filtered = useMemo(() => {
    let result = jobs;
    if (statusFilter !== 'all') {
      result = result.filter((j) => j.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (j) =>
          j.customerName.toLowerCase().includes(q) ||
          j.customerPhone.includes(q) ||
          j.receiptNo.toLowerCase().includes(q) ||
          j.deviceBrand.toLowerCase().includes(q) ||
          j.deviceModel.toLowerCase().includes(q),
      );
    }
    return result;
  }, [jobs, search, statusFilter]);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">طلبات الصيانة</h1>
        <Link
          to="/repair/jobs/new"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">add_circle</span>
          جهاز جديد
        </Link>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute right-3 top-2.5 text-gray-400 text-xl">search</span>
          <input
            type="text"
            placeholder="ابحث بالاسم أو الهاتف أو رقم الإيصال أو الجهاز..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-sm text-gray-500">
        {loading ? 'جاري التحميل...' : `${filtered.length} طلب`}
      </p>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center text-gray-400">
          لا توجد نتائج
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-right">
                <tr>
                  <th className="px-4 py-3 font-semibold">رقم الإيصال</th>
                  <th className="px-4 py-3 font-semibold">العميل</th>
                  <th className="px-4 py-3 font-semibold">الجهاز</th>
                  <th className="px-4 py-3 font-semibold">الحالة</th>
                  <th className="px-4 py-3 font-semibold">التكلفة</th>
                  <th className="px-4 py-3 font-semibold">تاريخ الاستلام</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((job) => (
                  <tr key={job.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-600">{job.receiptNo}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{job.customerName}</p>
                      <p className="text-gray-400 text-xs">{job.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{job.deviceBrand} {job.deviceModel}</p>
                      <p className="text-gray-400 text-xs">{job.deviceType}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {job.finalCost !== undefined
                        ? `${job.finalCost.toLocaleString('ar-EG')} ج`
                        : job.estimatedCost
                          ? `~${job.estimatedCost.toLocaleString('ar-EG')} ج`
                          : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(job.createdAt).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/repair/jobs/${job.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                      >
                        تفاصيل
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
