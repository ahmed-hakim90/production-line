import React, { useEffect, useState } from 'react';
import { repairCashService } from '../services/repairCashService';
import type { RepairCashTransaction, RepairCashSession } from '../types';
import { REPAIR_EXPENSE_CATEGORIES } from '../types';
import { useAppStore } from '../../../store/useAppStore';

export const RepairCashier: React.FC = () => {
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);

  // TODO: resolve from user's repairBranchId in production
  const [branchId] = useState<string>('');

  const [session, setSession] = useState<RepairCashSession | null>(null);
  const [transactions, setTransactions] = useState<RepairCashTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Expense form
  const [showExpense, setShowExpense] = useState(false);
  const [expCategory, setExpCategory] = useState<string>(REPAIR_EXPENSE_CATEGORIES[0]);
  const [expAmount, setExpAmount] = useState('');
  const [expDesc, setExpDesc] = useState('');

  // Close session
  const [showClose, setShowClose] = useState(false);
  const [transferToMain, setTransferToMain] = useState(false);

  useEffect(() => {
    if (!branchId) { setLoading(false); return; }
    const loadSession = async () => {
      const s = await repairCashService.getOpenSession(branchId);
      setSession(s);
      if (s) {
        const txns = await repairCashService.getSessionTransactions(branchId, s.id!);
        setTransactions(txns);
      }
      setLoading(false);
    };
    loadSession();
  }, [branchId]);

  const openSession = async () => {
    setSaving(true);
    try {
      const id = await repairCashService.openSession(branchId, uid!, userDisplayName);
      const s = await repairCashService.getOpenSession(branchId);
      setSession(s);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const addExpense = async () => {
    if (!expAmount || !session) return;
    setSaving(true);
    try {
      await repairCashService.addTransaction({
        branchId,
        sessionId: session.id,
        type: 'expense',
        category: expCategory,
        amount: Number(expAmount),
        description: expDesc || expCategory,
        createdBy: uid!,
      });
      const txns = await repairCashService.getSessionTransactions(branchId, session.id!);
      setTransactions(txns);
      setExpAmount('');
      setExpDesc('');
      setShowExpense(false);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const closeSession = async () => {
    if (!session) return;
    setSaving(true);
    try {
      await repairCashService.closeSession({
        sessionId: session.id!,
        branchId,
        closedBy: uid!,
        closedByName: userDisplayName,
        transferToMain,
      });
      setSession(null);
      setTransactions([]);
      setShowClose(false);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpenses;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900">الخزينة</h1>
        {session && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowExpense(true)}
              className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
            >
              + مصروف
            </button>
            <button
              onClick={() => setShowClose(true)}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors"
            >
              تقفيل الخزينة
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
      )}

      {!session ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <span className="material-symbols-outlined text-5xl text-gray-300 block mb-4">account_balance_wallet</span>
          <p className="text-gray-500 mb-6">لا يوجد جلسة مفتوحة للخزينة</p>
          <button
            onClick={openSession}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? '...' : 'فتح الخزينة'}
          </button>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm text-center">
              <p className="text-sm text-gray-500 mb-1">إجمالي الإيرادات</p>
              <p className="text-2xl font-bold text-green-600">{totalIncome.toLocaleString('ar-EG')} ج</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm text-center">
              <p className="text-sm text-gray-500 mb-1">إجمالي المصاريف</p>
              <p className="text-2xl font-bold text-red-500">{totalExpenses.toLocaleString('ar-EG')} ج</p>
            </div>
            <div className={`rounded-xl border p-5 shadow-sm text-center ${net >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-sm text-gray-500 mb-1">الصافي</p>
              <p className={`text-2xl font-bold ${net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {net.toLocaleString('ar-EG')} ج
              </p>
            </div>
          </div>

          {/* Transactions */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">حركات الجلسة ({transactions.length})</h2>
            </div>
            {transactions.length === 0 ? (
              <div className="p-12 text-center text-gray-400">لا توجد حركات بعد</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {transactions.map((t) => (
                  <div key={t.id} className="flex items-center px-6 py-3 gap-4">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.type === 'income' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.description}</p>
                      <p className="text-xs text-gray-500">{t.category} • {new Date(t.createdAt).toLocaleString('ar-EG')}</p>
                    </div>
                    <p className={`font-bold text-sm ${t.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                      {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString('ar-EG')} ج
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Expense Modal */}
      {showExpense && (
        <Modal title="إضافة مصروف" onClose={() => setShowExpense(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الفئة</label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {REPAIR_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ج)</label>
              <input
                type="number"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                min="0"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">وصف (اختياري)</label>
              <input
                type="text"
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="تفاصيل إضافية..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowExpense(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">إلغاء</button>
              <button onClick={addExpense} disabled={saving || !expAmount} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? '...' : 'إضافة'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Close Session Modal */}
      {showClose && (
        <Modal title="تقفيل الخزينة" onClose={() => setShowClose(false)}>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">إيرادات:</span><span className="text-green-600 font-bold">{totalIncome.toLocaleString('ar-EG')} ج</span></div>
              <div className="flex justify-between"><span className="text-gray-600">مصاريف:</span><span className="text-red-500 font-bold">{totalExpenses.toLocaleString('ar-EG')} ج</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-2"><span className="font-bold">الصافي:</span><span className={`font-bold ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>{net.toLocaleString('ar-EG')} ج</span></div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={transferToMain}
                onChange={(e) => setTransferToMain(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">تحويل الصافي للفرع الرئيسي</span>
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowClose(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">إلغاء</button>
              <button onClick={closeSession} disabled={saving} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? '...' : 'تأكيد التقفيل'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title, onClose, children,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-800">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);
