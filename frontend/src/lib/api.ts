import { getConfig } from './runtime-config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Record<string, string[]>,
    readonly reference?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request never reached the server. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/**
 * The access token is held in memory only.
 *
 * Putting it in localStorage would expose it to any injected script; the
 * refresh token lives in an httpOnly cookie the browser will not reveal,
 * and a reload silently re-obtains an access token from it.
 */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip the automatic refresh-and-retry (used by refresh itself). */
  skipRefresh?: boolean;
  idempotencyKey?: string;
  deviceId?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { apiUrl } = getConfig();
  const { body, skipRefresh, idempotencyKey, deviceId, headers, ...rest } = options;

  const doFetch = async (): Promise<Response> =>
    fetch(`${apiUrl}/api/v1${path}`, {
      ...rest,
      // Sends the refresh cookie; the API allows credentials for our origin.
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        // Free ngrok tunnels serve an interstitial HTML page to browser
        // navigations; this header opts API calls out, so a JSON response
        // is never replaced by that page mid-sale.
        'ngrok-skip-browser-warning': 'true',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
        ...(deviceId ? { 'X-Device-Id': deviceId } : {}),
        ...(headers as Record<string, string>),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let response: Response;
  try {
    response = await doFetch();
  } catch {
    // Network unreachable — the caller decides whether to queue locally.
    throw new ApiError('You appear to be offline.', 0, 'OFFLINE');
  }

  // An expired access token is routine: refresh once, then retry.
  if (response.status === 401 && !skipRefresh) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await doFetch();
    } else {
      onUnauthorized?.();
      throw new ApiError('Your session has expired. Please sign in again.', 401, 'SESSION_EXPIRED');
    }
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as {
        message?: string;
        code?: string;
        details?: Record<string, string[]>;
        reference?: string;
      };
      throw new ApiError(
        payload.message ?? 'Something went wrong. Please try again.',
        response.status,
        payload.code,
        payload.details,
        payload.reference,
      );
    }
    throw new ApiError('Something went wrong. Please try again.', response.status);
  }

  if (contentType.includes('application/json')) return (await response.json()) as T;
  return (await response.blob()) as T;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Collapses concurrent 401s into a single refresh call. */
async function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const { apiUrl } = getConfig();
      const response = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so callers awaiting this one still see it.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),

  /** File downloads bypass JSON handling and return a Blob. */
  download: async (path: string): Promise<Blob> => {
    const { apiUrl } = getConfig();
    const response = await fetch(`${apiUrl}/api/v1${path}`, {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!response.ok) {
      throw new ApiError('The export could not be generated.', response.status);
    }
    return response.blob();
  },
};

export async function refreshSession(): Promise<boolean> {
  return tryRefresh();
}
