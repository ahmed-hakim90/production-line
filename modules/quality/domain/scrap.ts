export interface ScrapCauseShare {
  reasonLabel: string;
  quantity: number;
  share: number;
}

/** Same share used by the standalone scrap analysis: quantity of a reason divided by the report total. */
export function scrapCauseShares(rows: Array<{ reasonLabel: string; quantity: number }>): ScrapCauseShare[] {
  const total = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const label = row.reasonLabel.trim();
    if (!label) return;
    totals.set(label, (totals.get(label) || 0) + Number(row.quantity || 0));
  });
  return [...totals.entries()]
    .map(([reasonLabel, quantity]) => ({
      reasonLabel,
      quantity,
      share: total > 0 ? quantity / total : 0,
    }))
    .sort((left, right) => right.quantity - left.quantity || left.reasonLabel.localeCompare(right.reasonLabel, 'ar'));
}
