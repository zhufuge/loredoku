#!/usr/bin/env node
/**
 * v0.9.0（docs/v0.9.0.md §8）—— 播放器的 dev / build / preview 包装。
 *
 * 为什么不让 `package.json` 直接调 `vite`：vite 的 CLI 用 cac，**未知选项直接报错**
 * （实测 `--bundle=…` 会抛 `CACError: Unknown option`）。这一层把 `--bundle` 摘出来，
 * 剩下的参数原样递给 vite（`--host`、`--port`、`--mode` 都还能用）。
 *
 * 2026-11-09 补（§14）：**默认包路径改放在仓库根的 `.env`**，所以最常用的一条命令
 * 现在不带任何参数：
 *
 * ```
 * npm run dev:player                                 # 用 .env 里的默认包
 * npm run build:player                               # 同上
 * npm run build:player -- --bundle=/path/to/hlm.zip  # 临时换一个包，不改 .env
 * LOREDOKU_BUNDLE=/path/to/hlm.zip npm run build:player
 * npm run preview:player                             # 不需要包（产物里已经烤好了）
 * ```
 *
 * 优先级 `--bundle > 显式环境变量 > .env` 由 `scripts/playerEnv.mjs` 统一回答。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, resolveBundlePath, viteModeOf } from './playerEnv.mjs';

const [command, ...rest] = process.argv.slice(2);
if (!command) {
  console.error('用法：node scripts/player.mjs <dev|build|preview> [--bundle=<路径>] [vite 参数…]');
  process.exit(2);
}

/** `--bundle=x`、`--bundle x` 两种都收；其余参数原样递给 vite。 */
let cliBundle = null;
let sawBundleFlag = false;
const passthrough = [];
for (let i = 0; i < rest.length; i += 1) {
  const arg = rest[i];
  if (arg.startsWith('--bundle=')) {
    sawBundleFlag = true;
    cliBundle = arg.slice('--bundle='.length) || null;
  } else if (arg === '--bundle') {
    sawBundleFlag = true;
    cliBundle = rest[i + 1] ?? null;
    i += 1;
  } else {
    passthrough.push(arg);
  }
}
if (sawBundleFlag && cliBundle === null) {
  console.error('--bundle 后面要跟一个路径');
  process.exit(2);
}

/**
 * `.env` / 显式环境变量里那条。`argv` 传空数组：命令行那一路已经在上面单独处理了，
 * 这里只回答「不敲 --bundle 时用哪个」。
 */
const configured = resolveBundlePath({
  argv: [],
  env: process.env,
  mode: viteModeOf(command),
});
const source = cliBundle !== null
  ? '--bundle'
  : process.env.LOREDOKU_BUNDLE
    ? '环境变量 LOREDOKU_BUNDLE'
    : '.env';
const wanted = cliBundle ?? configured;

// `vite preview` 只服务已经建好的 `dist-player/`，包早就烤进去了 —— 不必再要一次。
const needBundle = command !== 'preview';

if (!wanted && needBundle) {
  console.error(
    [
      '播放器需要一个主题资源包。按顺序从三处找：',
      '',
      '  1. --bundle=<路径>（最高优先）',
      '  2. 显式环境变量 LOREDOKU_BUNDLE=<路径>',
      '  3. 仓库根 .env 里的 LOREDOKU_BUNDLE=<路径>  ← 默认',
      '',
      '  npm run ' + command + ':player                                  # 用 .env 的默认值',
      '  npm run ' + command + ':player -- --bundle=/path/to/hlm.zip   # 临时覆盖',
      '',
      '相对路径按仓库根解析；包可以是主题概览页导出的 .zip，也可以是解压后的目录。',
      '参考 .env.example 里 LOREDOKU_BUNDLE 那一行。',
    ].join('\n'),
  );
  process.exit(2);
}

/**
 * 相对路径按**仓库根**解析 —— `.env` 就放在那里，写 `./resources/themes/hlm.zip`
 * 的人心里想的是仓库根，而不是 npm 切过去的 `packages/web`。cwd 那条只是兜底：
 * 有人从 `packages/web` 里直接敲 `./x.zip` 时也该能找到。
 */
function resolveExisting(candidate) {
  if (!candidate) return null;
  if (path.isAbsolute(candidate)) return existsSync(candidate) ? candidate : null;
  const fromRoot = path.resolve(REPO_ROOT, candidate);
  if (existsSync(fromRoot)) return fromRoot;
  const fromCwd = path.resolve(process.cwd(), candidate);
  if (existsSync(fromCwd)) return fromCwd;
  return null;
}

let bundlePath = null;
if (wanted && needBundle) {
  const resolved = resolveExisting(wanted);
  if (!resolved) {
    console.error(`找不到资源包（来自 ${source}）：${wanted}`);
    console.error('相对路径按仓库根解析；也可以给一个绝对路径。');
    process.exit(2);
  }
  bundlePath = resolved;
}

// `vite` 的 package exports 不暴露 `bin/vite.js`，只能从 package.json 旁边拼出来。
const viteEntry = path.join(
  path.dirname(fileURLToPath(import.meta.resolve('vite/package.json'))),
  'bin',
  'vite.js',
);
const child = spawn(process.execPath, [viteEntry, command, '--config', 'vite.player.config.ts', ...passthrough], {
  stdio: 'inherit',
  env: { ...process.env, ...(bundlePath ? { LOREDOKU_BUNDLE: bundlePath } : {}) },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
