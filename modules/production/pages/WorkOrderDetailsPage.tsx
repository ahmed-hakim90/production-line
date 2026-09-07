import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { WorkOrder } from '../../../types';
import { useTenantNavigate } from '../../../lib/useTenantNavigate';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { Button } from '../components/UI';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { isOperationPathEnabled, WORK_ORDER_OPERATION_KEYS, WORK_ORDER_UPDATE_PATHS } from '../../system/lib/operationPathSettings';
import { employeeService } from '../../hr/employeeService';
import { lineService } from '../services/lineService';
import { productService } from '../services/productService';
import { workOrderService } from '../services/workOrderService';
import { WorkOrderDrawer } from './WorkOrders/WorkOrderDrawer';

export function WorkOrderDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const systemSettings = useAppStore((state) => state.systemSettings);
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [names, setNames] = useState({ product: '—', line: '—', supervisor: '—' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void workOrderService.getById(id)
      .then(async (row) => {
        if (!row) throw new Error('أمر الشغل غير موجود أو لا تملك صلاحية عرضه.');
        const [product, line, supervisor] = await Promise.all([
          productService.getById(row.productId),
          lineService.getById(row.lineId),
          employeeService.getById(row.supervisorId),
        ]);
        if (!active) return;
        setOrder(row);
        setNames({ product: product?.name || '—', line: line?.name || '—', supervisor: supervisor?.name || '—' });
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'تعذر تحميل أمر الشغل.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (loading) return <PageContentSkeleton variant="dashboard" />;
  if (error || !order) return (
    <div className="mx-auto max-w-3xl space-y-4 rounded-lg border border-[var(--color-border-ui)] bg-[var(--color-card-bg)] p-6 text-center">
      <h1 className="text-lg font-semibold text-[var(--color-text-1)]">تعذر عرض تفاصيل أمر الشغل</h1>
      <p className="text-sm text-[var(--color-text-2)]">{error}</p>
      <Button onClick={() => navigate('/work-orders')}>العودة لأوامر الشغل</Button>
    </div>
  );

  const canExecute = can('workOrders.edit') && isOperationPathEnabled(systemSettings, WORK_ORDER_OPERATION_KEYS.update, WORK_ORDER_UPDATE_PATHS.workOrdersPageStatus);
  const canReviewQuality = can('quality.finalInspection.inspect') && isOperationPathEnabled(systemSettings, WORK_ORDER_OPERATION_KEYS.update, WORK_ORDER_UPDATE_PATHS.qualityFinalInspection);

  return (
    <main className="p-3 sm:p-5" aria-label="تفاصيل أمر الشغل الكاملة">
      <WorkOrderDrawer
        order={order}
        rowView={null}
        isOpen
        presentation="page"
        productName={names.product}
        lineName={names.line}
        supervisorName={names.supervisor}
        onClose={() => navigate('/work-orders')}
        canExecuteHourlySlots={canExecute}
        canReviewHourlyQuality={canReviewQuality}
      />
    </main>
  );
}
