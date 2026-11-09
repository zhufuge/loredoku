import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  REPO_ROOT,
  envFileNames,
  loadRootEnv,
  parseEnv,
  resolveBundlePath,
  viteModeOf,
} from './playerEnv.mjs';

/**
 * 2026-11-09 补（docs/v0.9.0.md §14）：包路径进 `.env` 之后，优先级与「读配置不改环境」
 * 这两件事必须有测试钉住 —— 后者踩过一次真的坑（`VITE_USER_NODE_ENV` 让产物打进了
 * development 版 React，vendor-react 从 205 KB 涨到 416 KB）。
 */

const tempDirs = [];
function envDir(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'loredoku-player-env-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('parseEnv', () => {
  it('注释 / export / 引号 / 行尾注释 / CRLF 都按预期，坏行跳过', () => {
    const text = [
      '# 一行注释',
      '',
      'export LOREDOKU_BUNDLE=./resources/themes/hlm.zip',
      'QUOTED="/path/with spaces/hlm.zip"',
      'SINGLE=\'./a.zip\'',
      'INLINE=./b.zip   # 行尾说明',
      'BROKEN LINE WITHOUT EQUALS',
      'BAD-KEY=value',
    ].join('\r\n');
    expect(parseEnv(text)).toEqual({
      LOREDOKU_BUNDLE: './resources/themes/hlm.zip',
      QUOTED: '/path/with spaces/hlm.zip',
      SINGLE: './a.zip',
      INLINE: './b.zip',
    });
  });
});

describe('loadRootEnv', () => {
  it('后面的文件盖前面的：.env → .env.local → .env.production → .env.production.local', () => {
    expect(envFileNames('production')).toEqual([
      '.env',
      '.env.local',
      '.env.production',
      '.env.production.local',
    ]);
    expect(viteModeOf('dev')).toBe('development');
    expect(viteModeOf('build')).toBe('production');

    const dir = envDir({
      '.env': 'LOREDOKU_BUNDLE=./one.zip\nKEEP=yes\n',
      '.env.local': 'LOREDOKU_BUNDLE=./two.zip\n',
      '.env.production': 'LOREDOKU_BUNDLE=./three.zip\n',
      '.env.production.local': 'LOREDOKU_BUNDLE=./four.zip\n',
    });
    expect(loadRootEnv('production', dir)).toEqual({
      LOREDOKU_BUNDLE: './four.zip',
      KEEP: 'yes',
    });
  });

  it('development 模式不会去读 .env.production，缺文件也不报错', () => {
    const dir = envDir({
      '.env': 'LOREDOKU_BUNDLE=./base.zip\n',
      '.env.production': 'LOREDOKU_BUNDLE=./prod.zip\n',
    });
    expect(loadRootEnv('development', dir).LOREDOKU_BUNDLE).toBe('./base.zip');
    expect(loadRootEnv('production', dir).LOREDOKU_BUNDLE).toBe('./prod.zip');
    expect(loadRootEnv('production', path.join(dir, '没有这个目录'))).toEqual({});
  });

  it('只读不写：不会给 process.env 塞 VITE_USER_NODE_ENV 之类的东西', () => {
    const dir = envDir({ '.env': 'NODE_ENV=development\nLOREDOKU_BUNDLE=./a.zip\n' });
    const before = { ...process.env };
    const loaded = loadRootEnv('production', dir);
    expect(loaded.NODE_ENV).toBe('development');
    expect(process.env).toEqual(before);
    expect(process.env.VITE_USER_NODE_ENV).toBeUndefined();
  });
});

describe('resolveBundlePath 的优先级', () => {
  const dotenv = { LOREDOKU_BUNDLE: './from-env-file.zip' };

  it('--bundle= 盖过环境变量与 .env', () => {
    expect(
      resolveBundlePath({
        argv: ['--bundle=/cli.zip'],
        env: { LOREDOKU_BUNDLE: '/env.zip' },
        dotenv,
      }),
    ).toBe('/cli.zip');
  });

  it('--bundle <路径> 那种写法也收，且不能把值当成 vite 参数漏出去', () => {
    expect(resolveBundlePath({ argv: ['--bundle', '/cli.zip', '--host'], env: {}, dotenv })).toBe(
      '/cli.zip',
    );
  });

  it('显式环境变量盖过 .env', () => {
    expect(
      resolveBundlePath({ argv: [], env: { LOREDOKU_BUNDLE: '/env.zip' }, dotenv }),
    ).toBe('/env.zip');
  });

  it('都没给就落到 .env 的默认值', () => {
    expect(resolveBundlePath({ argv: [], env: {}, dotenv })).toBe('./from-env-file.zip');
  });

  it('三处都没有 → null（由包装脚本决定报错；preview 不报错）', () => {
    expect(resolveBundlePath({ argv: [], env: {}, dotenv: {} })).toBeNull();
    expect(resolveBundlePath({ argv: ['--bundle='], env: {}, dotenv })).toBeNull();
  });

  it('默认参数是真会读仓库根那份 .env 的', () => {
    const fromDisk = loadRootEnv('production', REPO_ROOT).LOREDOKU_BUNDLE;
    // 本机 `.env` 被 gitignore，克隆下来可能没有；这里只钉「两条路得到同一个答案」。
    expect(resolveBundlePath({ argv: [], env: {}, mode: 'production' })).toBe(fromDisk || null);
  });
});
