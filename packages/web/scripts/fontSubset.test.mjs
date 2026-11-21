import { describe, expect, it } from 'vitest';
import {
  ALWAYS_INCLUDED,
  buildSubsetText,
  collectCharacters,
  collectOutputText,
  findFontAssets,
  renamedFontFile,
  replaceReferences,
} from './fontSubset.mjs';

/** v0.11.3（docs/v0.11.3.md §1）—— 播放器字体按「这一包真正用到的字」裁剪。 这里钉的是**字符集怎么算、文件名怎么换、引用怎么跟着换**；真正裁剪出多少字节是字体引擎的事（`subset-font`），不在这里断言。 */

describe('ALWAYS_INCLUDED — 无条件保留的那批字', () => {
  it('包含整个 ASCII 可打印区', () => {
    for (let code = 0x20; code <= 0x7e; code += 1) {
      expect(ALWAYS_INCLUDED).toContain(String.fromCharCode(code));
    }
  });

  it('包含中文排版常用标点', () => {
    for (const char of '　、。「」《》·—…×÷°±') expect(ALWAYS_INCLUDED).toContain(char);
  });
});

describe('collectCharacters — 从任意结构里捞字', () => {
  it('字符串逐字拆开', () => {
    expect([...collectCharacters('红楼梦')]).toEqual(['红', '楼', '梦']);
  });

  it('数组与嵌套对象一层层走下去', () => {
    const found = collectCharacters({ a: ['撕扇子'], b: { c: '作千金一笑', d: null, e: 7 } });
    expect([...found].sort().join('')).toBe([...'撕扇子作千金一笑'].sort().join(''));
  });

  it('没有字符串时什么也不捞', () => {
    expect([...collectCharacters({ a: 1, b: true, c: null })]).toEqual([]);
  });
});

describe('buildSubsetText — 合成裁剪字符集', () => {
  it('去重、按码位排序', () => {
    const text = buildSubsetText(['梦红', '红楼梦']);
    const han = [...text].filter((char) => char >= '\u4e00' && char <= '\u9fff');
    // 梦 U+68A6 < 楼 U+697C < 红 U+7EA2
    expect(han.join('')).toBe('梦楼红');
  });

  it('同样的输入产出同样的字节（顺序稳定）', () => {
    const a = buildSubsetText(['春节', '贴春联']);
    const b = buildSubsetText([{ x: '联春贴' }, '节春']);
    expect(a).toBe(b);
  });

  it('空格与标点始终在', () => {
    const text = buildSubsetText(['一']);
    expect(text).toContain(' ');
    expect(text).toContain('。');
  });
});

describe('findFontAssets — 产物里要裁的字体', () => {
  const bundle = {
    'assets/a.woff2': { type: 'asset', fileName: 'assets/a.woff2' },
    'assets/b.woff': { type: 'asset', fileName: 'assets/b.woff' },
    'assets/c.ttf': { type: 'asset', fileName: 'assets/c.ttf' },
    'assets/player.js': { type: 'chunk', fileName: 'assets/player.js' },
    'index.html': { type: 'asset', fileName: 'index.html' },
  };

  it('挑出字体资源，跳过 chunk 与其他资源', () => {
    expect(findFontAssets(bundle).sort()).toEqual(['assets/a.woff2', 'assets/b.woff', 'assets/c.ttf']);
  });

  it('没有字体时返回空数组', () => {
    expect(findFontAssets({ 'index.html': { type: 'asset', fileName: 'index.html' } })).toEqual([]);
  });
});

describe('collectOutputText — 字符集来源之二', () => {
  it('收 chunk 的 code 与文本类资源', () => {
    const parts = collectOutputText({
      'assets/player.js': { type: 'chunk', code: 'const a="定案"' },
      'hlm/manifest.json': { type: 'asset', fileName: 'hlm/manifest.json', source: '{"name":"红楼梦"}' },
      'images/a.webp': { type: 'asset', fileName: 'images/a.webp', source: Buffer.from([0, 1, 2]) },
    });
    expect(parts.join('')).toContain('定案');
    expect(parts.join('')).toContain('红楼梦');
    expect(parts).toHaveLength(2);
  });
});

describe('renamedFontFile — 换名才能换内容', () => {
  it('在扩展名前插哈希', () => {
    expect(renamedFontFile('assets/a-CfZXyrS6.woff2', 'deadbeef')).toBe(
      'assets/a-CfZXyrS6-deadbeef.woff2',
    );
  });

  it('没有扩展名时直接缀在后面', () => {
    expect(renamedFontFile('assets/font', 'deadbeef')).toBe('assets/font-deadbeef');
  });
});

describe('replaceReferences — 引用跟着换名走', () => {
  it('原样与 URL 编码两种写法都换', () => {
    const from = 'assets/霞鹜文楷-Regular-CfZXyrS6.woff2';
    const to = 'assets/霞鹜文楷-Regular-CfZXyrS6-fd8f000d.woff2';
    const source = `a="${from}" b="${encodeURI(from)}"`;
    const next = replaceReferences(source, from, to);
    expect(next).toContain(`a="${to}"`);
    expect(next).toContain(`b="${encodeURI(to)}"`);
    expect(next).not.toContain(from);
  });

  it('没有引用时原样返回', () => {
    expect(replaceReferences('const a=1', 'x.woff2', 'y.woff2')).toBe('const a=1');
  });
});
