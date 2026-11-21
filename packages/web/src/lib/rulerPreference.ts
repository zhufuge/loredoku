/** 标尺开关的 localStorage 约定：键按页面分，值只认 `visible` / `hidden`。 */
export function readRulerVisible(key: string, defaultVisible: boolean): boolean {
  if (typeof window === 'undefined') return defaultVisible;
  const stored = window.localStorage.getItem(key);
  if (stored === 'visible') return true;
  if (stored === 'hidden') return false;
  return defaultVisible;
}

export function saveRulerVisible(key: string, visible: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, visible ? 'visible' : 'hidden');
}
