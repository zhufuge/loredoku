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
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export const DEV_DEFAULT_SERVER_PORT = 3000;
export const DEV_DEFAULT_WEB_PORT = 5173;

export const PORT_MIN = 1;
export const PORT_MAX = 65535;

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
  let parsed;
  try {
    parsed = parseArgs({
      args: argv.map(String),
      options: {
        'server-port': { type: 'string', short: 's' },
        'web-port': { type: 'string', short: 'w' },
      },
      strict: true,
      allowPositionals: false,
      tokens: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`参数错误：${message}`, { cause: error });
  }

  const counts = new Map();
  for (const token of parsed.tokens) {
    if (token.kind === 'option') counts.set(token.name, (counts.get(token.name) ?? 0) + 1);
  }
  for (const [name, count] of counts) {
    if (count > 1) throw new Error(`参数重复：--${name} 只能传一次`);
  }

  const server = parsed.values['server-port'];
  const web = parsed.values['web-port'];
  return validateDevPorts({
    serverPort:
      server === undefined ? DEV_DEFAULT_SERVER_PORT : parsePortValue(server, '后端端口（-s / --server-port）'),
    webPort: web === undefined ? DEV_DEFAULT_WEB_PORT : parsePortValue(web, '前端端口（-w / --web-port）'),
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
