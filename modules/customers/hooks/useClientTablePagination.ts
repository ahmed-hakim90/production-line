import { useEffect, useMemo, useState } from 'react';

export const CUSTOMER_DEPOSITS_TABLE_PAGE_SIZE = 20;

/**
 * ترقيم صفحات على مصفوفة محمّلة بالكامل (واجهة فقط — بدون طلبات إضافية لـ Firestore).
 */
export function useClientTablePagination<T>(items: readonly T[], pageSize: number, resetKey?: string) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const slice = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return { page, setPage, totalPages, slice, totalItems: items.length };
}
