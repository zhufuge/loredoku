import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SITE_SUBDIR,
  countFiles,
  isDirectRun,
  listThemeCodes,
  parsePublishArgs,
  resolveSiteDir,
} from './publish-player.mjs';

const scratch = [];

/** 造一个临时目录，用例结束统一删掉（AGENTS.md §4.1）。 */
function tempDir(prefix = 'publish-player-') {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe('isDirectRun — 单测 import 这个模块时绝不能触发真正的发布', () => {
  const self = fileURLToPath(new URL('./publish-player.mjs', import.meta.url));

  it('被直接执行时返回 true', () => {
    expect(isDirectRun(self, new URL('./publish-player.mjs', import.meta.url).href)).toBe(true);
  });

  it('被 import（argv[1] 是测试入口）时返回 false', () => {
    expect(isDirectRun(path.join('D:', 'x', 'vitest.mjs'), new URL('./publish-player.mjs', import.meta.url).href)).toBe(false);
  });

  it('没有 argv[1] 时返回 false', () => {
    expect(isDirectRun(undefined, new URL('./publish-player.mjs', import.meta.url).href)).toBe(false);
  });

  it('大小写不同的同一路径仍算直接执行（Windows）', () => {
    const upper = self.toUpperCase();
    const result = isDirectRun(upper, new URL('./publish-player.mjs', import.meta.url).href);
    expect(result).toBe(process.platform === 'win32');
  });
});

describe('parsePublishArgs — 默认值与合法参数', () => {
  it('无参数时什么都不改：构建、写 404、真写盘', () => {
    expect(parsePublishArgs([])).toEqual({
      site: null,
      bundle: null,
      noBuild: false,
      no404: false,
      dryRun: false,
    });
  });

  it('--site=x 与 --site x 等价', () => {
    expect(parsePublishArgs(['--site=D:/a']).site).toBe('D:/a');
    expect(parsePublishArgs(['--site', 'D:/a']).site).toBe('D:/a');
  });

  it('--bundle=x 与 --bundle x 等价', () => {
    expect(parsePublishArgs(['--bundle=./hlm.zip']).bundle).toBe('./hlm.zip');
    expect(parsePublishArgs(['--bundle', './hlm.zip']).bundle).toBe('./hlm.zip');
  });

  it('三个开关各自独立生效', () => {
    expect(parsePublishArgs(['--no-build']).noBuild).toBe(true);
    expect(parsePublishArgs(['--no-404']).no404).toBe(true);
    expect(parsePublishArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('参数顺序无关，可混用', () => {
    expect(parsePublishArgs(['--dry-run', '--site', 'D:/a', '--no-404', '--bundle=x.zip'])).toEqual({
      site: 'D:/a',
      bundle: 'x.zip',
      noBuild: false,
      no404: true,
      dryRun: true,
    });
  });
});

describe('parsePublishArgs — 非法输入一律抛中文错误', () => {
  const cases = [
    { name: '不认识的长选项', argv: ['--ste=D:/a'] },
    { name: '笔误的开关', argv: ['--no-bulid'] },
    { name: '--site 缺值（结尾）', argv: ['--site'] },
    { name: '--bundle 缺值（结尾）', argv: ['--bundle'] },
    { name: '多余的裸参数', argv: ['D:/a'] },
  ];
  for (const { name, argv } of cases) {
    it(name, () => {
      expect(() => parsePublishArgs(argv)).toThrow();
    });
  }

  it('--site= 空值退回默认（不当作有效路径）', () => {
    expect(parsePublishArgs(['--site=']).site).toBeNull();
  });
});

describe('resolveSiteDir — 取值顺序与删除前的校验', () => {
  /** 造一个「像站点仓库」的目录。 */
  function makeSite(parent, name = 'site-repo') {
    const dir = path.join(parent, name);
    mkdirSync(path.join(dir, '.git'), { recursive: true });
    return dir;
  }

  /** 每个用例都显式给 `dotenv`，避免读到仓库根真实那份 `.env`。 */
  const noEnv = {};

  it('--site 显式路径优先，目标落在 <site>/loredoku', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku-repo');
    mkdirSync(repoRoot);
    const site = makeSite(parent);
    const result = resolveSiteDir({ site, repoRoot, dotenv: noEnv });
    expect(result.siteDir).toBe(path.normalize(site));
    expect(result.targetDir).toBe(path.join(path.normalize(site), SITE_SUBDIR));
  });

  it('没有 --site 时用显式环境变量 LOREDOKU_SITE', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku-repo');
    mkdirSync(repoRoot);
    const site = makeSite(parent);
    expect(resolveSiteDir({ site: null, env: { LOREDOKU_SITE: site }, repoRoot, dotenv: noEnv }).siteDir)
      .toBe(path.normalize(site));
  });

  it('没有 --site 与环境变量时，读 .env 里的 LOREDOKU_SITE', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku-repo');
    mkdirSync(repoRoot);
    const site = makeSite(parent);
    expect(resolveSiteDir({
      site: null,
      env: {},
      repoRoot,
      dotenv: { LOREDOKU_SITE: site },
    }).siteDir).toBe(path.normalize(site));
  });

  it('优先级：--site > 环境变量 > .env', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku-repo');
    mkdirSync(repoRoot);
    const fromArg = makeSite(parent, 'site-a');
    const fromEnv = makeSite(parent, 'site-b');
    const fromFile = makeSite(parent, 'site-c');
    const dotenv = { LOREDOKU_SITE: fromFile };

    expect(resolveSiteDir({ site: fromArg, env: { LOREDOKU_SITE: fromEnv }, repoRoot, dotenv }).siteDir)
      .toBe(path.normalize(fromArg));
    expect(resolveSiteDir({ site: null, env: { LOREDOKU_SITE: fromEnv }, repoRoot, dotenv }).siteDir)
      .toBe(path.normalize(fromEnv));
    expect(resolveSiteDir({ site: null, env: {}, repoRoot, dotenv }).siteDir)
      .toBe(path.normalize(fromFile));
  });

  it('.env 里的相对路径按**仓库根**解析（不是 cwd）', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku');
    mkdirSync(repoRoot);
    const site = makeSite(parent);
    expect(resolveSiteDir({
      site: null,
      env: {},
      repoRoot,
      dotenv: { LOREDOKU_SITE: '../site-repo' },
    }).siteDir).toBe(path.normalize(site));
  });

  it('真的从仓库根的 .env 文件读（走 loadRootEnv）', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku');
    mkdirSync(repoRoot);
    const site = makeSite(parent);
    writeFileSync(path.join(repoRoot, '.env'), 'LRD_UNUSED=1\nLOREDOKU_SITE=../site-repo\n');
    // 不传 dotenv，让它自己去读那份 .env
    expect(resolveSiteDir({ site: null, env: {}, repoRoot }).siteDir).toBe(path.normalize(site));
  });

  it('同级目录名猜测已移除：没配置就报错，哪怕同级就有 *.github.io', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku');
    mkdirSync(repoRoot);
    makeSite(parent, 'someone.github.io'); // 同级确实有个看着像站点的目录
    expect(() => resolveSiteDir({ site: null, env: {}, repoRoot, dotenv: noEnv }))
      .toThrow(/LOREDOKU_SITE/);
  });

  it('找不到站点时抛错并给出 .env 的写法', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku');
    mkdirSync(repoRoot);
    const message = (() => {
      try {
        resolveSiteDir({ site: null, env: {}, repoRoot, dotenv: noEnv });
      } catch (error) {
        return error.message;
      }
      return '';
    })();
    expect(message).toMatch(/\.env/);
    expect(message).toMatch(/LOREDOKU_SITE=/);
    expect(message).toMatch(/--site/);
  });

  it('路径不存在时抛错，并说明相对路径的基准', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku');
    mkdirSync(repoRoot);
    expect(() => resolveSiteDir({ site: path.join(parent, 'nope'), repoRoot, dotenv: noEnv }))
      .toThrow(/不存在/);
    expect(() => resolveSiteDir({ site: '../nope', repoRoot, dotenv: noEnv }))
      .toThrow(/仓库根/);
  });

  it('不是 git 仓库时抛错（挡住指到普通目录的笔误）', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku');
    mkdirSync(repoRoot);
    const plain = path.join(parent, 'plain');
    mkdirSync(plain);
    expect(() => resolveSiteDir({ site: plain, repoRoot, dotenv: noEnv })).toThrow(/git 仓库/);
  });

  it('指向本仓库自己时抛错', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku');
    mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
    expect(() => resolveSiteDir({ site: repoRoot, repoRoot, dotenv: noEnv })).toThrow(/自己/);
  });

  it('指向本仓库的子目录时也抛错', () => {
    const parent = tempDir();
    const repoRoot = path.join(parent, 'loredoku');
    const inner = path.join(repoRoot, 'dist');
    mkdirSync(path.join(inner, '.git'), { recursive: true });
    expect(() => resolveSiteDir({ site: inner, repoRoot, dotenv: noEnv })).toThrow(/自己/);
  });
});

describe('listThemeCodes — 只认带 manifest.json 的一级子目录', () => {
  it('列出烤进产物的主题，忽略其它目录和文件', () => {
    const dist = tempDir();
    mkdirSync(path.join(dist, 'assets'));
    mkdirSync(path.join(dist, 'hlm'));
    writeFileSync(path.join(dist, 'hlm', 'manifest.json'), '{}');
    writeFileSync(path.join(dist, 'index.html'), '<html></html>');
    mkdirSync(path.join(dist, 'broken'));
    expect(listThemeCodes(dist)).toEqual(['hlm']);
  });

  it('产物目录不存在时返回空数组', () => {
    expect(listThemeCodes(path.join(tempDir(), 'missing'))).toEqual([]);
  });
});

describe('countFiles — 递归数普通文件（发布对账用）', () => {
  it('统计嵌套文件数与源产物相等', () => {
    const dist = tempDir();
    mkdirSync(path.join(dist, 'a', 'b'), { recursive: true });
    writeFileSync(path.join(dist, 'index.html'), 'x');
    writeFileSync(path.join(dist, 'a', 'one.json'), 'x');
    writeFileSync(path.join(dist, 'a', 'b', 'two.json'), 'x');
    expect(countFiles(dist)).toBe(3);
  });
});
