import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/utils/permissions';
import { isFirebaseEmulatorMode } from '../../auth/services/firebase';
import { useWorkOrderCycle } from '../hooks/useWorkOrderCycle';
import { cycleOrderLabels, cycleTasks } from '../utils/workOrderCycle';
import { useParams } from 'react-router-dom';
import { withTenantPath } from '@/lib/tenantPaths';

export function WorkOrderCycleTasks({ full = false }: { full?: boolean }) {
  const { can } = usePermission();
  const enabled = isFirebaseEmulatorMode && (can('workOrders.create') || can('workOrders.approve') || can('workOrders.execute') || can('workOrders.inspect') || can('workOrders.assignInspectors') || can('productionHandover.approve'));
  return enabled ? <CycleTasksContent full={full} /> : null;
}

function CycleTasksContent({ full }: { full: boolean }) {
  const { tenantSlug = 'lab' } = useParams();
  const { data, error, loading, refresh } = useWorkOrderCycle();
  const link = (path: string) => withTenantPath(tenantSlug, path);
  const tasks = data?.orders.flatMap(order => cycleTasks(order, data.uid, data.permissions).map(task => ({ ...task, order }))) || [];
  return <section dir="rtl" className="my-4 rounded-lg border border-border bg-card p-4 text-foreground sm:p-6" aria-label="مهام أوامر الشغل">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">{full ? 'أوامر الشغل — الدورة الجديدة' : 'مهامي في أوامر الشغل'}</h1><p className="mt-1 text-sm text-muted-foreground">المهام حسب صلاحياتك وتكليفك الفعلي • تحديث كل ١٥ ثانية</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void refresh()}>تحديث المهام</Button>{data?.permissions['workOrders.create'] && <Button asChild><Link to={link('/work-orders/cycle/new')}>تجهيز أمر شغل</Link></Button>}</div>
    </header>
    {loading && <p role="status" className="py-6">جاري تحميل مهامك…</p>}
    {error && <p role="alert" className="my-4 text-destructive">{error} {data ? 'البيانات المعروضة قديمة؛ افتح المهمة بعد التحديث.' : ''}</p>}
    {data?.truncated && <p role="status" className="my-3 text-sm">يعرض المختبر أول ١٠٠ أمر فقط؛ القائمة غير مكتملة.</p>}
    {!loading && !error && tasks.length === 0 && <p className="py-6 text-muted-foreground">لا توجد مهام تنفيذ متاحة لك الآن.{data?.permissions['productionHandover.approve'] ? ' استلام التغليف سيُفعّل بعد اعتماد الجودة في الدفعات التالية.' : ''}</p>}
    <div className="mt-4 divide-y divide-border">{tasks.map(({ order, slot, title }) => <Link key={`${order.id}-${slot?.id}`} to={link(`/work-orders/${order.id}?cycle=2${slot ? `&slot=${slot.id}` : ''}`)} className="block rounded-md py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary hover:bg-muted">
      <div className="flex flex-wrap justify-between gap-2"><strong>{title}</strong><span className="text-sm">{order.workOrderNumber}</span></div>
      <p className="mt-2 text-sm text-muted-foreground">{order.productName} • {order.lineName} • {slot?.date} • <bdi>{slot?.startTime}–{slot?.endTime}</bdi> • {slot?.actualQuantity ?? slot?.targetQuantity} وحدة</p>
      <p className="mt-1 text-sm text-muted-foreground">منذ {Math.max(0, Math.floor((Date.parse(data!.fetchedAt) - Date.parse(slot?.submittedAt || slot?.openedAt || order.preparedAt)) / 60000))} دقيقة</p>
    </Link>)}</div>
    {full && data && <div className="mt-6 border-t border-border pt-4"><h2 className="font-semibold">الأوامر المتاحة للمتابعة</h2>{data.orders.length === 0 ? <p className="py-3 text-muted-foreground">لا توجد أوامر في نطاقك حتى الآن.</p> : <ul className="divide-y divide-border">{data.orders.map(order => <li key={order.id}><Link className="flex flex-wrap justify-between gap-2 py-4 underline-offset-4 hover:underline" to={link(`/work-orders/${order.id}?cycle=2`)}><span>{order.workOrderNumber} — {order.productName} — {order.lineName}</span><span className="text-sm text-muted-foreground">{cycleOrderLabels[order.productionStatus]}</span></Link></li>)}</ul>}</div>}
  </section>;
}
