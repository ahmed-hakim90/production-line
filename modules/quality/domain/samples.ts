export interface AdditionalInspectorInput {
  additionalInspectorId?: string | null;
  additionalSampleCount?: number | null;
  primaryInspectorId: string;
  sampleCount: number;
}

export interface AdditionalInspectorAssignmentInput {
  employeeId: string;
  employeeName: string;
  sampleCount: number;
}

export function validateAdditionalInspectorAssignments(
  assignments: AdditionalInspectorAssignmentInput[],
  primaryInspectorId: string,
  totalSampleCount: number,
): AdditionalInspectorAssignmentInput[] {
  assertSampleCount(totalSampleCount);
  const ids = new Set<string>();
  let assignedCount = 0;
  const validated: AdditionalInspectorAssignmentInput[] = [];
  for (const assignment of assignments) {
    const employeeId = String(assignment.employeeId || '').trim();
    const employeeName = String(assignment.employeeName || '').trim();
    if (!employeeId || !employeeName) throw new Error('اختر المراقب الإضافي وأدخل اسمه.');
    if (employeeId === primaryInspectorId) throw new Error('يجب أن يكون المراقب الإضافي مختلفًا عن المراقب الأساسي.');
    if (ids.has(employeeId)) throw new Error('لا يمكن اختيار المراقب الإضافي أكثر من مرة.');
    if (!Number.isInteger(assignment.sampleCount) || assignment.sampleCount < 1) {
      throw new Error('عدد عينات المراقب الإضافي يجب أن يكون عددًا صحيحًا موجبًا.');
    }
    ids.add(employeeId);
    assignedCount += assignment.sampleCount;
    validated.push({ employeeId, employeeName, sampleCount: assignment.sampleCount });
  }
  if (assignedCount >= totalSampleCount) {
    throw new Error('يجب ترك عينة واحدة على الأقل للمراقب الأساسي.');
  }
  return validated;
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
  if (!Number.isInteger(sampleCount) || sampleCount < 1) {
    throw new Error('عدد عينات المراقب الإضافي يجب أن يكون عددًا صحيحًا موجبًا.');
  }
  return { additionalInspectorId: inspectorId, additionalSampleCount: sampleCount };
}

export function primaryInspectorSampleCount(
  sampleCount: number,
  additionalSampleCount: number,
  semantics?: 'base_plus_additional',
): number {
  return semantics === 'base_plus_additional'
    ? sampleCount
    : Math.max(0, sampleCount - additionalSampleCount);
}

export function totalLinePullSampleCount(input: {
  sampleCount: number;
  additionalSampleCount?: number;
  additionalInspectors?: AdditionalInspectorAssignmentInput[];
  sampleCountSemantics?: 'base_plus_additional';
}): number {
  const sampleCount = Math.max(0, Number(input.sampleCount) || 0);
  if (input.additionalInspectors?.length) return sampleCount;
  if (input.sampleCountSemantics === 'base_plus_additional') {
    return sampleCount + Math.max(0, Number(input.additionalSampleCount) || 0);
  }
  return sampleCount;
}

export function isLinePullRejectedByLimit(defectCount: number, rejectLimit: number): boolean {
  if (!Number.isInteger(defectCount) || defectCount < 0) {
    throw new Error('إجمالي العيوب يجب أن يكون عددًا صحيحًا غير سالب.');
  }
  if (!Number.isInteger(rejectLimit) || rejectLimit < 0) {
    throw new Error('حد الرفض يجب أن يكون عددًا صحيحًا غير سالب.');
  }
  return defectCount > rejectLimit;
}

export function resolveLinePullDecision(
  defectCount: number,
  rejectLimit: number,
  mode: 'auto' | 'manual_accept' | 'manual_reject' = 'auto',
): boolean {
  const automaticDecision = isLinePullRejectedByLimit(defectCount, rejectLimit);
  if (mode === 'manual_accept') return false;
  if (mode === 'manual_reject') return true;
  return automaticDecision;
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
