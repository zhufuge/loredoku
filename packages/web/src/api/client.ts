import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@loredoku/shared';

export class ApiError extends Error {
  readonly code: number;
  readonly details: unknown;

  constructor(code: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 15000,
});

async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  try {
    const { data } = await promise;
    if (data.code !== 0) {
      throw new ApiError(data.code, data.message, (data as { data?: unknown }).data);
    }
    return data.data as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err instanceof AxiosError) {
      const body = err.response?.data as ApiResponse<T> | undefined;
      if (body && typeof body.code === 'number') {
        throw new ApiError(body.code, body.message, (body as { data?: unknown }).data);
      }
      if (err.code === 'ECONNABORTED') {
        throw new ApiError(-1, '请求超时，请稍后重试');
      }
      if (!err.response) {
        throw new ApiError(-1, '无法连接到服务器，请检查网络');
      }
      throw new ApiError(-1, err.message);
    }
    throw err;
  }
}

export function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return unwrap<T>(apiClient.get<ApiResponse<T>>(url, config));
}

export function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return unwrap<T>(apiClient.post<ApiResponse<T>>(url, body, config));
}

export function apiPatch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return unwrap<T>(apiClient.patch<ApiResponse<T>>(url, body, config));
}

export function apiPut<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return unwrap<T>(apiClient.put<ApiResponse<T>>(url, body, config));
}

export function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return unwrap<T>(apiClient.delete<ApiResponse<T>>(url, config));
}
