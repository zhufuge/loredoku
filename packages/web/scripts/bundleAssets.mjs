/**
 * v0.9.0（docs/v0.9.0.md §8）—— 把主题资源包**烤进播放器产物**的 vite 插件。
 *
 * 两种模式共用同一个「包在哪」的答案：
 *
 * - `build`：`generateBundle` 阶段把包里的每个文件 `emitFile` 成 `<code>/<路径>`，
 *   于是 `dist-player/` 拷走就能跑，运行时不碰任何外部目录；
 * - `dev`：`configureServer` 挂一段中间件，把 `<base><code>/<路径>` 直接从内存里
 *   递出去 —— 与产物里**同一个 URL 形状**，所以「dev 能跑、build 404」这种错不会出现。
 *
 * 顺带做 SPA fallback：`/loredoku/hlm/play` 在磁盘上没有对应文件，dev server 默认
 * 会 404。这里把「看起来像页面」的请求改写成 `player.html`，与产物部署时那条
 * rewrite 规则一一对应（见 §9 的部署说明）。
 */
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { readBundle } from './readBundle.mjs';

/**
 * 2026-11-09 补（docs/v0.9.0.md §14）：「包在哪」的解析已经收进
 * `scripts/playerEnv.mjs`（`--bundle > 环境变量 > .env`），由 `vite.player.config.ts`
 * 算好之后当参数传进来。这个文件只管**拿到包之后**怎么烤 / 怎么递。
 */

const MIME = new Map([
  ['.json', 'application/json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function mimeOf(relPath) {
  const dot = relPath.lastIndexOf('.');
  return (dot >= 0 ? MIME.get(relPath.slice(dot).toLowerCase()) : null) ?? 'application/octet-stream';
}

export function bundleAssets(bundlePath) {
  let loaded = null;

  /** 真正要用包的时候才读；`vite preview` 全程用不到（包已在 dist 里）。 */
  const load = () => {
    if (!bundlePath) {
      throw new Error(
        '没有指定主题资源包：在仓库根 .env 里写 LOREDOKU_BUNDLE=<路径>，或用 --bundle=<路径> 临时覆盖。',
      );
    }
    if (!loaded) loaded = readBundle(bundlePath);
    return loaded;
  };

  /** `config` 钩子跑在 preview 里，所以它不能因为「没有包」而炸。 */
  const peek = () => (bundlePath ? load() : null);

  let outDir = null;

  return {
    name: 'loredoku:bundle-assets',

    /**
     * 主题编码要在**模块求值之前**就位（`bundleCode.ts` 顶层读它），所以放在
     * `config` 钩子里 `define` —— 放 `generateBundle` 就晚了。
     */
    config() {
      const bundle = peek();
      return {
        define: {
          __PLAYER_BUNDLE_CODE__: JSON.stringify(bundle?.code ?? ''),
        },
      };
    },

    buildStart() {
      const { code, manifest } = load();
      this.info(
        `资源包：${code}（${manifest.theme.name}）· ${manifest.games.length} 关 · 导出于 ${manifest.exportedAt}`,
      );
    },

    generateBundle() {
      const { code, files } = load();
      for (const [relPath, data] of files) {
        this.emitFile({ type: 'asset', fileName: `${code}/${relPath}`, source: data });
      }
    },

    configResolved(config) {
      outDir = config.build.outDir;
    },

    /**
     * Vite 按**源文件名**输出入口 HTML，所以产物里是 `player.html`；而部署之后
     * 访问的是 `/loredoku/` —— 静态服务器（含 `vite preview`）只认 `index.html`。
     * 改名比「把入口文件就叫 index.html」干净：那个名字会让工坊与播放器两份入口
     * 在同名文件上打架，`tsc` / IDE 里也难看出哪个是哪个。
     */
    closeBundle() {
      if (!outDir) return;
      const from = path.join(outDir, 'player.html');
      const to = path.join(outDir, 'index.html');
      if (existsSync(from)) renameSync(from, to);
    },

    configureServer(server) {
      const { code, files } = load();
      const base = server.config.base;
      const prefix = `${base}${code}/`;
      const pageUrl = `${base}player.html`;

      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith(base)) return next();

        // ① 包文件：`/loredoku/hlm/manifest.json` 这类，直接从内存里递。
        if (url.startsWith(prefix)) {
          const relPath = decodeURIComponent(url.slice(prefix.length));
          const data = files.get(relPath);
          if (data) {
            res.setHeader('Content-Type', mimeOf(relPath));
            res.setHeader('Cache-Control', 'no-store');
            res.end(data);
            return undefined;
          }
          /**
           * 不是包文件就继续往下走 —— **别直接 `next()`**。
           *
           * `/loredoku/hlm/play` 也以 `/loredoku/hlm/` 开头，如果这里一走了之，
           * 它会落到 vite 的 SPA fallback，拿到**工坊**的 `index.html`
           * （实测：dev 里进关卡页会渲染成工坊的「正在加载工作台…」，
           * 还会顺手打出十个 `/api` 请求）。包文件与页面路由只能靠「文件在不在」区分。
           */
        }

        // ② 页面请求：没有扩展名、也不要 `/@vite/` `/src/` 这类，就当成路由。
        const looksLikePage =
          !/\.[a-z0-9]+$/i.test(url) && !url.startsWith(`${base}@`) && !url.includes('/src/');
        if (looksLikePage) {
          req.url = pageUrl;
        }
        return next();
      });
    },
  };
}
