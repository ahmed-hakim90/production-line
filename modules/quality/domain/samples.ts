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

export function hourlySampleTotals(rows: Array<{ sampleCount: number; defectCount: number }>): {
  pulls: number;
  samples: number;
  defects: number;
  defectRate: number;
} {
  const samples = rows.reduce((sum, row) => sum + (Number(row.sampleCount) || 0), 0);
  const defects = rows.reduce((sum, row) => sum + (Number(row.defectCount) || 0), 0);
  return {
    pulls: rows.length,
    samples,
    defects,
    defectRate: samples > 0 ? Number(((defects / samples) * 100).toFixed(1)) : 0,
  };
}

export function hourlyDefectRate(sampleCount: number, defectCount: number): number {
  const samples = Number(sampleCount) || 0;
  if (samples <= 0) return 0;
  return Number((((Number(defectCount) || 0) / samples) * 100).toFixed(1));
}

export function hourlyDefectText(defects?: Array<{ reasonLabel: string; count: number }>): string {
  const parts = (defects || [])
    .map((defect) => ({ label: defect.reasonLabel.trim() || 'عيب غير محدد', count: Number(defect.count) || 0 }))
    .filter((defect) => defect.count > 0)
    .map((defect) => `${defect.label}: ${defect.count}`);
  return parts.join('، ') || 'لا توجد عيوب';
}

export function hourlyProductionMatch(input: {
  production: Array<{ lineId: string; productId: string; lineName: string; productName: string; quantityProduced: number }>;
  samples: Array<{ lineId: string; productId: string; sampleCount: number; defectCount: number }>;
}): Array<{ lineId: string; productId: string; lineName: string; productName: string; produced: number; samples: number; defects: number; estimatedQualityRate: string }> {
  const grouped = new Map<string, { lineId: string; productId: string; lineName: string; productName: string; produced: number; samples: number; defects: number }>();
  input.production.forEach((row) => {
    const key = `${row.lineId}:${row.productId}`;
    const current = grouped.get(key) || { lineId: row.lineId, productId: row.productId, lineName: row.lineName, productName: row.productName, produced: 0, samples: 0, defects: 0 };
    current.produced += Number(row.quantityProduced) || 0;
    if (row.lineName) current.lineName = row.lineName;
    if (row.productName) current.productName = row.productName;
    grouped.set(key, current);
  });
  input.samples.forEach((row) => {
    const current = grouped.get(`${row.lineId}:${row.productId}`);
    if (!current) return;
    current.samples += Number(row.sampleCount) || 0;
    current.defects += Number(row.defectCount) || 0;
  });
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      estimatedQualityRate: row.produced > 0
        ? `${Number((((row.produced - row.defects) / row.produced) * 100).toFixed(1))}٪`
        : '—',
    }))
    .sort((left, right) => right.produced - left.produced || left.lineName.localeCompare(right.lineName, 'ar'));
}

export interface HourlyInspectorBoard {
  key: string;
  label: string;
  inspectors: Array<{
    name: string;
    products: Array<{ productName: string; samples: number; defects: number; inspectorTotal: number; problems: string[] }>;
  }>;
}

export function hourlyInspectorSummary(rows: Array<{
  slotKey: string;
  slotName: string;
  inspectorName: string;
  productName: string;
  sampleCount: number;
  defectCount: number;
  defects?: Array<{ reasonLabel: string; count: number; notes?: string }>;
}>): HourlyInspectorBoard[] {
  const hours = new Map<string, { label: string; inspectors: Map<string, Map<string, { samples: number; defects: number; problems: string[] }>> }>();
  rows.forEach((row) => {
    const key = row.slotKey || row.slotName || 'غير محدد';
    const hour = hours.get(key) || { label: row.slotName.trim() || 'فترة غير محددة', inspectors: new Map() };
    const inspectorName = row.inspectorName.trim() || 'غير محدد';
    const products = hour.inspectors.get(inspectorName) || new Map<string, { samples: number; defects: number; problems: string[] }>();
    const productName = row.productName.trim() || 'غير محدد';
    const product = products.get(productName) || { samples: 0, defects: 0, problems: [] };
    product.samples += Number(row.sampleCount) || 0;
    product.defects += Number(row.defectCount) || 0;
    (row.defects || []).forEach((defect) => {
      const count = Number(defect.count) || 0;
      if (count <= 0) return;
      const reason = defect.reasonLabel.trim() || 'عيب غير محدد';
      const notes = defect.notes?.trim() ? ` - ${defect.notes.trim()}` : '';
      product.problems.push(`${productName}: ${reason} (${count})${notes}`);
    });
    products.set(productName, product);
    hour.inspectors.set(inspectorName, products);
    hours.set(key, hour);
  });
  return [...hours.entries()]
    .sort((left, right) => left[0].localeCompare(right[0], 'ar') || left[1].label.localeCompare(right[1].label, 'ar'))
    .map(([key, hour]) => ({
      key,
      label: hour.label,
      inspectors: [...hour.inspectors.entries()]
        .sort((left, right) => left[0].localeCompare(right[0], 'ar'))
        .map(([name, products]) => {
          const inspectorTotal = [...products.values()].reduce((sum, product) => sum + product.samples, 0);
          return {
            name,
            products: [...products.entries()]
              .sort((left, right) => left[0].localeCompare(right[0], 'ar'))
              .map(([productName, product]) => ({
                productName,
                samples: product.samples,
                defects: product.defects,
                inspectorTotal,
                problems: product.problems,
              })),
          };
        }),
    }));
}

export interface LinePullSummaryRow {
  lineId: string;
  lineName: string;
  productName: string;
  stationName: string;
  inspectorName: string;
  additionalInspectorName?: string;
  sampleCount: number;
  additionalSampleCount: number;
  sampleCountSemantics?: 'base_plus_additional';
  defectCount: number;
  status: 'pending' | 'completed';
  palletRejected?: boolean;
  defects?: Array<{ reasonLabel: string; count: number; notes?: string }>;
}

function joinLabels(values: Iterable<string>): string {
  return [...values].filter(Boolean).sort((left, right) => left.localeCompare(right, 'ar')).join('، ') || '—';
}

export function linePullLineSummary(rows: LinePullSummaryRow[]): Array<{
  lineId: string;
  lineName: string;
  products: string;
  stations: string;
  inspectors: string;
  pulls: number;
  samples: number;
  defects: number;
  palletStatus: string;
  problems: string;
  accepted: number;
  rejected: number;
  pending: number;
  undecided: number;
}> {
  const grouped = new Map<string, LinePullSummaryRow[]>();
  rows.forEach((row) => grouped.set(row.lineId, [...(grouped.get(row.lineId) || []), row]));
  return [...grouped.entries()].map(([lineId, pulls]) => {
    const products = new Set<string>();
    const stations = new Set<string>();
    const inspectors = new Map<string, number>();
    const reasons = new Map<string, number>();
    const notes = new Set<string>();
    let samples = 0;
    let defects = 0;
    let accepted = 0;
    let rejected = 0;
    let pending = 0;
    let undecided = 0;
    pulls.forEach((row) => {
      samples += recordedLinePullSamples(row);
      defects += Number(row.defectCount) || 0;
      if (row.productName) products.add(row.productName);
      if (row.stationName) stations.add(row.stationName);
      const extra = Math.max(0, Number(row.additionalSampleCount) || 0);
      const primary = primaryInspectorSampleCount(row.sampleCount, extra, row.sampleCountSemantics);
      if (row.inspectorName.trim() && primary > 0) inspectors.set(row.inspectorName.trim(), (inspectors.get(row.inspectorName.trim()) || 0) + primary);
      if (row.additionalInspectorName?.trim() && extra > 0) {
        const name = row.additionalInspectorName.trim();
        inspectors.set(name, (inspectors.get(name) || 0) + extra);
      }
      if (row.status !== 'completed') pending += 1;
      else if (row.palletRejected) rejected += 1;
      else if (row.palletRejected === false) accepted += 1;
      else undecided += 1;
      (row.defects || []).forEach((defect) => {
        const count = Number(defect.count) || 0;
        if (count <= 0) return;
        const label = defect.reasonLabel.trim() || 'عيب غير محدد';
        reasons.set(label, (reasons.get(label) || 0) + count);
        if (defect.notes?.trim()) notes.add(defect.notes.trim());
      });
    });
    const palletStatus = palletStatusText({ accepted, rejected, pending, undecided });
    const problemParts = [
      ...[...reasons.entries()].sort((left, right) => right[1] - left[1]).map(([label, count]) => `${label} (${count})`),
      pending ? `${pending} سحبة بانتظار الفحص` : '',
      ...notes,
    ].filter(Boolean);
    return {
      lineId,
      lineName: pulls[0]?.lineName || 'خط غير معروف',
      products: joinLabels(products),
      stations: joinLabels(stations),
      inspectors: [...inspectors.entries()].sort((left, right) => left[0].localeCompare(right[0], 'ar')).map(([name, count]) => `${name} (${count} عينة)`).join('، ') || '—',
      pulls: pulls.length,
      samples,
      defects,
      palletStatus,
      problems: problemParts.join('، ') || (pulls.length ? 'لا توجد مشاكل مسجلة' : 'لا توجد سحبات'),
      accepted,
      rejected,
      pending,
      undecided,
    };
  }).sort((left, right) => left.lineName.localeCompare(right.lineName, 'ar'));
}

export interface LinePullPeriodStatus {
  slotKey: string;
  lineId: string;
  lineName: string;
  isStopped: boolean;
  noSampleReason: string;
}

export interface LinePullPeriodRow extends LinePullSummaryRow {
  slotKey: string;
  startTime: string;
  endTime: string;
}

export function palletStatusText(counts: { accepted: number; rejected: number; pending: number; undecided: number }): string {
  const parts = [
    counts.accepted ? `مقبولة (${counts.accepted})` : '',
    counts.rejected ? `مرفوضة (${counts.rejected})` : '',
    counts.pending ? `بانتظار الفحص (${counts.pending})` : '',
    counts.undecided ? `غير محددة (${counts.undecided})` : '',
  ].filter(Boolean);
  return parts.join('، ') || '—';
}

export function linePullDayTotals(rows: LinePullSummaryRow[]): {
  pulls: number;
  samples: number;
  defects: number;
  lines: number;
  palletStatus: string;
} {
  const lines = linePullLineSummary(rows);
  return {
    pulls: rows.length,
    samples: lines.reduce((sum, row) => sum + row.samples, 0),
    defects: lines.reduce((sum, row) => sum + row.defects, 0),
    lines: lines.length,
    palletStatus: palletStatusText({
      accepted: lines.reduce((sum, row) => sum + row.accepted, 0),
      rejected: lines.reduce((sum, row) => sum + row.rejected, 0),
      pending: lines.reduce((sum, row) => sum + row.pending, 0),
      undecided: lines.reduce((sum, row) => sum + row.undecided, 0),
    }),
  };
}

export function linePullPeriodBoards(rows: LinePullPeriodRow[], statuses: LinePullPeriodStatus[]): Array<{
  key: string;
  label: string;
  samples: number;
  pulls: number;
  defects: number;
  palletStatus: string;
  lines: Array<ReturnType<typeof linePullLineSummary>[number] & { pullStatus: string; lineStatus: string; noSampleReason: string }>;
}> {
  const periods = new Map<string, { slotKey: string; startTime: string; endTime: string }>();
  rows.forEach((row) => {
    const key = row.slotKey || `${row.startTime}-${row.endTime}`;
    if (!periods.has(key)) periods.set(key, { slotKey: key, startTime: row.startTime, endTime: row.endTime });
  });
  statuses.forEach((status) => {
    if (status.slotKey && !periods.has(status.slotKey)) periods.set(status.slotKey, { slotKey: status.slotKey, startTime: '', endTime: '' });
  });
  return [...periods.values()]
    .sort((left, right) => {
      if (!left.startTime && right.startTime) return 1;
      if (left.startTime && !right.startTime) return -1;
      return left.startTime.localeCompare(right.startTime) || left.slotKey.localeCompare(right.slotKey, 'ar');
    })
    .map((period) => {
      const periodRows = rows.filter((row) => (row.slotKey || `${row.startTime}-${row.endTime}`) === period.slotKey);
      const saved = statuses.filter((status) => status.slotKey === period.slotKey);
      const lines = linePullLineSummary(periodRows);
      const byLine = new Map(lines.map((line) => [line.lineId, line]));
      saved.forEach((status) => {
        if (byLine.has(status.lineId) || (!status.isStopped && !status.noSampleReason.trim())) return;
        byLine.set(status.lineId, {
          lineId: status.lineId,
          lineName: status.lineName || 'خط غير معروف',
          products: '—',
          stations: '—',
          inspectors: '—',
          pulls: 0,
          samples: 0,
          defects: 0,
          palletStatus: '—',
          problems: 'لا توجد سحبات',
          accepted: 0,
          rejected: 0,
          pending: 0,
          undecided: 0,
        });
      });
      const periodLines = [...byLine.values()]
        .map((line) => {
          const status = saved.find((item) => item.lineId === line.lineId);
          return {
            ...line,
            pullStatus: line.pulls === 0 ? '—' : line.pending > 0 ? `بانتظار الفحص (${line.pending})` : 'تم الفحص',
            lineStatus: status ? (status.isStopped ? 'متوقف' : 'يعمل') : '—',
            noSampleReason: line.pulls === 0 ? (status?.noSampleReason.trim() || '—') : '—',
          };
        })
        .sort((left, right) => left.lineName.localeCompare(right.lineName, 'ar'));
      return {
        key: period.slotKey,
        label: period.startTime ? `${period.startTime}–${period.endTime}` : period.slotKey,
        samples: periodLines.reduce((sum, line) => sum + line.samples, 0),
        pulls: periodLines.reduce((sum, line) => sum + line.pulls, 0),
        defects: periodLines.reduce((sum, line) => sum + line.defects, 0),
        palletStatus: palletStatusText({
          accepted: periodLines.reduce((sum, line) => sum + line.accepted, 0),
          rejected: periodLines.reduce((sum, line) => sum + line.rejected, 0),
          pending: periodLines.reduce((sum, line) => sum + line.pending, 0),
          undecided: periodLines.reduce((sum, line) => sum + line.undecided, 0),
        }),
        lines: periodLines,
      };
    });
}

function exportCell(value: string | number): string | number {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function linePullExportRows(date: string, boards: ReturnType<typeof linePullPeriodBoards>): Array<Record<string, string | number>> {
  return boards.flatMap((period) => period.lines.map((line) => ({
    التاريخ: exportCell(date),
    'فترة السحب': exportCell(period.label),
    الخط: exportCell(line.lineName),
    المنتج: exportCell(line.products),
    'محطة الفحص': exportCell(line.stations),
    المراقبون: exportCell(line.inspectors),
    'عدد السحبات': line.pulls,
    'عدد العينات': line.samples,
    'حالة البالتة': exportCell(line.palletStatus),
    'إجمالي العيوب': line.defects,
    'حالة السحب': exportCell(line.pullStatus),
    'حالة الخط': exportCell(line.lineStatus),
    'سبب عدم السحب': exportCell(line.noSampleReason),
    المشاكل: exportCell(line.problems),
  })));
}

export interface LinePullDailyGroup {
  name: string;
  pulls: number;
  samples: number;
  defects: number;
  accepted: number;
  rejected: number;
  pending: number;
  undecided: number;
  palletStatus: string;
}

export interface LinePullPeriodInspector {
  name: string;
  samples: number;
  defects: number;
  palletStatus: string;
  context: string;
  reasons: string;
}

function emptyPalletCounts(): { accepted: number; rejected: number; pending: number; undecided: number } {
  return { accepted: 0, rejected: 0, pending: 0, undecided: 0 };
}

function countPallet(counts: { accepted: number; rejected: number; pending: number; undecided: number }, row: Pick<LinePullSummaryRow, 'status' | 'palletRejected'>): void {
  if (row.status !== 'completed') counts.pending += 1;
  else if (row.palletRejected) counts.rejected += 1;
  else if (row.palletRejected === false) counts.accepted += 1;
  else counts.undecided += 1;
}

function recordedLinePullSamples(row: Pick<LinePullSummaryRow, 'sampleCount' | 'additionalSampleCount' | 'sampleCountSemantics'>): number {
  return totalLinePullSampleCount(row);
}

function pullAssignments(row: LinePullSummaryRow): Array<{ name: string; samples: number; primary: boolean }> {
  const extra = Number(row.additionalSampleCount) || 0;
  return [
    { name: row.inspectorName.trim() || 'غير محدد', samples: primaryInspectorSampleCount(row.sampleCount, extra, row.sampleCountSemantics), primary: true },
    ...(row.additionalInspectorName?.trim() && extra > 0
      ? [{ name: row.additionalInspectorName.trim(), samples: extra, primary: false }]
      : []),
  ].filter((assignment) => assignment.samples > 0);
}

export function linePullDailySummary(rows: Array<LinePullSummaryRow & { slotKey?: string; startTime: string; endTime: string }>): {
  periods: Array<{ key: string; label: string; pulls: number; samples: number; defects: number; palletStatus: string; inspectors: LinePullPeriodInspector[] }>;
  inspectors: LinePullDailyGroup[];
  stations: LinePullDailyGroup[];
  lines: LinePullDailyGroup[];
} {
  const periods = new Map<string, { startTime: string; endTime: string; pulls: number; samples: number; defects: number; pallets: ReturnType<typeof emptyPalletCounts>; inspectors: Map<string, { samples: number; defects: number; pallets: ReturnType<typeof emptyPalletCounts>; lines: Set<string>; stations: Set<string>; reasons: Map<string, number> }> }>();
  rows.forEach((row) => {
    const key = row.slotKey || `${row.startTime}-${row.endTime}`;
    const period = periods.get(key) || { startTime: row.startTime, endTime: row.endTime, pulls: 0, samples: 0, defects: 0, pallets: emptyPalletCounts(), inspectors: new Map() };
    period.pulls += 1;
    period.samples += recordedLinePullSamples(row);
    period.defects += Number(row.defectCount) || 0;
    countPallet(period.pallets, row);
    pullAssignments(row).forEach((assignment) => {
      const inspector = period.inspectors.get(assignment.name) || { samples: 0, defects: 0, pallets: emptyPalletCounts(), lines: new Set<string>(), stations: new Set<string>(), reasons: new Map<string, number>() };
      inspector.samples += assignment.samples;
      if (assignment.primary) {
        inspector.defects += Number(row.defectCount) || 0;
        countPallet(inspector.pallets, row);
        (row.defects || []).forEach((defect) => {
          const count = Number(defect.count) || 0;
          if (count <= 0) return;
          const label = defect.reasonLabel.trim() || 'عيب غير محدد';
          inspector.reasons.set(label, (inspector.reasons.get(label) || 0) + count);
        });
      }
      if (row.lineName.trim()) inspector.lines.add(row.lineName.trim());
      if (row.stationName.trim()) inspector.stations.add(row.stationName.trim());
      period.inspectors.set(assignment.name, inspector);
    });
    periods.set(key, period);
  });

  const groupBy = (kind: 'inspector' | 'station' | 'line'): LinePullDailyGroup[] => {
    const groups = new Map<string, { pulls: number; samples: number; defects: number; pallets: ReturnType<typeof emptyPalletCounts> }>();
    rows.forEach((row) => {
      const assignments = kind === 'inspector'
        ? pullAssignments(row).map((assignment) => ({ name: assignment.name, samples: assignment.samples, defects: assignment.primary ? Number(row.defectCount) || 0 : 0, pallet: assignment.primary }))
        : [{ name: (kind === 'station' ? row.stationName : row.lineName).trim() || '—', samples: recordedLinePullSamples(row), defects: Number(row.defectCount) || 0, pallet: true }];
      assignments.forEach((assignment) => {
        const current = groups.get(assignment.name) || { pulls: 0, samples: 0, defects: 0, pallets: emptyPalletCounts() };
        current.pulls += 1;
        current.samples += assignment.samples;
        current.defects += assignment.defects;
        if (assignment.pallet) countPallet(current.pallets, row);
        groups.set(assignment.name, current);
      });
    });
    return [...groups.entries()]
      .map(([name, group]) => ({
        name,
        pulls: group.pulls,
        samples: group.samples,
        defects: group.defects,
        ...group.pallets,
        palletStatus: palletStatusText(group.pallets),
      }))
      .sort((left, right) => right.samples - left.samples || left.name.localeCompare(right.name, 'ar'));
  };

  return {
    periods: [...periods.entries()]
      .sort((left, right) => {
        if (!left[1].startTime && right[1].startTime) return 1;
        if (left[1].startTime && !right[1].startTime) return -1;
        return left[1].startTime.localeCompare(right[1].startTime) || left[0].localeCompare(right[0], 'ar');
      })
      .map(([key, period]) => ({
        key,
        label: period.startTime ? `${period.startTime}–${period.endTime}` : key,
        pulls: period.pulls,
        samples: period.samples,
        defects: period.defects,
        palletStatus: palletStatusText(period.pallets),
        inspectors: [...period.inspectors.entries()]
          .map(([name, inspector]) => ({
            name,
            samples: inspector.samples,
            defects: inspector.defects,
            palletStatus: palletStatusText(inspector.pallets),
            context: [...inspector.lines, ...inspector.stations].join(' / ') || '—',
            reasons: inspector.defects
              ? [...inspector.reasons.entries()].sort((left, right) => right[1] - left[1]).map(([label, count]) => `${label} (${count})`).join('، ') || '—'
              : 'لا توجد عيوب',
          }))
          .sort((left, right) => right.samples - left.samples || left.name.localeCompare(right.name, 'ar')),
      })),
    inspectors: groupBy('inspector'),
    stations: groupBy('station'),
    lines: groupBy('line'),
  };
}

export function filterLinePulls<T extends { slotKey: string; lineId: string; status: string }>(
  rows: T[],
  filter: { slotKey?: string; lineId?: string; status?: string },
): T[] {
  return rows.filter((row) => (
    (!filter.slotKey || row.slotKey === filter.slotKey)
    && (!filter.lineId || row.lineId === filter.lineId)
    && (!filter.status || row.status === filter.status)
  ));
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
