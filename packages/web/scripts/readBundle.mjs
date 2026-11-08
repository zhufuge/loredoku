/**
 * v0.9.0（docs/v0.9.0.md §8）：把一个**主题资源包**读进内存。
 *
 * 接受两种形状：
 *
 * - 一个 `.zip`（作者从主题概览页导出的原件）；
 * - 一个已经解开的目录（里面直接是 `manifest.json`、`puzzles/`、`files/`）。
 *
 * zip 用**自己写的解析**，不引新依赖：包里只有 `stored`（0）与 `deflate`（8）
 * 两种压缩方法，`zlib.inflateRawSync` 就够了 —— 为一个构建期工具链加一个解压库，
 * 比这段 80 行贵（v0.8.0 §11.6 的取舍同一条：依赖只进不出）。
 *
 * **不支持 zip64**（>4GB 或 >65535 个条目）：主题资源包远到不了，真遇到就报错并
 * 让人先解压成目录 —— 明确失败好过悄悄读错。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** 中央目录结尾（EOCD）在文件尾部，后面最多跟 64KB 注释。 */
function findEocd(buffer) {
  const floor = Math.max(0, buffer.length - (0xffff + 22));
  for (let i = buffer.length - 22; i >= floor; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('这不是一个 zip：找不到中央目录结尾');
}

function readZipEntries(buffer) {
  const eocd = findEocd(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);

  if (count === 0xffff || centralOffset === 0xffffffff) {
    throw new Error('这个 zip 用了 zip64（超过 4GB 或 6.5 万个条目），请先解压成目录再指过来');
  }

  const entries = new Map();
  let cursor = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIG) {
      throw new Error('zip 的中央目录损坏（条目头签名不对）');
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new Error(`zip 的本地头损坏：${name}`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    // 目录条目以 `/` 结尾，里面没有数据。
    if (!name.endsWith('/')) {
      const data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
      entries.set(normalizeEntryName(name), data);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readDirEntries(root) {
  const entries = new Map();
  const walk = (dir, prefix) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) walk(full, rel);
      else if (item.isFile()) entries.set(normalizeEntryName(rel), readFileSync(full));
    }
  };
  walk(root, '');
  return entries;
}

/**
 * 包内路径统一成用 `/` 分隔、不以 `/` 开头、不含 `..`。
 *
 * 后两条是**安全边界**而不只是洁癖：这些名字会被拼进产物路径（`emitFile`），
 * 一个 `../../etc/passwd` 就能写到 dist 外面去。包是我们自己导出的，但构建脚本
 * 不该假设输入一定乖巧。
 */
function normalizeEntryName(name) {
  const unified = name.replaceAll('\\', '/').replace(/^\/+/, '');
  if (unified.split('/').includes('..')) {
    throw new Error(`资源包里有越界路径：${name}`);
  }
  return unified;
}

/**
 * 读一个包，返回 `{ manifest, code, files }`。
 *
 * `files` 是 `Map<包内相对路径, Buffer>`，**包含** `manifest.json` 自己 ——
 * 产物里也要能单独取到它（列表页第一件事就是读它）。
 */
export function readBundle(inputPath) {
  const resolved = path.resolve(inputPath);
  let stat;
  try {
    stat = statSync(resolved);
  } catch {
    throw new Error(`找不到资源包：${resolved}`);
  }

  const files = stat.isDirectory()
    ? readDirEntries(resolved)
    : readZipEntries(readFileSync(resolved));

  const rawManifest = files.get('manifest.json');
  if (!rawManifest) {
    throw new Error(`${resolved} 里没有 manifest.json —— 这不是一个主题资源包`);
  }

  let manifest;
  try {
    manifest = JSON.parse(rawManifest.toString('utf8'));
  } catch (error) {
    throw new Error(`manifest.json 不是合法 JSON：${error.message}`);
  }

  const code = manifest?.theme?.code;
  if (typeof code !== 'string' || code.length === 0) {
    throw new Error('manifest.json 里没有 theme.code —— 包不完整');
  }
  if (!Array.isArray(manifest.games) || manifest.games.length === 0) {
    throw new Error('manifest.json 里没有 games[] —— 这个包一关都没有，播放器没东西可摆');
  }

  // 关卡文件与三张侧表必须真的在包里：少一个就是「能构建、进页面才炸」。
  const required = [
    manifest.assets,
    manifest.characters,
    ...manifest.games.map((game) => game.file),
  ].filter((name) => typeof name === 'string');
  for (const name of required) {
    if (!files.has(name)) throw new Error(`包里缺文件：${name}`);
  }

  return { manifest, code, files };
}
