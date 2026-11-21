import { describe, expect, it } from 'vitest';
import { playerPages, withTitle } from './staticPages.mjs';

/** v0.11.1（docs/v0.11.1.md）：每个路由一份真 HTML。 这里钉的是**产物里会出现哪些地址、标题是什么**，不是 HTML 长什么样 —— 页面内容就是同一份入口模板。最重要的是「地址清单与路由一致」：清单少一个就是一处深链 404，多一个就是一份白拿的文件。 */

const MANIFEST = {
  code: 'hlm',
  themeName: '红楼梦',
  games: [
    { key: 'puzzle-hlm-sishan', name: '撕扇子作千金一笑' },
    { key: 'puzzle-hlm-shilin', name: '因麒麟伏白首双星' },
  ],
};

describe('playerPages — 路由清单', () => {
  it('列表页一份 + 每一关一份', () => {
    expect(playerPages(MANIFEST)).toEqual([
      { dir: 'hlm/play', title: '红楼梦 · 格物' },
      { dir: 'hlm/play/puzzle-hlm-sishan', title: '撕扇子作千金一笑 · 格物' },
      { dir: 'hlm/play/puzzle-hlm-shilin', title: '因麒麟伏白首双星 · 格物' },
    ]);
  });

  it('没有关卡时只出列表页', () => {
    expect(playerPages({ code: 'hlm', themeName: '红楼梦', games: [] })).toEqual([
      { dir: 'hlm/play', title: '红楼梦 · 格物' },
    ]);
  });

  it('目录名带主题编码 —— 一个产物一个主题，地址里要有那一段', () => {
    for (const page of playerPages(MANIFEST)) {
      expect(page.dir.startsWith('hlm/')).toBe(true);
    }
  });

  it('关卡 key 直接当目录名，不做 URL 编码（否则目录名与请求对不上）', () => {
    const pages = playerPages({ ...MANIFEST, games: [{ key: 'a.b_c-D1', name: 'x' }] });
    expect(pages[1]?.dir).toBe('hlm/play/a.b_c-D1');
  });
});

describe('playerPages — 不能当目录名的值一律报错', () => {
  const bad = [
    { name: '空主题编码', input: { code: '', themeName: 't', games: [] } },
    { name: '主题编码带斜杠', input: { code: 'a/b', themeName: 't', games: [] } },
    { name: '主题编码是 ..', input: { code: '..', themeName: 't', games: [] } },
    { name: '关卡 key 带斜杠', input: { ...MANIFEST, games: [{ key: 'a/b', name: 'x' }] } },
    { name: '关卡 key 带 ..', input: { ...MANIFEST, games: [{ key: '..', name: 'x' }] } },
    { name: '关卡 key 带空格', input: { ...MANIFEST, games: [{ key: 'a b', name: 'x' }] } },
    { name: '关卡 key 为空', input: { ...MANIFEST, games: [{ key: '', name: 'x' }] } },
  ];
  for (const { name, input } of bad) {
    it(name, () => {
      expect(() => playerPages(input)).toThrow();
    });
  }

  it('关卡 key 重复时报错（不当静默覆盖处理）', () => {
    expect(() =>
      playerPages({
        ...MANIFEST,
        games: [
          { key: 'same', name: 'a' },
          { key: 'same', name: 'b' },
        ],
      }),
    ).toThrow(/重复/);
  });
});

describe('withTitle — 换标题，别的一律不动', () => {
  const TEMPLATE =
    '<!doctype html>\n<html>\n  <head>\n    <title>格物</title>\n' +
    '    <script>var a = 1;</script>\n  </head>\n  <body><div id="root"></div></body>\n</html>\n';

  it('替掉原 <title>，其余逐字节不变', () => {
    const out = withTitle(TEMPLATE, '红楼梦 · 格物');
    expect(out).toBe(TEMPLATE.replace('<title>格物</title>', '<title>红楼梦 · 格物</title>'));
  });

  it('跨行的 <title> 也能替掉', () => {
    const html = '<head><title>\n  格物\n</title></head>';
    expect(withTitle(html, 'X')).toBe('<head><title>X</title></head>');
  });

  it('没有 <title> 时补一个进 <head>', () => {
    expect(withTitle('<html><head></head><body></body></html>', 'X')).toContain('<title>X</title>');
  });

  it('标题里的 HTML 特殊字符被转义（标题来自作者填的自由文本）', () => {
    expect(withTitle('<title>t</title>', 'a<b>&"c"')).toBe(
      '<title>a&lt;b&gt;&amp;&quot;c&quot;</title>',
    );
  });
});
