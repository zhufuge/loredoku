import type { GameToolIconKind, Theme, ThemeOption } from '@loredoku/shared';
import { ApiError, apiClient, apiDelete, apiGet, apiPatch, apiPost } from './client';

/**
 * v0.8.0（docs/v0.8.0.md §7 / §19）—— 主题只提供「边界本身」的接口；内容仍然住在
 * `/assets` `/maps` `/characters` `/puzzles` 下（带 `?themeCode=`）。
 *
 * **主题的一切寻址都用编码**：`detail` / `update` / `remove` / `bundle`
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
   * v0.8.6 §4 / v0.8.7 §4 —— 主题级的「禁止符号」：本主题里**没有单独配置**的谜题
   * 读取时都用这张（谜题自己配了则覆盖）。
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

  /**
   * v0.8.7 §7 —— 主题的工具按钮图标（清除 / 撤回 / 提交），**一次一枚**、即时保存。
   *
   * 与禁止符号同一套：回执是更新后的整份主题，概览页那一屏直接换掉；点「移除」就是
   * 把那一枚从 `data.toolIcons` 里删掉（另外两枚不动）。
   */
  uploadToolIcon: (code: string, icon: GameToolIconKind, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiPost<Theme>(`/themes/${code}/tool-icons/${icon}`, form);
  },
  removeToolIcon: (code: string, icon: GameToolIconKind) =>
    apiDelete<Theme>(`/themes/${code}/tool-icons/${icon}`),

  /**
   * v0.9.2 §2 —— 长按放置参与者时那圈**计时环**的图，**即时保存**。
   *
   * 与禁止符号同一种「读取时兜底」：上传即覆盖、移除即回到内置白弧。只有一张，
   * 所以地址里没有 `:kind` 那一段。
   */
  uploadPressRing: (code: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiPost<Theme>(`/themes/${code}/press-ring`, form);
  },
  removePressRing: (code: string) => apiDelete<Theme>(`/themes/${code}/press-ring`),

  /**
   * v0.9.3 §3 —— 提交校验的两档颜色与圈图。
   *
   * 颜色走 PATCH（只带要改的那一档），圈图走上传 / 删除 —— 配色与换图是两个动作，
   * 分开之后「改一个颜色」不会把整份 `data` 覆盖一遍。
   */
  updateCheckStyle: (code: string, patch: { passColor?: string; failColor?: string }) =>
    apiPatch<Theme>(`/themes/${code}/check-style`, patch),
  uploadCheckRing: (code: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiPost<Theme>(`/themes/${code}/check-ring`, form);
  },
  removeCheckRing: (code: string) => apiDelete<Theme>(`/themes/${code}/check-ring`),
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
