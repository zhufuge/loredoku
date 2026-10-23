#!/usr/bin/env node
/**
 * v0.7.4 (docs/v0.7.4.md §2.6): 把 `fonts-source/` 里的字体裁成 woff2，
 * 输出到 `src/assets/fonts/` —— 后者才是被打包、被下拉看见的那份。
 *
 * 为什么必须有这一步：霞鹜文楷 Regular 的 TTF 是 **24.7 MB**，直接丢进
 * `assets/fonts/` 会原样进 `dist/`、进 git、进每个玩家的首屏。同款字体
 * 只保留 GB2312 一级（3755 字）+ ASCII + 标点后是 **约 800 KB**，整款转
 * woff2 不裁字是 7.7 MB —— 裁字才是数量级上的那一刀。
 *
 * 用法：
 *
 *   npm run fonts                       # 默认 charset=common
 *   npm run fonts -- --charset gb2312   # 6763 字，约 1.4 MB
 *   npm run fonts -- --charset full     # 只转 woff2，不裁字（慢，30s 级）
 *   npm run fonts -- --charset file:chars.txt
 *   npm run fonts -- --budget 600       # 超过 600 KB 时标出来
 */

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');

const DEFAULT_SRC = resolve(WEB_ROOT, 'fonts-source');
const DEFAULT_OUT = resolve(WEB_ROOT, 'src/assets/fonts');

/** 只把这两种当「源」：woff2 已经是目标格式，再放一遍没有意义。 */
const SOURCE_EXTS = new Set(['.ttf', '.otf']);

/** 默认预算：一款字体超过这个大小，说明字集没裁干净。 */
const DEFAULT_BUDGET_KB = 1200;

// ---- 字集 ------------------------------------------------------------------

export const ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) =>
  String.fromCharCode(0x20 + i),
).join('');

/**
 * 标签上真会出现的标点。GB2312 的符号区也会带一批全角形式，这里只补
 * 中文排版里最常用、且落在符号区之外的那几个（省略号、破折号、间隔号）。
 */
export const EXTRA_PUNCT = '·—…‰′″‹›⁄';

/**
 * GB2312 的字符表：符号区（0xA1–0xA9）+ 一级汉字（0xB0–0xD7）+ 可选二级
 * （0xD8–0xF7）。
 *
 * 用 `TextDecoder('gbk')` 现算，而不是往代码里贴 6763 个汉字：贴进去的字符串
 * 没法审阅、改一个字集就得整段重贴，而 GB2312 的映射是标准的一部分。
 */
export function gb2312Charset({ level2 }) {
  const decoder = new TextDecoder('gbk');
  const zones = [
    [0xa1, 0xa9],
    [0xb0, 0xd7],
    ...(level2 ? [[0xd8, 0xf7]] : []),
  ];
  const chars = [];
  const seen = new Set();
  for (const [first, last] of zones) {
    for (let high = first; high <= last; high += 1) {
      for (let low = 0xa1; low <= 0xfe; low += 1) {
        const char = decoder.decode(Uint8Array.of(high, low));
        if (char.length !== 1 || char === '\uFFFD') continue;
        if (seen.has(char)) continue;
        seen.add(char);
        chars.push(char);
      }
    }
  }
  return chars.join('');
}

export async function resolveCharset(spec) {
  if (spec === 'full') return null;
  if (spec === 'common') return ASCII + EXTRA_PUNCT + gb2312Charset({ level2: false });
  if (spec === 'gb2312') return ASCII + EXTRA_PUNCT + gb2312Charset({ level2: true });
  if (spec.startsWith('file:')) {
    const path = resolve(WEB_ROOT, spec.slice('file:'.length));
    if (!existsSync(path)) throw new Error(`字表文件不存在：${path}`);
    return await readFile(path, 'utf8');
  }
  throw new Error(`未知 charset：${spec}（可选 common / gb2312 / full / file:<path>）`);
}

// ---- 参数 ------------------------------------------------------------------

export function parseArgs(argv) {
  const options = {
    src: DEFAULT_SRC,
    out: DEFAULT_OUT,
    charset: 'common',
    budgetKb: DEFAULT_BUDGET_KB,
    strict: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} 后面缺少取值`);
      i += 1;
      return value;
    };
    if (arg === '--charset') options.charset = next();
    else if (arg === '--budget') options.budgetKb = Number(next());
    else if (arg === '--src') options.src = resolve(process.cwd(), next());
    else if (arg === '--out') options.out = resolve(process.cwd(), next());
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知参数：${arg}`);
  }
  return options;
}

function usage() {
  return [
    '把 fonts-source/ 里的字体裁成 woff2，输出到 src/assets/fonts/',
    '',
    '  --charset common|gb2312|full|file:<path>   字集，默认 common（约 3755 汉字）',
    '  --budget <KB>                              单款体积预警线，默认 1200',
    '  --strict                                   有文件超预算时以非零码退出',
    '  --src <dir> / --out <dir>                  换目录',
  ].join('\n');
}

// ---- 主流程 ----------------------------------------------------------------

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const human = (bytes) => (bytes >= 1048576 ? mb(bytes) : kb(bytes));

export async function listSources(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSources(path)));
      continue;
    }
    if (SOURCE_EXTS.has(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files.sort();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const sources = await listSources(options.src);
  if (sources.length === 0) {
    process.stdout.write(
      `没有找到源字体。把 .ttf / .otf 放进 ${relative(process.cwd(), options.src)}/\n`,
    );
    return 0;
  }

  const text = await resolveCharset(options.charset);
  await mkdir(options.out, { recursive: true });

  const started = Date.now();
  const rows = [];
  let overBudget = 0;

  for (const source of sources) {
    const name = basename(source, extname(source));
    const target = join(options.out, `${name}.woff2`);
    const input = await readFile(source);
    const begin = Date.now();

    let output;
    if (text === null) {
      // full：只换容器，不裁字。wawoff2 是 subset-font 的间接依赖，慢且只在
      // 这个分支用得上，所以按需加载。
      const { compress } = await import('wawoff2');
      output = Buffer.from(await compress(input));
    } else {
      output = await subsetFont(input, text, { targetFormat: 'woff2' });
    }

    await writeFile(target, output);
    const bytes = (await stat(target)).size;
    if (bytes > options.budgetKb * 1024) overBudget += 1;

    rows.push({
      file: relative(options.out, target),
      source: `${human(input.length)} → ${human(bytes)}`,
      ratio: `${Math.round((bytes / input.length) * 100)}%`,
      chars: text === null ? '全部' : String(new Set(text).size),
      time: `${((Date.now() - begin) / 1000).toFixed(1)}s`,
      over: bytes > options.budgetKb * 1024,
    });
  }

  const width = Math.max(...rows.map((row) => row.file.length), 4);
  process.stdout.write(`\ncharset=${options.charset}\n\n`);
  for (const row of rows) {
    process.stdout.write(
      `${row.file.padEnd(width)}  ${row.chars.padStart(5)} 字  ` +
        `${row.source.padStart(24)}  ${row.time.padStart(6)}${row.over ? '  ⚠ 超过预算' : ''}\n`,
    );
  }
  process.stdout.write(
    `\n共 ${rows.length} 款，用时 ${((Date.now() - started) / 1000).toFixed(1)}s。` +
      `输出目录：${relative(process.cwd(), options.out)}/\n`,
  );

  if (overBudget > 0) {
    const advice =
      options.charset === 'common'
        ? '先试 --charset common，字库确实需要更大就 --charset gb2312'
        : '默认字集已经是最小档，再瘦就得给一份字表（--charset file:chars.txt）';
    process.stdout.write(
      `\n${overBudget} 款超过 ${options.budgetKb} KB（charset=${options.charset}）。` +
        `${advice}；否则见 §2.6 的按需子集。\n`,
    );
    if (options.strict) return 1;
  }
  return 0;
}

// 只在被当成脚本执行时跑主流程：测试要 import 上面的函数，不能顺手把字体全裁一遍。
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
      process.exitCode = 1;
    });
}
