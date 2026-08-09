/**
 * Run async work grouped by key: different keys in parallel, same key sequentially.
 * Safe for Firestore balance docs that must not race on the same item.
 */
export async function mapGroupedSequentialParallel<T>(
  items: T[],
  keyOf: (item: T) => string,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item) || '__empty__';
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  await Promise.all(
    [...groups.values()].map(async (group) => {
      for (const item of group) {
        await worker(item);
      }
    }),
  );
}
