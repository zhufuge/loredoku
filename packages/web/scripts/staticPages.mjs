/** v0.11.1（docs/v0.11.1.md）：纯静态托管不会重写深链，构建期为每个路由产出真 HTML（同一份入口，浏览器渲染）。
 *  纯函数由 `bundleAssets.mjs` 的 `closeBundle` 落盘，`staticPages.test.mjs` 直接单测。 */

/** `<title>…</title>`，跨行也算 —— Vite 处理过的 HTML 会重排缩进。 */
const TITLE_RE = /<title>[\s\S]*?<\/title>/i;

/** 写进 HTML 之前先转义：标题来自包里的 `theme.name` / `game.name`，是作者填的自由文本。 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 换掉页面标题；没有 `<title>` 就往 `<head>` 里补一个（给有人改了 player.html 兜底）。 */
export function withTitle(html, title) {
  const tag = `<title>${escapeHtml(title)}</title>`;
  if (TITLE_RE.test(html)) return html.replace(TITLE_RE, tag);
  return html.replace(/<head[^>]*>/i, (head) => `${head}\n    ${tag}`);
}

/** 关卡 key 同时当目录名与 URL 段，只收 `[A-Za-z0-9._-]`；不收 `/`、`\`、`?`、`#`、空格（目录名与 URL 解码会对不上）。
 *  `.` / `..` 另挡 —— 当目录名会指向当前/上一级。 */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

function assertSafeSegment(value, what) {
  // `.` / `..` 在文件系统里是「当前目录」/「上一级」，path.join 会照做。
  if (!SAFE_KEY.test(value ?? '') || value === '.' || value === '..') {
    throw new Error(`${what}不能当目录名：${String(value)}（只收字母、数字、点、下划线、连字符，且不能是 . 或 ..）`);
  }
}

/** 路由清单 → 产物页面目录（相对 outDir，不含末尾 `index.html`）：列表 `code/play`、关卡 `code/play/<key>`。
 *  根 `/` 不在这里 —— 已由 `player.html` 改名来的 `index.html` 承接。 */
export function playerPages({ code, themeName, games }) {
  if (!code) throw new Error('生成静态页需要主题编码（manifest.theme.code），拿到的是空值');
  assertSafeSegment(code, '主题编码');

  /** @type {{ dir: string, title: string }[]} */
  const pages = [{ dir: `${code}/play`, title: `${themeName} · 格物` }];
  const seen = new Set();
  for (const game of games) {
    assertSafeSegment(game.key, '关卡 key');
    // 清单里重复的 key 只会产出同一个文件，但那是包的错，不该静默吞掉。
    if (seen.has(game.key)) throw new Error(`manifest.games 里关卡 key 重复：${game.key}`);
    seen.add(game.key);
    pages.push({ dir: `${code}/play/${game.key}`, title: `${game.name} · 格物` });
  }
  return pages;
}
