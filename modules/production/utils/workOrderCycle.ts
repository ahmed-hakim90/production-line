import { generateWorkOrderHourlySlots, type GenerateWorkOrderHourlySlotsInput } from './workOrderHourlySlots';
import type { CycleOrder, CycleSlot } from '../services/workOrderCycleService';

export function buildCyclePlan(input: Omit<GenerateWorkOrderHourlySlotsInput, 'dailyTarget'> & { quantity: number }) {
  const start = Date.parse(input.startDate + 'T00:00:00Z');
  const end = Date.parse(input.targetDate + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 239 * 86400000) throw new Error('حدد فترة صحيحة لا تتجاوز ٢٤٠ يومًا.');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('الكمية المطلوبة يجب أن تكون أكبر من صفر.');
  if (Boolean(input.breakStartTime) !== Boolean(input.breakEndTime)) throw new Error('حدد بداية ونهاية الراحة.');
  if (input.breakStartTime && (input.breakStartTime < input.workdayStartTime || input.breakEndTime! > input.workdayEndTime || input.breakStartTime >= input.breakEndTime!)) throw new Error('الراحة يجب أن تكون داخل وقت العمل.');
  const slots = generateWorkOrderHourlySlots({ ...input, dailyTarget: 0 });
  if (!slots.length) throw new Error('لا توجد ساعات تشغيل في الفترة.');
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const durations = slots.map(slot => minutes(slot.endTime) - minutes(slot.startTime));
  const total = durations.reduce((a, b) => a + b, 0);
  let allocated = 0;
  return slots.map((slot, index) => {
    const cumulative = index === slots.length - 1 ? input.quantity : Math.round(input.quantity * durations.slice(0, index + 1).reduce((a, b) => a + b, 0) / total * 100) / 100;
    const targetQuantity = Math.round((cumulative - allocated) * 1000) / 1000;
    allocated = cumulative;
    return { date: slot.date, startTime: slot.startTime, endTime: slot.endTime, targetQuantity };
  });
}

export const cycleSlotLabels: Record<CycleSlot['status'], string> = { planned: 'لم تبدأ', open: 'قيد الإنتاج', paused: 'متوقفة', quality_pending: 'بانتظار الجودة' };
export const cycleOrderLabels: Record<CycleOrder['productionStatus'], string> = { draft: 'بانتظار اعتماد الإنتاج', approved: 'معتمد — جاهز للتشغيل', in_progress: 'قيد التنفيذ' };
export function productionCardPath(order: CycleOrder, slot: CycleSlot) {
  return `/work-orders/${encodeURIComponent(order.id)}?cycle=2&slot=${encodeURIComponent(slot.id)}&document=${encodeURIComponent(slot.productionDocumentId || '')}`;
}
export function cycleTasks(order: CycleOrder, uid: string, permissions: Record<string, boolean>) {
  if (order.productionStatus === 'draft') return permissions['workOrders.approve'] ? [{ title: 'مراجعة واعتماد الأمر', slot: order.slots[0] }] : [];
  if (order.supervisorUid === uid && permissions['workOrders.execute']) {
    const slot = order.slots.find(row => row.id === order.activeSlotId) || order.slots.find(row => row.status === 'planned');
    return slot ? [{ title: order.qualityHold ? 'متوقف بقرار الجودة' : slot.status === 'paused' ? 'مراجعة التوقف واستئناف الساعة' : slot.status === 'open' ? 'تسجيل إنتاج الساعة' : order.workerIds.length ? 'بدء الساعة التالية' : 'ربط العمالة وبدء الساعة', slot }] : [];
  }
  if (permissions['workOrders.inspect'] || permissions['workOrders.assignInspectors']) return order.slots.filter(slot => slot.status === 'quality_pending').map(slot => ({ title: 'بانتظار إتاحة فحص الجودة — الدفعة الثالثة', slot }));
  return [];
}
