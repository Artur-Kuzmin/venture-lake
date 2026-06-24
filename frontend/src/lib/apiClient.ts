// Single API client for the frontend. All backend calls go through here.
// It attaches the Bearer token and unwraps the standard { data } / { error }
// envelopes (Foundation Bible, Section 4.5). The frontend NEVER writes business
// data directly to the database — it only calls these endpoints.

import type { ApiErrorBody } from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

// Token persistence. The JWT is kept in localStorage so the session survives a
// reload / dev-server restart, and is read fresh on every request below.
// SECURITY NOTE (do not implement now): localStorage is readable by any script
// on the page, so a successful XSS could exfiltrate this token. For production,
// revisit moving the token to an httpOnly, Secure cookie set by the backend
// (not JS-readable) and retire this localStorage path.
const TOKEN_KEY = 'venturelake.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // fetch only rejects on network-level failures: the server is unreachable,
    // VITE_API_BASE_URL is wrong, or the request was blocked by CORS. The
    // browser hides which, so we surface one clear message. We log the method
    // and path for debugging but NEVER the request body (it may hold a password).
    console.error(`[api] network error: ${method} ${BASE_URL}${path}`, networkErr);
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot connect to the server.');
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const errBody = payload as ApiErrorBody | null;
    const code = errBody?.error?.code ?? 'UNKNOWN_ERROR';
    const message = errBody?.error?.message ?? `Request failed (${res.status}).`;
    throw new ApiError(res.status, code, message);
  }

  return (payload as { data: T } | null)?.data as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  del: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'DELETE' }),
};

export default api;
