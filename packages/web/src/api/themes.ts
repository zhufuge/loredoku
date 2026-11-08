import type {
  Theme,
  ThemeDeploymentSummary,
  ThemeOption,
} from '@loredoku/shared';
import { ApiError, apiClient, apiDelete, apiGet, apiPatch, apiPost } from './client';

/**
 * v0.8.0（docs/v0.8.0.md §7 / §19）—— 主题只提供「边界本身」的接口；内容仍然住在
 * `/assets` `/maps` `/characters` `/puzzles` 下（带 `?themeCode=`）。
 *
 * **主题的一切寻址都用编码**：`detail` / `update` / `remove` / `deploy` / `bundle`
 * 都收 `code`。理由与地址里那一段相同 —— `code` 才是能进 URL、进 manifest、
 * 将来能拿去对账的那个字符串；数字主键只在服务端内部流通。
 *
 * 没有 `move`：`theme_id` 建行后不可改（§8 护栏 2），换主题只能新建。
 */
export interface CreateThemePayload {
  code: string;
  name: string;
  description?: string | null;
}

export interface UpdateThemePayload {
  name?: string;
  description?: string | null;
  data?: Record<string, unknown>;
}

export interface DeployThemePayload {
  slug: string;
  name?: string;
  description?: string | null;
  puzzleIds?: number[];
}

export const themesApi = {
  /** `light` 只回 code / name —— 切换器与新建对话框用不到计数。 */
  list: (light = false) =>
    apiGet<Theme[] | ThemeOption[]>(`/themes${light ? '?light=true' : ''}`),
  options: () => apiGet<ThemeOption[]>('/themes?light=true'),
  detail: (code: string) => apiGet<Theme>(`/themes/${code}`),
  create: (payload: CreateThemePayload) => apiPost<Theme>('/themes', payload),
  update: (code: string, payload: UpdateThemePayload) =>
    apiPatch<Theme>(`/themes/${code}`, payload),
  remove: (code: string) => apiDelete<null>(`/themes/${code}`),

  /**
   * v0.8.6 §4 —— 主题级的「禁止符号」缺省。
   *
   * 与其它 `data` 修改不同，这两个端点**即时保存**：上传 / 移除当场写进 `themes.data`
   * 并回更新后的整份主题，概览页因此不需要「保存」。图落在 `storage/uploads` 下，
   * `data.forbiddenSymbol.path` 只记相对路径（渲染时 `fileUrlFromPath` 拼地址）。
   */
  uploadForbiddenSymbol: (code: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiPost<Theme>(`/themes/${code}/forbidden-symbol`, form);
  },
  removeForbiddenSymbol: (code: string) =>
    apiDelete<Theme>(`/themes/${code}/forbidden-symbol`),

  // ---- 合辑 ----
  deployments: () => apiGet<ThemeDeploymentSummary[]>('/theme-deployments'),
  deploymentBySlug: (slug: string) =>
    apiGet<ThemeDeploymentSummary>(`/theme-deployments/by-slug/${slug}`),
  deploy: (code: string, payload: DeployThemePayload) =>
    apiPost<ThemeDeploymentSummary>(`/themes/${code}/deploy`, payload),
  removeDeployment: (id: number) => apiDelete<null>(`/theme-deployments/${id}`),
};

/**
 * v0.8.0（§11.6）：导出资源包。这个接口回的是 zip 本体，不走 `unwrap`
 * —— 它的成功响应不是 `ApiResponse`，失败响应才是。所以失败时要把 blob
 * 读回文本再解析一次，否则作者只会看到「下载失败」而不知道是「先至少上线一关」。
 */
export async function downloadThemeBundle(
  code: string,
): Promise<{ blob: Blob; filename: string }> {
  try {
    const response = await apiClient.get(`/themes/${code}/bundle`, { responseType: 'blob' });
    return {
      blob: response.data as Blob,
      filename: filenameOf(response.headers['content-disposition']) ?? `${code}-bundle.zip`,
    };
  } catch (error) {
    const body = (error as { response?: { data?: unknown } }).response?.data;
    if (body instanceof Blob) {
      const text = await body.text();
      try {
        const parsed = JSON.parse(text) as { code?: number; message?: string; data?: unknown };
        throw new ApiError(parsed.code ?? -1, parsed.message ?? '导出失败', parsed.data);
      } catch (parseError) {
        if (parseError instanceof ApiError) throw parseError;
        throw new ApiError(-1, '导出失败');
      }
    }
    throw error;
  }
}

function filenameOf(disposition: unknown): string | null {
  if (typeof disposition !== 'string') return null;
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return match?.[1] ?? null;
}

/** 把 blob 存成文件。用临时 `<a>` 而不是 `window.open`：后者会被弹窗拦截。 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 立刻 revoke 在 Safari 上会打断下载，给它一点时间。
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
