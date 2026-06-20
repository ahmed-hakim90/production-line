import React from 'react';
import { Badge, Card } from '../UI';
import { useAppStore } from '../../../../store/useAppStore';

export const SystemStatusCards: React.FC = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const productsCount = useAppStore((s) => s.products.length);
  const productionLinesCount = useAppStore((s) => s.productionLines.length);
  const employeesCount = useAppStore((s) => s.employees.length);

  return (
    <Card title="حالة النظام" className="bg-[var(--color-card)] border-[var(--color-border)] rounded-xl shadow-none">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-[var(--color-bg)] rounded-xl p-5 text-center border border-[var(--color-border)]">
          <span className="material-icons-round text-primary text-3xl mb-2 block">cloud_done</span>
          <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">اتصال Firebase</p>
          <Badge variant={isAuthenticated ? 'success' : 'danger'}>
            {isAuthenticated ? 'متصل' : 'غير متصل'}
          </Badge>
        </div>
        <div className="bg-[var(--color-bg)] rounded-xl p-5 text-center border border-[var(--color-border)]">
          <span className="material-icons-round text-primary text-3xl mb-2 block">inventory_2</span>
          <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">المنتجات</p>
          <p className="text-2xl font-medium text-[var(--color-text)]">{productsCount}</p>
        </div>
        <div className="bg-[var(--color-bg)] rounded-xl p-5 text-center border border-[var(--color-border)]">
          <span className="material-icons-round text-primary text-3xl mb-2 block">precision_manufacturing</span>
          <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">خطوط الإنتاج</p>
          <p className="text-2xl font-medium text-[var(--color-text)]">{productionLinesCount}</p>
        </div>
        <div className="bg-[var(--color-bg)] rounded-xl p-5 text-center border border-[var(--color-border)]">
          <span className="material-icons-round text-primary text-3xl mb-2 block">groups</span>
          <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">المشرفين</p>
          <p className="text-2xl font-medium text-[var(--color-text)]">{employeesCount}</p>
        </div>
      </div>
    </Card>
  );
};
