export const getApiBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return '/api/v1';
};

export class ApiError extends Error {
  public code: string;
  public details?: any;
  public status: number;

  constructor(message: string, code: string, status: number, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T; meta?: any }> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-requested-with': 'XMLHttpRequest',
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Includes session cookie automatically
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok || json.success === false) {
    const errorMsg = json.error?.message || response.statusText || 'Request failed';
    const errorCode = json.error?.code || 'API_ERROR';
    throw new ApiError(errorMsg, errorCode, response.status, json.error?.details);
  }

  return {
    data: json.data as T,
    meta: json.meta,
  };
}

export const api = {
  get: <T = any>(endpoint: string, params?: Record<string, any>) => {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value));
        }
      });
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }
    return request<T>(url, { method: 'GET' });
  },

  post: <T = any>(endpoint: string, body?: any) => {
    return request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put: <T = any>(endpoint: string, body?: any) => {
    return request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch: <T = any>(endpoint: string, body?: any) => {
    return request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete: <T = any>(endpoint: string) => {
    return request<T>(endpoint, { method: 'DELETE' });
  },
};
