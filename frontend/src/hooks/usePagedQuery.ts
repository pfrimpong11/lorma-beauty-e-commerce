'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PAGE_SIZE } from './useClientPagination';

export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; pages: number };
}

/**
 * Paginated list data with debounced search.
 *
 * `keepPreviousData` holds the current page on screen while the next one
 * loads, so tables do not flash empty between pages.
 */
export function usePagedQuery<T>(
  key: string,
  path: string,
  params: Record<string, string | undefined> = {},
  pageSize = PAGE_SIZE,
) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')),
  } as Record<string, string>);

  const result = useQuery({
    queryKey: [key, page, debouncedSearch, params],
    queryFn: () => api.get<Paged<T>>(`${path}?${query.toString()}`),
    placeholderData: keepPreviousData,
  });

  return {
    ...result,
    rows: result.data?.data ?? [],
    meta: result.data?.meta ?? { page, pageSize, total: 0, pages: 0 },
    pageSize,
    page,
    setPage,
    search,
    setSearch,
  };
}
