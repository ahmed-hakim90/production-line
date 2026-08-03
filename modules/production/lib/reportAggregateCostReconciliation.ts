export type AggregateCostPosting = {
  targetId: string;
  amount: number;
};

const normalizePosting = (posting: AggregateCostPosting): AggregateCostPosting => ({
  targetId: String(posting.targetId || '').trim(),
  amount: Number.isFinite(Number(posting.amount)) ? Number(posting.amount) : 0,
});

/**
 * Calculates the exact aggregate deltas from the report's persisted posting
 * snapshot. Re-running after the snapshot is updated produces zero deltas.
 */
export function buildAggregateCostDeltas(
  previous: AggregateCostPosting,
  desired: AggregateCostPosting,
): Map<string, number> {
  const oldPosting = normalizePosting(previous);
  const nextPosting = normalizePosting(desired);
  const deltas = new Map<string, number>();
  if (oldPosting.targetId) {
    deltas.set(
      oldPosting.targetId,
      Number(deltas.get(oldPosting.targetId) || 0) - oldPosting.amount,
    );
  }
  if (nextPosting.targetId) {
    deltas.set(
      nextPosting.targetId,
      Number(deltas.get(nextPosting.targetId) || 0) + nextPosting.amount,
    );
  }
  return deltas;
}
