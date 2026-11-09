#!/usr/bin/env node
/**
 * 跑一个包的测试，一次收集。
 *
 * 为什么不再逐文件调用：`scripts/run-tests.sh` 早先按文件循环 `vitest run`，因为
 * 在本机（工作助手的文件系统 shim）一次收集多个文件时会因为临时目录写入被拒
 * （EPERM）而静默漏收。代价是每个文件一次 Node 启动 —— 87 个文件 2 分 30 秒，
 * 而 `user` 时间只有 5 秒，其余全是启动开销。
 *
 * 现在一次跑完（约 12 秒），跑完拿报告对着磁盘列表核一遍；真漏了的那几个再单独
 * 补跑。漏收是偶发的，补跑通常 0 个文件，最坏也就多几秒。
 *
 * 用法：node scripts/run-tests.mjs packages/web
 *      node scripts/run-tests.mjs packages/shared --serial   （强制逐文件）
 *
 * server 默认就是串行 —— 它所有用例共用同一个测试库，并行会偶发撞车。
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = process.argv[2];
const serialFlag = process.argv.includes('--serial');

/**
 * 默认走串行的包：server 的所有用例共用同一个测试库，并行收集时两个文件会同时
 * 造/删资源，偶发撞车（实测 `assetVariants` 在一次并行里整个文件报失败，单跑
 * 又是 11 / 11 全绿）。11 秒换一次偶发红不值 —— 串行 33 秒。
 */
const SERIAL_BY_DEFAULT = new Set(['packages/server']);
const serial = serialFlag || SERIAL_BY_DEFAULT.has(pkgDir?.replaceAll('\\', '/'));

if (!pkgDir) {
  console.error('用法: node scripts/run-tests.mjs packages/<pkg> [--serial]');
  process.exit(2);
}

const cwd = path.resolve(root, pkgDir);
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const report = path.join(cwd, `.vitest-report-${process.pid}.json`);

/** 磁盘上的全部测试文件 —— 汇总时用它核对“报告里少了谁”。 */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    // `.test.mjs` 是构建脚本自己的单测（如 packages/web/scripts/playerEnv.test.mjs）；
    // Vitest 默认就收它，这里也得算进清单，否则汇总数字会少算、失败还会被吞掉。
    else if (/\.test\.(tsx?|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = collect(cwd).sort();
const strip = (text) => text.replace(/\u001b\[[0-9;]*m/g, '');

function run(args) {
  return spawnSync(process.execPath, [vitest, 'run', '--no-cache', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** 从 vitest 的文本输出里抠出「N passed / N failed」。 */
function tally(text) {
  const line = strip(text)
    .split('\n')
    .filter((row) => /^\s*Tests\s+/.test(row))
    .pop();
  if (!line) return { passed: 0, failed: 0 };
  const pick = (word) => Number(new RegExp(`(\\d+)\\s+${word}`).exec(line)?.[1] ?? 0);
  return { passed: pick('passed'), failed: pick('failed') };
}

/** 一次收集。返回 Map<绝对路径, { status, tests, passed, failed }>。 */
function runAll() {
  const result = run(['--reporter=json', `--outputFile=${report}`]);
  try {
    const json = JSON.parse(readFileSync(report, 'utf8'));
    const map = new Map();
    for (const row of json.testResults) {
      const assertions = row.assertionResults ?? [];
      map.set(path.resolve(row.name), {
        status: row.status === 'passed' ? 'passed' : 'failed',
        tests: assertions.length,
        passed: assertions.filter((a) => a.status === 'passed').length,
        failed: assertions.filter((a) => a.status === 'failed').length,
      });
    }
    return map;
  } catch {
    // 报告都没写出来 —— 收集阶段就崩了（正是历史上那个 EPERM）。整包退成串行。
    console.error(strip(result.stderr ?? '').trim().split('\n').slice(-5).join('\n'));
    console.error('一次收集失败，退回逐文件模式。');
    return null;
  }
}

function runOne(file) {
  const rel = path.relative(cwd, file);
  const result = spawnSync(
    process.execPath,
    [vitest, 'run', '--no-cache', rel],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const { passed, failed } = tally(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  return {
    status: result.status === 0 ? 'passed' : 'failed',
    tests: passed + failed,
    passed,
    failed,
  };
}

let results = serial ? null : runAll();

if (!results) {
  // 串行：一个文件一次进程。慢，但一定收齐。
  results = new Map();
  for (const file of files) results.set(file, runOne(file));
} else {
  for (const file of files) {
    if (!results.has(file)) results.set(file, runOne(file));
  }
}

rmSync(report, { force: true });

let okFiles = 0;
let badFiles = 0;
let totalTests = 0;
const failedNames = [];

for (const file of files) {
  const row = results.get(file) ?? { status: 'failed', tests: 0, failed: 1 };
  totalTests += row.tests;
  if (row.status === 'passed') {
    okFiles += 1;
    console.log(`PASS  ${row.tests}\t./${path.relative(cwd, file).replaceAll('\\', '/')}`);
  } else {
    badFiles += 1;
    failedNames.push(`./${path.relative(cwd, file).replaceAll('\\', '/')}`);
    console.log(`FAIL  ${row.passed}/${row.tests}\t./${path.relative(cwd, file).replaceAll('\\', '/')}`);
  }
}

console.log('-----------------------------------------');
console.log(`files: ${okFiles + badFiles}  passed: ${okFiles}  failed: ${badFiles}  tests: ${totalTests}`);
if (badFiles > 0) {
  console.log(`failed: ${failedNames.join(' ')}`);
  process.exit(1);
}
