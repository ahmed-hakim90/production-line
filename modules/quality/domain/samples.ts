export interface AdditionalInspectorInput {
  additionalInspectorId?: string | null;
  additionalSampleCount?: number | null;
  primaryInspectorId: string;
  sampleCount: number;
}

export function validateAdditionalInspector(input: AdditionalInspectorInput): {
  additionalInspectorId: string | null;
  additionalSampleCount: number;
} {
  const inspectorId = String(input.additionalInspectorId || '').trim();
  const rawCount = input.additionalSampleCount;
  const sampleCount = rawCount == null || rawCount === ('' as unknown) ? 0 : Number(rawCount);
  if (!inspectorId && sampleCount === 0) {
    return { additionalInspectorId: null, additionalSampleCount: 0 };
  }
  if (!inspectorId) throw new Error('اختر المراقب الإضافي أو اترك عدد عيناته صفرًا.');
  if (inspectorId === input.primaryInspectorId) {
    throw new Error('يجب اختيار مراقب إضافي مختلف عن المراقب الأساسي.');
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > input.sampleCount) {
    throw new Error('عدد عينات المراقب الإضافي يجب أن يكون من 1 إلى إجمالي عينات السحبة.');
  }
  return { additionalInspectorId: inspectorId, additionalSampleCount: sampleCount };
}

export function primaryInspectorSampleCount(sampleCount: number, additionalSampleCount: number): number {
  return Math.max(0, sampleCount - additionalSampleCount);
}

export function assertSampleCount(sampleCount: number): void {
  if (!Number.isInteger(sampleCount) || sampleCount < 1) {
    throw new Error('عدد العينات يجب أن يكون عددًا صحيحًا أكبر من صفر.');
  }
}

export function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('التاريخ غير صالح.');
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error('التاريخ غير صالح.');
  const local = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  if (local !== value) throw new Error('التاريخ غير صالح.');
}

export function assertRequiredText(value: string | undefined, message: string): string {
  const text = String(value || '').trim();
  if (!text) throw new Error(message);
  return text;
}
