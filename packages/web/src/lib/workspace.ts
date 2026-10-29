/**
 * v0.8.0 §18：主题 = **工作空间**（不是第五种内容）。地址是第一公民 ——
 *
 * ```
 * /hlm/maps      红楼梦 · 地图
 * /hlm/overview  红楼梦 · 概览（这个空间自己的那页）
 * /settings/themes   系统配置 · 主题列表
 * ```
 *
 * 上一版把主题做成每页顶上的一条「作用域横条」：选中的主题存在 `localStorage`，
 * URL 里没有它。那等于说「你在哪个世界」是一件**私人的、不可分享的**偏好，可它
 * 明明决定了整屏内容 —— 换一台机器打开 `/maps` 会看到另一批地图，把链接发给别人
 * 也一样。这一版把主题放进路径：看得见、存得下、发得出去，且刷新/前进后退都对。
 *
 * 旧的 `/maps`（没有主题那一段）仍然能用：它们会被重定向到这个装置记住的最后
 * 一个主题（见 `lastThemeCode`），不至于让书签 404。
 */

export const WORKSHOP_MODULES = [
  { key: 'overview', label: '概览' },
  { key: 'assets', label: '资源' },
  { key: 'maps', label: '地图' },
  { key: 'characters', label: '角色' },
  { key: 'puzzles', label: '谜题' },
  { key: 'deployments', label: '部署' },
] as const;

export type ModuleKey = (typeof WORKSHOP_MODULES)[number]['key'];

/** 一个主题里的四个内容模块 —— 计数卡片、概览页的链接都按这个顺序。 */
export const CONTENT_MODULES = ['assets', 'maps', 'characters', 'puzzles'] as const;
export type ContentModuleKey = (typeof CONTENT_MODULES)[number];

export const SETTINGS_THEMES_PATH = '/settings/themes';

/**
 * 记住最后一个工作空间。键是 `loredoku.lastTheme`，**不是** `loredoku.theme` ——
 * 后者是日夜模式的（`lib/theme.ts` 的 `THEME_STORAGE_KEY`）。v0.8.1 之前两个键
 * 撞在一起：这里把主题编码写进去，日夜模式读到 `hlm` 这种非法值就回退
 * 「跟随系统」，于是「在设置里改成日间、回到工坊又变回夜间」。
 */
const LAST_THEME_KEY = 'loredoku.lastTheme';

export function readLastThemeCode(): string | null {
  try {
    return window.localStorage.getItem(LAST_THEME_KEY);
  } catch {
    // 隐私模式 / 禁用存储：当成「没记过」，由调用方落到默认主题。
    return null;
  }
}

export function rememberThemeCode(code: string): void {
  try {
    window.localStorage.setItem(LAST_THEME_KEY, code);
  } catch {
    /* 记不住就算了 —— 它只影响旧地址的兜底，不该让导航报错。 */
  }
}

/**
 * 某个模块的地址。给了 `code` 就用它，否则用记住的那个。
 *
 * 没有主题可依时回落 `/`（由 `RootRedirect` 再挑一次）—— 宁可多一跳，也不要
 * 编一个不存在的编码出来。
 */
export function workshopPath(module: ModuleKey, code?: string | null): string {
  const target = code ?? readLastThemeCode();
  return target ? `/${encodeURIComponent(target)}/${module}` : '/';
}

/**
 * 工作空间里拼一条**整屏页**（编辑器 / 预览）的地址。`code` 缺席（单测、
 * 没有上下文的渲染）时退回不带主题段的旧地址 —— 路由表里的重定向会把它
 * 落回记住的工作空间，链接仍然能用。
 */
export function fullscreenPath(code: string | null | undefined, kind: 'maps' | 'puzzles', id: number | string, action: 'edit' | 'view', query = ''): string {
  const suffix = query.length > 0 ? `?${query}` : '';
  return code ? `/${code}/${kind}/${id}/${action}${suffix}` : `/${kind}/${id}/${action}${suffix}`;
}
