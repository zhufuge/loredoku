#!/usr/bin/env node
/**
 * DEV-H12 — `npm run dev` 的可选端口参数。
 *
 *   npm run dev                          # 3000 + 5173（与 v0.4.1 逐字一致）
 *   npm run dev -- --server-port 4000    # 后端 4000，前端 5173
 *   npm run dev -- -w 5180               # 前端 5180，后端 3000
 *   npm run dev -- -s 4000 -w 5180       # 两个都自定义
 *
 * 关键点：`PUBLIC_BASE_URL` 决定上传文件（头像 / 物品图 / 封面）的访问地址，
 * 必须与后端端口**同步**，否则换端口后图片会全部 404。
 *
 * 纯函数（`parseDevArgs` / `validateDevPorts` / `buildDevEnv` / `devCommands` /
 * `formatBanner`）与副作用分离，便于 `scripts/dev.test.mjs` 直接单测。
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const DEV_DEFAULT_SERVER_PORT = 3000;
export const DEV_DEFAULT_WEB_PORT = 5173;

export const PORT_MIN = 1;
export const PORT_MAX = 65535;

const SERVER_PORT_FLAGS = ['-s', '--server-port'];
const WEB_PORT_FLAGS = ['-w', '--web-port'];

/**
 * 把 `-1` / `abc` / `70000` / `0` 这类输入统一挡在启动之前。
 * @param {string} raw
 * @param {string} label 中文提示用的参数名
 * @returns {number}
 */
function parsePortValue(raw, label) {
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`${label}必须是 1~65535 的整数，收到：${text}`);
  }
  const value = Number(text);
  if (value < PORT_MIN || value > PORT_MAX) {
    throw new Error(`${label}必须在 ${PORT_MIN}~${PORT_MAX} 之间，收到：${text}`);
  }
  return value;
}

/**
 * 解析 `npm run dev -- <args>` 的参数。
 * @param {readonly string[]} [argv]
 * @returns {{ serverPort: number; webPort: number }}
 */
export function parseDevArgs(argv = []) {
  /** @type {{ server?: number; web?: number }} */
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index]);
    let flag = token;
    /** @type {string | undefined} */
    let inlineValue;

    // 同时支持 `--server-port 4000` 与 `--server-port=4000`。
    if (token.startsWith('--')) {
      const equalsAt = token.indexOf('=');
      if (equalsAt !== -1) {
        flag = token.slice(0, equalsAt);
        inlineValue = token.slice(equalsAt + 1);
      }
    }

    const isServer = SERVER_PORT_FLAGS.includes(flag);
    const isWeb = WEB_PORT_FLAGS.includes(flag);
    if (!isServer && !isWeb) {
      throw new Error(`未知参数：${token}（可用：-s / --server-port、-w / --web-port）`);
    }

    const key = isServer ? 'server' : 'web';
    const label = isServer ? '后端端口（-s / --server-port）' : '前端端口（-w / --web-port）';
    if (parsed[key] !== undefined) {
      throw new Error(`参数重复：${isServer ? '--server-port' : '--web-port'} 只能传一次`);
    }

    let value = inlineValue;
    if (value === undefined) {
      value = argv[index + 1];
      index += 1;
    }
    // 缺值，或把下一个参数当成了值（`-s -w 5180`）。
    if (
      value === undefined ||
      String(value).trim() === '' ||
      SERVER_PORT_FLAGS.includes(String(value)) ||
      WEB_PORT_FLAGS.includes(String(value))
    ) {
      throw new Error(`参数 ${flag} 缺少端口值（示例：${flag} 4000）`);
    }

    // 立刻校验，保证报错信息指向第一个出错的参数。
    parsed[key] = parsePortValue(value, label);
  }

  return validateDevPorts({
    serverPort: parsed.server ?? DEV_DEFAULT_SERVER_PORT,
    webPort: parsed.web ?? DEV_DEFAULT_WEB_PORT,
  });
}

/**
 * 两个端口不能撞在一起（否则后启动的一方会直接占不到端口）。
 * @param {{ serverPort: number; webPort: number }} ports
 */
export function validateDevPorts({ serverPort, webPort }) {
  if (serverPort === webPort) {
    throw new Error(`后端端口与前端端口不能相同：都是 ${serverPort}`);
  }
  return { serverPort, webPort };
}

/**
 * 解析结果 → 子进程环境变量。`PUBLIC_BASE_URL` 必须跟随后端端口，
 * `VITE_PROXY_TARGET` 让 Vite 的 `/api` 代理打到同一个后端。
 * @param {{ serverPort: number }} ports
 */
export function buildDevEnv({ serverPort }) {
  return {
    server: {
      PORT: String(serverPort),
      PUBLIC_BASE_URL: `http://localhost:${serverPort}`,
    },
    web: {
      VITE_PROXY_TARGET: `http://localhost:${serverPort}`,
    },
  };
}

/**
 * 交给 concurrently 的命令列表（保留彩色前缀 `server` / `web`）。
 * @param {{ serverPort: number; webPort: number }} ports
 */
export function devCommands({ serverPort, webPort }) {
  const env = buildDevEnv({ serverPort });
  return [
    {
      command: 'npm run dev:server',
      name: 'server',
      prefixColor: 'cyan',
      env: env.server,
    },
    {
      command: `npm run dev:web -- --port ${webPort} --strictPort`,
      name: 'web',
      prefixColor: 'magenta',
      env: env.web,
    },
  ];
}

/**
 * 启动后打印的一行汇总，便于直接复制。
 * @param {{ serverPort: number; webPort: number }} ports
 */
export function formatBanner({ serverPort, webPort }) {
  return `后端 http://localhost:${serverPort}  ·  前端 http://localhost:${webPort}`;
}

async function main() {
  let ports;
  try {
    ports = parseDevArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dev] 参数错误：${message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[dev] ${formatBanner(ports)}`);

  const { default: concurrently } = await import('concurrently');
  try {
    await concurrently(devCommands(ports)).result;
  } catch {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
