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

/*
 * v0.8.3：`CONTENT_MODULES` / `ContentModuleKey` 删掉了。
 *
 * 它曾经只服务概览页那四张计数卡（「一个主题里的四个内容模块」）。加了部署那一格
 * 之后，卡片集合不再等于「内容模块集合」—— 而那张卡片表本身就写着顺序与标签，
 * 于是这个常量只剩下「说一句已经有别处说的话」。`WORKSHOP_MODULES` 还在，它才是
 * 顶栏导航的真相。
 */

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
 * v0.8.3（docs/v0.8.3.md §13）：主题被删掉时**立刻忘掉它**。
 *
 * 这个键是「上一次在哪个工作空间」。删掉那个主题之后，键里留着的是一个已经不
 * 存在的编码 —— 而 `workshopPath()` 会拿它拼地址，于是「返回工坊」跳到
 * `/被删掉的/overview`，得到「没有编码是 xxx 的主题」。
 *
 * 只删**匹配那一个**：删 A 不该让「记住的 B」也一起没了（多标签页里，另一个
 * 标签可能正开着 B）。
 */
export function forgetThemeCode(code: string): void {
  try {
    if (window.localStorage.getItem(LAST_THEME_KEY) === code) {
      window.localStorage.removeItem(LAST_THEME_KEY);
    }
  } catch {
    /* 同上：存储不可用时什么也做不了，且不影响别的路径。 */
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
