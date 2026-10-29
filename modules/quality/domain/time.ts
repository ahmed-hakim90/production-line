export function localDateIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localTimeHm(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function assertSlotWindow(input: {
  startTime: string;
  endTime: string;
  kind: 'hourly' | 'line';
  id?: string;
  existing: Array<{ id?: string; kind: 'hourly' | 'line'; startTime: string; endTime: string; isActive?: boolean }>;
}): void {
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime) || input.endTime <= input.startTime) {
    throw new Error('وقت الفترة غير صالح. يجب أن تنتهي بعد بدايتها.');
  }
  const overlap = input.existing.find((slot) =>
    slot.kind === input.kind
    && slot.isActive !== false
    && slot.id !== input.id
    && slot.startTime < input.endTime
    && input.startTime < slot.endTime,
  );
  if (overlap) throw new Error('الفترة تتداخل مع فترة محفوظة من نفس النوع.');
}

export const STANDARD_SAMPLE_SLOTS = Array.from({ length: 8 }, (_, index) => {
  const hour = 8 + index;
  const start = `${String(hour).padStart(2, '0')}:00`;
  const end = `${String(hour + 1).padStart(2, '0')}:00`;
  return {
    slotKey: `standard-${start}-${end}`,
    slotName: `السحبة ${index + 1} (${start} - ${end})`,
    startTime: start,
    endTime: end,
    displayOrder: index + 1,
  };
});
