'use client';

import { useEffect, useMemo, useState } from 'react';

export const PAGE_SIZE = 10;

/**
 * Pages a list that is already in memory.
 *
 * Some screens legitimately fetch everything: reports need the whole set
 * to total it correctly, and categories, staff and expiry are small and
 * sorted client-side. They still should not render hundreds of rows at
 * once, so the paging happens here instead of at the API.
 */
export function useClientPagination<T>(rows: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));

  // Filtering can shrink the list under the current page; land on the
  // last real page rather than showing an empty table.
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  const pageRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  return { page, setPage, pages, pageSize, total: rows.length, pageRows };
}
