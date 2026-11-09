/**
 * v0.9.0 §8 / 2026-11-09 补（docs/v0.9.0.md §14）—— 播放器「包在哪」的**单一答案**。
 *
 * 以前这个答案散在两处：`scripts/player.mjs` 摘 `--bundle`、`scripts/bundleAssets.mjs`
 * 又各自读一遍 `process.env.LOREDOKU_BUNDLE`。现在默认路径进了仓库根的 `.env`，两处
 * 再各读一遍必然走岔，所以收成一个函数，优先级写在一处：
 *
 * ```
 * --bundle=<路径>  >  显式环境变量 LOREDOKU_BUNDLE  >  .env 里的 LOREDOKU_BUNDLE  >  没有
 * ```
 *
 * **为什么自己读 `.env` 而不用 Vite 的 `loadEnv`**：`loadEnv` 有副作用 —— 它会把
 * `.env` 里的 `NODE_ENV` 写进 `process.env.VITE_USER_NODE_ENV`（Vite 5 源码
 * `dep-*.js` 的 `loadEnv`）。本仓库 `.env` 写的是 `NODE_ENV=development`，
 * 包装脚本里调一次，这个值就被继承给 vite 子进程，构建会打出 **development 版的
 * React**（实测 `vendor-react` 从 205 KB 涨到 416 KB）。读配置不该改环境，而且
 * 我们只需要一个键 —— 所以按 Vite 的文件顺序自己扫，零副作用、零新依赖。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/**
 * 够用的 `.env` 解析：注释、`export`、单行 `KEY=VALUE`、成对的单双引号、行尾 `# 注释`。
 * 不做变量展开（`$FOO`）—— 包路径用不上，而展开正是 dotenv 那类库最容易踩的坑。
 */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const body = line.replace(/^export\s+/, '');
    const eq = body.indexOf('=');
    if (eq < 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * 读那几份 `.env`，返回合并后的普通对象（**不写 `process.env`**）。
 * `root` 可换，单测因此在临时目录里就能验覆盖顺序，不依赖本机那份 `.env`。
 */
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

/**
 * 按优先级取**原始**路径字符串（不检查文件在不在、不转绝对路径 —— 那是
 * `player.mjs` 的事，配置层只回答「配的是哪个字符串」）。
 *
 * `argv` 那段是给「不经过包装脚本、直接 `vite --config vite.player.config.ts`」兜底的：
 * 正常路径下 `player.mjs` 已经把 `--bundle` 摘掉，这里不会看到它。
 * `dotenv` 可注入，单测因此不必真的去碰磁盘上的 `.env`。
 */
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
