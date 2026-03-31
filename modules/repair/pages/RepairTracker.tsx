import React, { useState } from 'react';
import { getDocs, query, collection, where } from 'firebase/firestore';
import { db } from '../../auth/services/firebase';
import { REPAIR_JOBS_COL } from '../collections';
import { StatusBadge } from '../components/StatusBadge';
import type { RepairJob } from '../types';
import { REPAIR_WARRANTY_LABELS } from '../types';

/** Public page — no auth required. Customer tracks their device by receiptNo + phone. */
export const RepairTracker: React.FC = () => {
  const [receiptNo, setReceiptNo] = useState('');
  const [phone, setPhone] = useState('');
  const [job, setJob] = useState<RepairJob | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!receiptNo.trim() || !phone.trim()) {
      setError('يرجى إدخال رقم الإيصال ورقم الهاتف');
      return;
    }
    setLoading(true);
    setError('');
    setJob(null);
    setNotFound(false);

    try {
      const q = query(
        collection(db, REPAIR_JOBS_COL),
        where('receiptNo', '==', receiptNo.trim().toUpperCase()),
        where('customerPhone', '==', phone.trim()),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setNotFound(true);
      } else {
        const data = { id: snap.docs[0].id, ...snap.docs[0].data() } as RepairJob;
        setJob(data);
      }
    } catch (e: any) {
      setError('حدث خطأ، حاول مجدداً');
    }
    setLoading(false);
  };

  const deliveryDate = job?.deliveredAt
    ? new Date(job.deliveredAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <span className="material-symbols-outlined text-white text-3xl">build_circle</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">تتبع جهازك</h1>
          <p className="text-gray-500 text-sm mt-1">أدخل بيانات إيصالك لمعرفة حالة جهازك</p>
        </div>

        {/* Search Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">رقم الإيصال</label>
            <input
              type="text"
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value.toUpperCase())}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="REP-0001"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="01xxxxxxxxx"
              dir="ltr"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <>
                <span className="material-symbols-outlined text-xl">search</span>
                بحث عن الجهاز
              </>
            )}
          </button>
        </div>

        {/* Not Found */}
        {notFound && (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
            <span className="material-symbols-outlined text-4xl text-gray-300 block mb-3">search_off</span>
            <p className="text-gray-600 font-medium">لم يتم العثور على الجهاز</p>
            <p className="text-gray-400 text-sm mt-1">تأكد من رقم الإيصال ورقم الهاتف</p>
          </div>
        )}

        {/* Result */}
        {job && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-800">حالة الجهاز</p>
              <StatusBadge status={job.status} size="lg" />
            </div>

            {job.status === 'ready' && (
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <p className="text-green-700 font-bold text-lg">🎉 جهازك جاهز للاستلام!</p>
                <p className="text-green-600 text-sm mt-1">تفضل بزيارتنا لاستلام جهازك</p>
              </div>
            )}

            {job.status === 'unrepairable' && (
              <div className="bg-red-50 rounded-xl p-4">
                <p className="text-red-700 font-bold">⚠️ للأسف تعذّر إصلاح الجهاز</p>
                {job.unrepairableReason && (
                  <p className="text-red-600 text-sm mt-1">السبب: {job.unrepairableReason}</p>
                )}
                <p className="text-red-600 text-sm mt-1">يرجى التواصل معنا لاستلام الجهاز</p>
              </div>
            )}

            {/* Device Info */}
            <div className="space-y-2 text-sm border-t border-gray-100 pt-4">
              <InfoRow label="رقم الإيصال" value={job.receiptNo} />
              <InfoRow label="الجهاز" value={`${job.deviceBrand} ${job.deviceModel}`} />
              <InfoRow label="تاريخ الاستلام" value={new Date(job.createdAt).toLocaleDateString('ar-EG')} />

              {job.status === 'delivered' && deliveryDate && (
                <>
                  <InfoRow label="تاريخ التسليم" value={deliveryDate} />
                  {job.warranty && job.warranty !== 'none' && (
                    <InfoRow label="الضمان" value={REPAIR_WARRANTY_LABELS[job.warranty]} />
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400">مركز الصيانة • نظام تتبع الأجهزة</p>
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-gray-800">{value}</span>
  </div>
);
