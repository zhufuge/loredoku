#!/usr/bin/env node
/**
 * v0.9.0（docs/v0.9.0.md §8）—— 播放器的 dev / build / preview 包装。
 *
 * 为什么不让 `package.json` 直接调 `vite`：vite 的 CLI 用 cac，**未知选项直接报错**
 * （实测 `--bundle=…` 会抛 `CACError: Unknown option`）。而「包在哪」是这个产物
 * 唯一必填的参数，让用户写成 `--bundle=…` 才是自然的。
 *
 * 所以这一层只做一件事：把 `--bundle` 摘出来塞进 `LOREDOKU_BUNDLE`，剩下的参数
 * 原样递给 vite（`--host`、`--port`、`--mode` 都还能用）。
 *
 * 用法：
 *
 * ```
 * npm run dev:player   -- --bundle=/path/to/hlm.zip
 * npm run build:player -- --bundle=/path/to/hlm-bundle
 * LOREDOKU_BUNDLE=/path/to/hlm.zip npm run build:player
 * ```
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode, ...rest] = process.argv.slice(2);
if (!mode) {
  console.error('用法：node scripts/player.mjs <dev|build|preview> [--bundle=<路径>] [vite 参数…]');
  process.exit(2);
}

/** `--bundle=x`、`--bundle x`、以及裸的位置参数三种都收。 */
let bundlePath = process.env.LOREDOKU_BUNDLE ?? null;
const passthrough = [];
for (let i = 0; i < rest.length; i += 1) {
  const arg = rest[i];
  if (arg.startsWith('--bundle=')) {
    bundlePath = arg.slice('--bundle='.length);
  } else if (arg === '--bundle') {
    bundlePath = rest[i + 1] ?? null;
    i += 1;
  } else {
    passthrough.push(arg);
  }
}

/**
 * 相对路径按**仓库根**解析，因为人是从根目录敲命令的（`npm run build:player -- --bundle=.tmp/x.zip`），
 * 而 npm 把脚本的工作目录切到了 `packages/web`。先试当前目录（脚本作者的直觉），再试
 * 仓库根（用户的直觉），两处都找不到才报错。
 */
function resolveExisting(candidate) {
  if (!candidate) return null;
  const direct = path.resolve(candidate);
  if (existsSync(direct)) return direct;
  const fromRoot = path.resolve(process.cwd(), '..', '..', candidate);
  if (existsSync(fromRoot)) return fromRoot;
  return null;
}

if (bundlePath) {
  const resolved = resolveExisting(bundlePath);
  if (!resolved) {
    console.error(`找不到资源包：${bundlePath}`);
    process.exit(2);
  }
  bundlePath = resolved;
}

// `vite preview` 只服务已经建好的 `dist-player/`，包早就烤进去了 —— 不必再要一次。
if (!bundlePath && mode !== 'preview') {
  console.error(
    [
      '播放器需要一个主题资源包：',
      '',
      `  npm run ${mode}:player -- --bundle=/path/to/hlm.zip`,
      '  LOREDOKU_BUNDLE=/path/to/hlm.zip npm run ' + mode + ':player',
      '',
      '包可以是主题概览页导出的 .zip，也可以是解压后的目录。',
    ].join('\n'),
  );
  process.exit(2);
}

// `vite` 的 package exports 不暴露 `bin/vite.js`，只能从 package.json 旁边拼出来。
const viteEntry = path.join(
  path.dirname(fileURLToPath(import.meta.resolve('vite/package.json'))),
  'bin',
  'vite.js',
);
const child = spawn(process.execPath, [viteEntry, mode, '--config', 'vite.player.config.ts', ...passthrough], {
  stdio: 'inherit',
  env: { ...process.env, ...(bundlePath ? { LOREDOKU_BUNDLE: bundlePath } : {}) },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
