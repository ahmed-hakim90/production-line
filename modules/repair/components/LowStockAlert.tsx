import React from 'react';
import type { RepairSparePart, RepairSparePartStock } from '../types';

interface LowStockItem {
  part: RepairSparePart;
  stock: RepairSparePartStock;
}

interface LowStockAlertProps {
  items: LowStockItem[];
  onDismiss: () => void;
}

export const LowStockAlert: React.FC<LowStockAlertProps> = ({ items, onDismiss }) => {
  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-red-500 px-6 py-4 flex items-center gap-3">
          <span className="text-3xl">⚠️</span>
          <div>
            <h2 className="text-white font-bold text-lg">تحذير: مخزون منخفض</h2>
            <p className="text-red-100 text-sm">القطع التالية وصلت للحد الأدنى</p>
          </div>
        </div>

        {/* Items list */}
        <div className="px-6 py-4 max-h-72 overflow-y-auto divide-y divide-gray-100">
          {items.map(({ part, stock }) => (
            <div key={part.id} className="py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">{part.name}</p>
                <p className="text-xs text-gray-500">
                  الكود: {part.code} | الفئة: {part.category}
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{stock.quantity}</p>
                <p className="text-xs text-gray-400">الحد الأدنى: {part.minStock}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end">
          <button
            onClick={onDismiss}
            className="bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            حسناً، فهمت
          </button>
        </div>
      </div>
    </div>
  );
};
