const TOKEN_STORAGE_KEY = 'ChikojA_auth_token';
const WINDOW_NAME_PREFIX = 'ChikojA_SESSION:';

// In-memory primary token store (immune to sandboxed/cross-site iframe storage blocks)
let memoryToken: string | null = null;

function readInitialToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const ls = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (ls) {
      memoryToken = ls;
      return ls;
    }
  } catch {
    // localStorage may be blocked in third-party iframes
  }
  try {
    const ss = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (ss) {
      memoryToken = ss;
      return ss;
    }
  } catch {
    // sessionStorage may be blocked in strict sandboxed iframes
  }
  try {
    if (typeof window !== 'undefined' && typeof window.name === 'string' && window.name.startsWith(WINDOW_NAME_PREFIX)) {
      const val = window.name.slice(WINDOW_NAME_PREFIX.length).trim();
      if (val) {
        memoryToken = val;
        return val;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function getStoredToken(): string | null {
  return readInitialToken();
}

export function setStoredToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage restriction
  }
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage restriction
  }
  try {
    if (typeof window !== 'undefined') {
      if (token) {
        window.name = `${WINDOW_NAME_PREFIX}${token}`;
      } else if (window.name.startsWith(WINDOW_NAME_PREFIX)) {
        window.name = '';
      }
    }
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError('اتصال اینترنت شما قطع است. لطفاً پس از برقراری اینترنت دوباره تلاش کنید.', 0);
  }

  const headers = new Headers(options.headers || {});
  const token = getStoredToken();
  if (token) {
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('X-ChikojA-Session')) {
      headers.set('X-ChikojA-Session', token);
    }
  }
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت خود را بررسی کنید.', 0);
  }

  let payload: Record<string, unknown> = {};
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    const errMsg =
      (typeof payload.error === 'string' && payload.error) ||
      (typeof payload.message === 'string' && payload.message) ||
      'خطایی در پردازش درخواست رخ داد.';
    throw new ApiError(errMsg, response.status, payload);
  }

  return payload as T;
}
