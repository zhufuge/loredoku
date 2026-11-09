import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

/**
 * v0.7.4 (docs/v0.7.4.md §2.6): 字体体积靠「裁字」解决，字集就是这个脚本的全部
 * 价值。脚本是 CLI（`.mjs`，不进 `tsc`），所以这里按 CLI 测：起子进程、看输出。
 *
 * 只测「不碰字体文件」的路径 —— 真去裁一款 25 MB 的字体是集成测试，不该进单测。
 */
const run = promisify(execFile);
// jsdom 环境下 `import.meta.url` 是 http:// 的，不能用它定位脚本 —— vitest 的
// 工作目录就是 packages/web。
const script = join(process.cwd(), 'scripts/build-fonts.mjs');

async function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [script, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

describe('build-fonts CLI', () => {
  it('prints usage', async () => {
    const { code, stdout } = await cli(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('--charset');
    // v0.7.7: 补字是「缺字怎么办」的正解，用法里得能看见。
    expect(stdout).toContain('--extra');
  });

  it('rejects --extra without a value instead of silently ignoring it', async () => {
    const { code, stderr } = await cli(['--extra']);
    expect(code).toBe(1);
    expect(stderr).toContain('缺少取值');
  });

  it('says where to put sources when there are none', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'loredoku-fonts-'));
    const { code, stdout } = await cli(['--src', empty]);
    expect(code).toBe(0);
    expect(stdout).toContain('没有找到源字体');
  });

  it('fails loudly on an unknown charset instead of falling back to the default', async () => {
    const { code, stderr } = await cli(['--charset', 'gb18030']);
    expect(code).toBe(1);
    expect(stderr).toContain('未知 charset');
  });
});

/**
 * v0.9.4：补字清单是「谁遇到缺字谁加一行」的人工清单，被误删不会让构建报错 ——
 * 只是那个字悄悄退回系统字体。这里把「雯 / 麝 / 怡」钉在清单上：它们要进
 * `font-kai`，才能和名册里的晴雯、麝月、怡红院用同一种手写体。
 */
describe('补字清单（v0.9.4）', () => {
  it('雯 / 麝 / 怡 都在清单里，且清单不带 # 注释进字集', async () => {
    const text = await readFile(join(process.cwd(), 'scripts/font-extra-chars.txt'), 'utf8');
    for (const ch of ['薇', '雯', '麝', '怡']) expect(text).toContain(ch);
  });
});
