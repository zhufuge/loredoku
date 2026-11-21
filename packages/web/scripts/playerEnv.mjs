/** v0.9.0 §8 / 2026-11-09 补（docs/v0.9.0.md §14）：播放器「包在哪」的单一答案 —— `--bundle` > 显式 `LOREDOKU_BUNDLE` > 仓库根 `.env`。不用 Vite 的 `loadEnv` 是因为它有副作用：会把 `.env` 的 `NODE_ENV` 带进 vite 子进程，构建打进 development 版 React。 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';

/** `packages/web/scripts/` 往上三级 = 仓库根（`.env` 在那里）。 */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

/** 包装脚本的命令名 → Vite 的 mode，用来挑 `.env.[mode]`。 */
export function viteModeOf(command) {
  return command === 'dev' ? 'development' : 'production';
}

/** 与 Vite 相同的覆盖顺序：后面的盖前面的；`.local` 是本地私有的那一份。 */
export function envFileNames(mode = 'production') {
  return ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`];
}

/** `dotenv.parse` 的薄包装：只保留合法环境变量名，坏行不影响其余条目。 */
export function parseEnv(text) {
  const parsed = parseDotenv(text);
  return Object.fromEntries(
    Object.entries(parsed).filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)),
  );
}

/** 读那几份 `.env`，返回合并后的普通对象（**不写 `process.env`**）。 `root` 可换，单测因此在临时目录里就能验覆盖顺序，不依赖本机那份 `.env`。 */
export function loadRootEnv(mode = 'production', root = REPO_ROOT) {
  const merged = {};
  for (const name of envFileNames(mode)) {
    let text;
    try {
      text = readFileSync(path.join(root, name), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    Object.assign(merged, parseEnv(text));
  }
  return merged;
}

/** 按优先级取**原始**路径字符串（不检查文件在不在、不转绝对路径 —— 那是 `player.mjs` 的事，配置层只回答「配的是哪个字符串」）。 `argv` 那段是给「不经过包装脚本、直接 `vite --config vite.player.config.ts`」兜底的： 正常路径下 `player.mjs` 已经把 `--bundle` 摘掉，这里不会看到它。 `dotenv` 可注入，单测因此不必真的去碰磁盘上的 `.env`。 */
export function resolveBundlePath({
  argv = process.argv,
  env = process.env,
  mode = 'production',
  dotenv,
} = {}) {
  const inline = argv.find((arg) => arg.startsWith('--bundle='));
  if (inline) return inline.slice('--bundle='.length) || null;
  const index = argv.indexOf('--bundle');
  if (index >= 0 && argv[index + 1]) return argv[index + 1];

  const fromProcess = env.LOREDOKU_BUNDLE;
  if (fromProcess) return fromProcess;

  const fromFile = (dotenv ?? loadRootEnv(mode)).LOREDOKU_BUNDLE;
  return fromFile || null;
}
