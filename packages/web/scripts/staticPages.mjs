/**
 * v0.11.1（docs/v0.11.1.md）—— 把播放器产物从「一个 SPA 入口」摊成**每个路由一份真 HTML**。
 *
 * 为什么要这么做：纯静态托管（GitHub Pages 一类）不会把 `/loredoku/hlm/play/xxx`
 * 重写成 `index.html` —— 官方文档只保证**站点根**的 `404.html` 生效，子目录那份
 * 没有权威保证。于是刷新深链就掉到 404，只能靠一份 404 兜底页碰运气（状态码还是
 * 404）。而「有哪些地址」在构建时其实完全已知：一个产物只装一个主题，关卡清单就是
 * `manifest.games`。既然如此，每个地址直接产出一份 `index.html`，部署后每个 URL
 * 都是真实存在的文件，不需要任何 rewrite 规则。
 *
 * 这些页面**仍然是浏览器渲染**：内容就是同一份入口 HTML（资源是绝对路径
 * `/loredoku/assets/…`，所以放在任意深度都成立），只是地址变成真文件，顺带能把标题
 * 写进 HTML —— 分享链接、或者 JS 还没跑起来时，也能看到这是哪一关。
 *
 * 纯函数放这里（`playerPages` / `withTitle`），由 `bundleAssets.mjs` 的 `closeBundle`
 * 落盘，`staticPages.test.mjs` 直接单测。
 */

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

/**
 * 换掉页面标题。没有 `<title>` 就往 `<head>` 里补一个（正常情况下入口 HTML 一定有，
 * 这一条是给「有人改了 player.html」兜底）。
 * @param {string} html
 * @param {string} title
 * @returns {string}
 */
export function withTitle(html, title) {
  const tag = `<title>${escapeHtml(title)}</title>`;
  if (TITLE_RE.test(html)) return html.replace(TITLE_RE, tag);
  return html.replace(/<head[^>]*>/i, (head) => `${head}\n    ${tag}`);
}

/**
 * 关卡 key 要同时当**目录名**与 **URL 的一段**，所以只收安全字符。
 *
 * 不收 `/`、`\`：那会让「目录名」跑到别的地方去（包里的 key 是作者配置的值，
 * 不是我们生成的）。也不收 `?` / `#` / 空格这类需要 URL 转义的字符 —— 免得出
 * 现「目录名是 `a%20b`、请求解出来是 `a b`」这种对不上的情况。老包的 key 形如
 * `puzzle-hlm-sishan`，全都在这个范围里。
 *
 * `.` 与 `..` 单独挡：它们由点组成、能过下面这条正则，但当目录名意味着「当前」/「上一级」。
 */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

function assertSafeSegment(value, what) {
  // `.` / `..` 在文件系统里是「当前目录」/「上一级」，path.join 会照做。
  if (!SAFE_KEY.test(value ?? '') || value === '.' || value === '..') {
    throw new Error(`${what}不能当目录名：${String(value)}（只收字母、数字、点、下划线、连字符，且不能是 . 或 ..）`);
  }
}

/**
 * 播放器的路由清单 → 产物里要生成的页面目录（相对 outDir，不带末尾的 `index.html`）。
 *
 * 路由见 `src/player/router.tsx`：
 *
 * ```
 * /:code/play            列表页   → <code>/play/
 * /:code/play/:key       一关     → <code>/play/<key>/
 * ```
 *
 * 根地址 `/` 不在这里：它已经是产物自带的 `index.html`（`player.html` 改名而来），
 * 页面里那条 `<Navigate>` 会把人送到列表页。
 *
 * @param {{ code: string, themeName: string, games: readonly { key: string, name: string }[] }} input
 * @returns {{ dir: string, title: string }[]}
 */
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
