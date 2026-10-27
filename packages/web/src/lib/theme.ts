/**
 * 日夜主题的外部状态源。
 *
 * 三态而非两态 —— 用户说「默认按照系统主题」，所以 `system` 是一个**稳定状态**
 * 而不是只在首次访问时读一次的初始值：用户在操作系统里切换外观时，`system`
 * 模式下的页面要跟着变（否则「跟随系统」只跟随了第一次）。
 *
 * 这里刻意不放进 zustand：状态只被少数几个按钮和一个 toast 容器读取，且
 * **首屏必须在 React 挂载之前就上色**（index.html 的内联脚本负责），所以真正的
 * 真源是 DOM 的 `class="dark"` + `localStorage`，React 只是订阅者。
 * 用 `useSyncExternalStore` 订阅这份外部状态，见 `hooks/useTheme.ts`。
 */

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** 与 index.html 内联脚本里的键必须一致（`theme.test.ts` 钉住这一条）。 */
export const THEME_STORAGE_KEY = 'loredoku.theme';
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/**
 * 换主题时的过渡窗口（v0.7.10）。
 *
 * 用**属性**而不是类：`<html>` 的 `class` 只有 `dark` 这一个语义（index.html 的
 * 内联脚本靠它上色，`theme.test.ts` 也钉着「className 只可能是 dark / 空」）。
 * 再塞一个临时类进去，等于让一个瞬时状态混进那份契约里。
 *
 * 数值必须与 `index.css` 的 `--motion-base`（180ms）一致：CSS 那边读的是变量，
 * 但摘属性的定时器只能写在 JS 里。
 */
export const THEME_TRANSITION_ATTRIBUTE = 'data-theme-transition';
const THEME_TRANSITION_MS = 180;
/** 多留一点余量，免得最后一帧被打断。 */
const THEME_TRANSITION_SLACK_MS = 60;

/** 循环顺序：浅色 → 深色 → 跟随系统 → 浅色。 */
const CYCLE: readonly ThemeMode[] = ['light', 'dark', 'system'];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const index = CYCLE.indexOf(mode);
  return CYCLE[(index + 1) % CYCLE.length] ?? 'system';
}

/**
 * 读不到、值非法、localStorage 被拒（Safari 无痕、同源策略）一律回退 `system`：
 * 坏数据不该让页面变成「永远浅色」。
 */
export function readStoredTheme(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}

/**
 * 写 DOM。两件事缺一不可：
 *   1. `.dark` 类 —— Tailwind 的 `darkMode: ['class']` 靠它选变量组；
 *   2. `color-scheme` —— 让滚动条、`<input>`、日期选择器这些**原生控件**跟着
 *      变，否则深色页面里会拖出一条亮白滚动条。
 */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

let transitionTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 带过渡窗口的换主题（v0.7.10）。
 *
 * 只给**整站换色**这一件事加过程：点按钮、系统外观变化、另一个标签页改了。
 * 首屏不挂窗口 —— `applyTheme` 保持原样，因为首屏没有「上一个颜色」可过渡，
 * 挂上去只会让页面在加载时先淡一遍。
 *
 * 顺序不能反：先开窗口（把 `transition` 规则放进「变更后样式」），再改变量。
 * 反过来就是硬切完了才开始计时，什么都不会发生。
 */
export function applyThemeTransitioned(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.setAttribute(THEME_TRANSITION_ATTRIBUTE, '');
  applyTheme(resolved);
  if (transitionTimer !== null) clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => {
    root.removeAttribute(THEME_TRANSITION_ATTRIBUTE);
    transitionTimer = null;
  }, THEME_TRANSITION_MS + THEME_TRANSITION_SLACK_MS);
}

type Listener = () => void;

const listeners = new Set<Listener>();
let listening = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function currentResolved(): ResolvedTheme {
  return resolveTheme(readStoredTheme(), systemPrefersDark());
}

/** 系统外观变化：只有 `system` 模式才跟，手动选定的浅/深色不被系统推翻。 */
function handleSystemChange(): void {
  if (readStoredTheme() !== 'system') return;
  applyThemeTransitioned(resolveTheme('system', systemPrefersDark()));
  notify();
}

/** 另一个标签页改了主题：跟它保持一致（localStorage 写入不会在**本页**触发此事件）。 */
function handleStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
  applyThemeTransitioned(currentResolved());
  notify();
}

function ensureListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('storage', handleStorage);
  if (typeof window.matchMedia === 'function') {
    window.matchMedia(DARK_MEDIA_QUERY).addEventListener('change', handleSystemChange);
  }
}

export function subscribeTheme(listener: Listener): () => void {
  ensureListening();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `useSyncExternalStore` 的快照：字符串/布尔原生值，比较稳定。 */
export function getThemeMode(): ThemeMode {
  return readStoredTheme();
}

export function getSystemDark(): boolean {
  return systemPrefersDark();
}

/**
 * 写 localStorage 并**立刻**应用 —— 不等 React 重渲染，点击到上色之间没有空档。
 * 存储失败时也照样生效，只是下次访问会回到「跟随系统」。
 */
export function setThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // 存不进去不影响本次生效。
  }
  applyThemeTransitioned(resolveTheme(mode, systemPrefersDark()));
  notify();
}
