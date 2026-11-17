#!/usr/bin/env node
/**
 * 把 `build:player` 的产物**覆盖**发布到站点仓库的 `loredoku/` 子目录。
 *
 * ```
 * npm run publish:player                                # 构建 + 覆盖发布到默认站点
 * npm run publish:player -- --site=D:\code\other-site   # 指定站点仓库
 * npm run publish:player -- --no-build                  # 发布现有 dist-player（不再构建）
 * npm run publish:player -- --bundle=/path/to/hlm.zip   # 临时换包（递给 build:player）
 * npm run publish:player -- --no-404                    # 不生成 loredoku/404.html
 * npm run publish:player -- --dry-run                   # 只打印计划，不动磁盘
 * ```
 *
 * 站点目录的优先级：`--site` > 环境变量 `LOREDOKU_SITE` > 仓库根 `.env` 里的
 * `LOREDOKU_SITE`（相对路径按**仓库根**解析）。
 *
 * 为什么默认值放在 `.env` 而不是「猜仓库同级」：站点仓库在
 * 哪台机器上都不一定同名、也不一定同级。早先版本按同级目录名猜，一旦有人把站点
 * clone 到别处，脚本要么报错要么（更糟）猜中一个同名的无关目录然后递归删掉它。
 * `.env` 已经是本项目放「本机配置」的地方（`LOREDOKU_BUNDLE` / `PGPASSWORD` 都在
 * 那里，且 `.env` 本身 gitignore），站点路径属于同一类东西。
 * 读 `.env` 复用 `packages/web/scripts/playerEnv.mjs` 的 `loadRootEnv()` —— 它把
 * 覆盖顺序（`.env` < `.env.local` < `.env.<mode>` < `.env.<mode>.local`）和
 * 「不写 `process.env`」的规矩都定好了，这一层不重复实现。
 *
 * 为什么要这个脚本，而不是手敲三行 PowerShell：
 *
 * 1. **覆盖**。`vite.player.config.ts` 里 `emptyOutDir: false`（本机文件系统 shim
 *    对递归删目录会失败），所以 `dist-player/` 里换包后会留着旧哈希文件。站点目录
 *    同理 —— 不先清空，旧主题的 `assets/*` 会永远留在 `loredoku/` 里。这个脚本
 *    每次发布都先删掉站点里的 `loredoku/` 再整体写入，保证「发布后目录 = 产物」。
 *    （这也是它比 `Copy-Item` 多出来的、真正需要脚本的语义。）
 *
 * 2. **深链 404**。播放器是 SPA，刷新 `/loredoku/hlm/play/xxx` 时 GitHub Pages
 *    找不到对应文件，需要一份 `404.html` 兜底（部署契约见 `docs/v0.9.0.md` §9）。
 *    GitHub Pages 只在文档里保证**站点根**的 `404.html`，子目录那份是否被服务
 *    并无官方证据 —— 所以这里只是「成了更好」：生效则深链可用，不生效与不加
 *    相同（站点根 404 兜底）。副本与 `index.html` **逐字节一致**，React Router
 *    （basename `/loredoku`）直接读 `location.pathname` 恢复路由，不需要重定向
 *    脚本。代价是深链的 HTTP 状态码仍是 404 —— 小游戏可以接受，不在本脚本范围。
 *
 * 3. **安全**。删目录之前先校验：站点必须是 git 仓库、不能指回本仓库自己 ——
 *    避免一个写错的 `--site` 把别的东西递归删掉。
 *
 * 纯函数（`parsePublishArgs` / `resolveSiteDir` / `listThemeCodes` / `countFiles` /
 * `isDirectRun`）与副作用分离，`scripts/publish-player.test.mjs` 直接单测
 * （与 `scripts/dev.mjs` 同一套约定）。
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
// 读 `.env` 的方式（覆盖顺序、不写 process.env）在播放器那边已经定好了，不重复实现。
import { loadRootEnv } from '../packages/web/scripts/playerEnv.mjs';

/** `scripts/` 上一级 = 仓库根。 */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const WEB_DIR = path.join(REPO_ROOT, 'packages', 'web');
const PLAYER_SCRIPT = path.join(WEB_DIR, 'scripts', 'player.mjs');
export const DIST_PLAYER = path.join(WEB_DIR, 'dist-player');

/** 站点里的子目录名 —— 与 `vite.player.config.ts` 的 `base: '/loredoku/'` 对应。 */
export const SITE_SUBDIR = 'loredoku';

const USAGE = [
  '用法：npm run publish:player [-- --site=<站点仓库>] [-- --no-build]',
  '                       [-- --bundle=<资源包>] [-- --no-404] [-- --dry-run]',
  '',
  '  --site=<目录>     站点仓库（默认读仓库根 .env 的 LOREDOKU_SITE）',
  '  --no-build        不构建，直接发布现有的 packages/web/dist-player/',
  '  --bundle=<路径>   临时换主题资源包（递给 build:player）',
  '  --no-404          不生成 loredoku/404.html',
  '  --dry-run         只打印计划，不写盘',
].join('\n');

/**
 * 解析命令行参数。`--flag=value` 与 `--flag value` 都收；不认识的参数直接抛错，
 * 避免把笔误（例如 `--ste`）当成「用默认值」悄悄放过去。
 * @param {string[]} argv
 * @returns {{ site: string | null, bundle: string | null, noBuild: boolean, no404: boolean, dryRun: boolean }}
 */
export function parsePublishArgs(argv) {
  const options = { site: null, bundle: null, noBuild: false, no404: false, dryRun: false };
  const needValue = (flag, next) => {
    if (next === undefined) throw new Error(`${flag} 后面要跟一个值`);
    return next;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg.startsWith('--site=')) options.site = arg.slice('--site='.length) || null;
    else if (arg === '--site') options.site = needValue('--site', next), (i += 1);
    else if (arg.startsWith('--bundle=')) options.bundle = arg.slice('--bundle='.length) || null;
    else if (arg === '--bundle') options.bundle = needValue('--bundle', next), (i += 1);
    else if (arg === '--no-build') options.noBuild = true;
    else if (arg === '--no-404') options.no404 = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      throw new Error(`不认识的参数：${arg}\n\n${USAGE}`);
    }
  }
  return options;
}

/**
 * 把站点目录解析成绝对路径并做删除前的校验。
 *
 * 取值顺序：`--site` > 显式环境变量 `LOREDOKU_SITE` > `.env` 里的 `LOREDOKU_SITE`。
 * `.env` 那一路由 `loadRootEnv()` 读（`.env` < `.env.local` < `.env.production` …
 * 的覆盖顺序与 Vite 一致，且**不写 `process.env`**）。
 *
 * 「显式环境变量」与「`.env` 里的同名键」在这里是两件事：前者是这一次命令的
 * 临时覆盖，后者是这台机器的默认配置。`loadRootEnv` 只读文件，所以两者不会
 * 互相污染。
 *
 * 校验内容（都是为「下一步要递归删掉 `<site>/loredoku/`」服务的）：
 * 1. 目录必须存在；
 * 2. 必须是 git 仓库（`.git`）—— 挡住指到 `D:\code` 这类目录的笔误；
 * 3. 不能指回本仓库自己。
 * @param {{
 *   site: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   repoRoot?: string,
 *   io?: { exists?: (p: string) => boolean },
 *   dotenv?: Record<string, string> | null,
 * }} input
 * @returns {{ siteDir: string, targetDir: string }}
 */
export function resolveSiteDir({
  site,
  env = process.env,
  repoRoot = REPO_ROOT,
  io = {},
  dotenv,
}) {
  const exists = io.exists ?? existsSync;

  // `dotenv` 可注入：单测因此不必真的去碰仓库根那份 `.env`。
  const fromFile = dotenv === undefined ? loadRootEnv('production', repoRoot) : (dotenv ?? {});

  let candidate = site ?? env.LOREDOKU_SITE ?? fromFile.LOREDOKU_SITE ?? null;
  const source = site
    ? '--site'
    : env.LOREDOKU_SITE
      ? '环境变量 LOREDOKU_SITE'
      : '仓库根 .env 的 LOREDOKU_SITE';

  if (!candidate) {
    throw new Error(
      [
        '没有找到站点仓库。四种方式任选其一：',
        '',
        '  1. 在仓库根 .env 里写一行（推荐，长期有效）：',
        '       LOREDOKU_SITE=../<站点仓库目录名>',
        '     相对路径按**仓库根**解析，所以 `../<站点仓库目录名>` 与仓库同级；',
        '     也可以写绝对路径。',
        '  2. npm run publish:player -- --site=D:/path/to/site-repo',
        '  3. $env:LOREDOKU_SITE="D:/path/to/site-repo"; npm run publish:player',
        '  4. 参考 .env.example 里 LOREDOKU_SITE 那几行。',
      ].join('\n'),
    );
  }

  // **相对路径按仓库根解析**，不是 cwd：`.env` 就放在仓库根，写 `../<站点目录>`
  // 的人心里想的是「与仓库同级」。命令行给的相对路径也用同一套规则 —— 两条来源
  // 解释不同会让同一行配置在不同 cwd 下指向不同目录。
  const resolved = path.isAbsolute(candidate)
    ? path.normalize(candidate)
    : path.resolve(repoRoot, candidate);

  if (!exists(resolved)) {
    throw new Error(
      `站点仓库不存在（来自 ${source}）：${resolved}\n` +
        (path.isAbsolute(candidate)
          ? ''
          : `相对路径按仓库根（${repoRoot}）解析；想按当前目录解析用绝对路径。`),
    );
  }
  if (!exists(path.join(resolved, '.git'))) {
    throw new Error(`${resolved} 不是一个 git 仓库（没有 .git），发布前会清空它的 ${SITE_SUBDIR}/ 子目录，不能冒险。`);
  }
  if (
    resolved === repoRoot ||
    resolved.startsWith(repoRoot + path.sep) ||
    repoRoot.startsWith(resolved + path.sep)
  ) {
    throw new Error(`站点仓库不能是本仓库自己或其父子目录：${resolved}`);
  }
  return { siteDir: resolved, targetDir: path.join(resolved, SITE_SUBDIR) };
}

/**
 * 产物里烤了哪些主题：`<dist>/<code>/manifest.json` 的一级子目录。
 * 一个产物只装一个主题（见 `docs/v0.9.0.md` §8/§9）。
 * @param {string} distDir
 * @returns {string[]}
 */
export function listThemeCodes(distDir) {
  if (!existsSync(distDir)) return [];
  return readdirSync(distDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(path.join(distDir, entry.name, 'manifest.json')),
    )
    .map((entry) => entry.name);
}

/**
 * 递归数一个目录下的普通文件数（发布后用来和源产物对账）。
 * @param {string} dir
 * @returns {number}
 */
export function countFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) total += countFiles(child);
    else if (entry.isFile()) total += 1;
  }
  return total;
}

/** 删掉一棵目录；不存在就当无事发生（重试几次，应付 Windows 上的瞬时占用）。 */
function removeTree(target) {
  if (!existsSync(target)) return;
  rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
}

/**
 * 把构建委托给已有的 `scripts/player.mjs`（包路径、env 那套逻辑不在这一层重复）。
 *
 * **`NODE_ENV` 必须钉成 `production`**：这个脚本要发布的是生产产物，而父进程的环境
 * 可能是任何人留下的 —— 最典型的是从 vitest 里跑（它会设 `NODE_ENV=test`），
 * `spawnSync` 原样继承下去，Vite 就按「非 production」解析 React 的条件导出，
 * 打出 **development 版 React**（实测 `vendor-react` 从 205 KB 涨到 416 KB，
 * 文件里能搜到 `react-dom.development`）。正常 `npm run build:player` 不会有这个
 * 问题，因为它前面没有 vitest；但一个发布脚本不能把正确性押在「谁调的」上面。
 *
 * 注意这**不是** `playerEnv.mjs` 里那个坑：那里拒绝的是把 `.env` 的 `NODE_ENV`
 * 灌进 `process.env`（会污染 Vite 的 `VITE_USER_NODE_ENV`）。这里恰好相反 ——
 * 显式给子进程一个确定的 `NODE_ENV`，不读任何 `.env` 的值。
 */
function runBuild(bundle) {
  const args = [PLAYER_SCRIPT, 'build'];
  if (bundle) args.push(`--bundle=${bundle}`);
  const result = spawnSync(process.execPath, args, {
    cwd: WEB_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`build:player 失败（退出码 ${result.status}），发布中止。`);
  }
}

async function main() {
  const options = parsePublishArgs(process.argv.slice(2));
  const { siteDir, targetDir } = resolveSiteDir({ site: options.site });

  console.log(`站点仓库：${siteDir}`);
  console.log(`发布目标：${targetDir}`);
  console.log(`构建：${options.noBuild ? '跳过（发布现有产物）' : '先 build:player'}`);
  console.log(`深链 404：${options.no404 ? '不生成' : '复制 index.html 为 404.html'}`);
  if (options.dryRun) console.log('（--dry-run：只打印，不动磁盘）');

  if (!options.noBuild) {
    console.log('\n[1/4] 清空旧的 packages/web/dist-player/ 并重新构建 ……');
    if (!options.dryRun) {
      removeTree(DIST_PLAYER);
      runBuild(options.bundle);
    }
  }

  /** @type {string} 产物里的主题，用于打印摘要。 */
  const themes = listThemeCodes(DIST_PLAYER);
  if (!existsSync(path.join(DIST_PLAYER, 'index.html')) || themes.length === 0) {
    throw new Error(
      [
        `${DIST_PLAYER} 里没有可发布的产物（缺 index.html 或主题目录）。`,
        options.noBuild
          ? '先跑一次 npm run build:player，或去掉 --no-build 让本脚本自己构建。'
          : '构建似乎没有产出，请检查上面的构建输出。',
      ].join('\n'),
    );
  }

  const sourceCount = countFiles(DIST_PLAYER) + (options.no404 ? 0 : 1);

  if (options.dryRun) {
    console.log(`\n[dry-run] 将清空并重写 ${targetDir}（${sourceCount} 个文件）`);
    console.log(`[dry-run] 主题：${themes.join(', ')}`);
    return;
  }

  console.log(`\n[2/4] 清空站点里的 ${SITE_SUBDIR}/ ……`);
  removeTree(targetDir);

  console.log('[3/4] 复制产物 ……');
  cpSync(DIST_PLAYER, targetDir, { recursive: true, force: true });

  if (!options.no404) {
    copyFileSync(path.join(targetDir, 'index.html'), path.join(targetDir, '404.html'));
  }

  const targetCount = countFiles(targetDir);
  console.log(`[4/4] 对账：源 ${sourceCount} 个文件，目标 ${targetCount} 个${
    targetCount === sourceCount ? ' —— 一致' : ' —— 数量不一致，请检查'
  }`);

  // 站点目录名恰好是 GitHub 用户站点的域名时顺手给个预览地址；否则只报目录，
  // 不猜托管方式（脚本本身不假设站点跑在哪个 host 上）。
  const siteName = path.basename(siteDir);
  const preview = /\.github\.io$/i.test(siteName)
    ? `；预览 https://${siteName}/${SITE_SUBDIR}/`
    : '';
  console.log(`\n完成。主题：${themes.join(', ')}${preview}`);
  console.log(`站点仓库里的改动尚未提交，确认无误后：git -C ${siteDir} add ${SITE_SUBDIR} && git -C ${siteDir} commit && git -C ${siteDir} push`);
}

/**
 * **只有被直接执行时才发布**。
 *
 * 这一层不是为了好看：`scripts/publish-player.test.mjs` 会 import 本模块拿纯函数，
 * 而一次 import 就足以让无条件的 `main()` 真的去构建、真的去**删掉并覆盖**站点里的
 * `loredoku/`（写这个文件时就发生过一次）。测试导入模块不该有副作用。
 *
 * 不用 `import.meta.main`：它在 Node 22.18/24 才有，而 `package.json` 承诺 `>=20`。
 * @returns {boolean}
 */
export function isDirectRun(argv1 = process.argv[1], moduleUrl = import.meta.url) {
  if (!argv1) return false;
  const self = fileURLToPath(moduleUrl);
  // Windows 上同一个路径可能大小写不同（`D:\code` vs `d:\code`）。
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(argv1) === normalize(self);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(`\n发布失败：${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
