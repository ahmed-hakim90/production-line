import type { WorkOrderHourlySlot } from '../../../types';

const MINUTES_PER_DAY = 24 * 60;

const toMinutes = (value: string): number => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time: ${value}`);
  return hours * 60 + minutes;
};

const toTime = (minutes: number): string => {
  const safe = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

const dateRange = (startDate: string, targetDate: string): string[] => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${targetDate}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
  }
  return dates;
};

export interface GenerateWorkOrderHourlySlotsInput {
  startDate: string;
  targetDate: string;
  workdayStartTime: string;
  workdayEndTime: string;
  breakStartTime?: string;
  breakEndTime?: string;
  dailyTarget: number;
}

export const generateWorkOrderHourlySlots = (input: GenerateWorkOrderHourlySlotsInput): WorkOrderHourlySlot[] => {
  const dayStart = toMinutes(input.workdayStartTime);
  const dayEnd = toMinutes(input.workdayEndTime);
  if (dayEnd <= dayStart) throw new Error('وقت نهاية الوردية يجب أن يكون بعد وقت البداية.');

  const breakStart = input.breakStartTime ? toMinutes(input.breakStartTime) : dayEnd;
  const breakEnd = input.breakEndTime ? toMinutes(input.breakEndTime) : dayEnd;
  const hasBreak = breakStart >= dayStart && breakEnd > breakStart && breakEnd <= dayEnd;
  const intervals = hasBreak
    ? [[dayStart, breakStart], [breakEnd, dayEnd]]
    : [[dayStart, dayEnd]];
  const operatingMinutes = intervals.reduce((sum, [from, to]) => sum + Math.max(0, to - from), 0);
  if (operatingMinutes <= 0) throw new Error('لا توجد مدة تشغيل فعلية بعد خصم البريك.');

  const slots: WorkOrderHourlySlot[] = [];
  dateRange(input.startDate, input.targetDate).forEach((date) => {
    let allocatedTarget = 0;
    intervals.forEach(([from, to]) => {
      for (let cursor = from; cursor < to; cursor += 60) {
        const end = Math.min(cursor + 60, to);
        const isFinalSlot = end === intervals[intervals.length - 1][1];
        const rawTarget = Math.max(0, input.dailyTarget) * ((end - cursor) / operatingMinutes);
        const target = isFinalSlot
          ? Math.max(0, Math.round((input.dailyTarget - allocatedTarget) * 100) / 100)
          : Math.round(rawTarget * 100) / 100;
        allocatedTarget += target;
        slots.push({
          id: `${date}_${toTime(cursor).replace(':', '')}`,
          date,
          startTime: toTime(cursor),
          endTime: toTime(end),
          targetQuantity: target,
          status: 'planned',
        });
      }
    });
  });
  if (slots.length > 240) {
    throw new Error('مدة أمر الشغل تُنتج أكثر من 240 ساعة. قسّم الأمر إلى أكثر من أمر شغل.');
  }
  return slots;
};

export const hasStartedHourlySlots = (slots: WorkOrderHourlySlot[] | undefined): boolean =>
  Boolean(slots?.some((slot) => slot.status !== 'planned'));

export const hasActiveHourlySlot = (slots: WorkOrderHourlySlot[] | undefined): boolean =>
  Boolean(slots?.some((slot) => slot.status === 'open' || slot.status === 'paused'));
