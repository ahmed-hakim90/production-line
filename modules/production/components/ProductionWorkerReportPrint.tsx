import React from 'react';
import { formatNumber } from '@/utils/calculations';

type Props = {
  title: string;
  subtitle: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

export const ProductionWorkerReportPrint = React.forwardRef<HTMLDivElement, Props>(
  function ProductionWorkerReportPrint({ title, subtitle, columns, rows }, ref) {
    return (
      <div
        ref={ref}
        className="arabic-export-root print-report"
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          width: '794px',
          background: '#fff',
          color: '#111',
          padding: '24px',
          direction: 'rtl',
        }}
      >
        <div className="border-b-2 border-slate-800 pb-3 mb-4">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100">
              {columns.map((col) => (
                <th key={col} className="border border-slate-300 px-2 py-2 text-right font-bold">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((col) => {
                  const val = row[col];
                  const display = typeof val === 'number' ? formatNumber(val) : String(val ?? '—');
                  return (
                    <td key={col} className="border border-slate-300 px-2 py-2 text-right tabular-nums">
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-sm text-slate-500 mt-4">لا توجد بيانات</p>
        )}
      </div>
    );
  },
);
