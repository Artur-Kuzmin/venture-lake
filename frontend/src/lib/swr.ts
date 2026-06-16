import useSWR from 'swr';
import type { SWRConfiguration } from 'swr';
import { api } from './apiClient';

// GET cache layer. The SWR key IS the API path; the shared fetcher reuses the
// api client (auth header + { data } envelope unwrap). SWR dedupes in-flight
// requests by key, caches across navigations, and renders stale-while-
// revalidate — so revisiting a route shows cached content instantly while it
// refreshes in the background. Mutations still POST directly to the backend.
export const swrFetcher = <T>(path: string): Promise<T> => api.get<T>(path);

// Pass `key = null` to skip the request (conditional fetching).
export function useApi<T>(key: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(key, swrFetcher, config);
}
