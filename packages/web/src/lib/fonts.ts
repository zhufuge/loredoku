import {
  DEFAULT_REGION_LABEL_FONT_FAMILY,
  MAP_STYLE_FONT_FAMILY_LABELS,
  isMapStyleFontFamilyKey,
} from '@loredoku/shared';

/** v0.7.4 (docs/v0.7.4.md §2): the fonts the region-label picker offers. Only `woff2` / `woff` are read: raw `ttf` / `otf` must go through `npm run fonts` first (they are tens of MB, and the label picker does not need 20k glyphs). */

export interface BundledFontFace {
  /** CSS family name, derived from the file name. */
  family: string;
  /** File name as it sits in `src/assets/fonts/`, for debugging. */
  file: string;
  weight: number;
  style: 'normal' | 'italic';
  /** Hashed URL emitted by Vite. */
  url: string;
}

export interface FontFamilyOption {
  value: string;
  label: string;
  /** Kept as an option so the `<select>` never silently shows a different font than the one being rendered. */
  source: 'builtin' | 'bundled' | 'legacy';
}

const WEIGHT_TOKENS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  book: 400,
  regular: 400,
  normal: 400,
  roman: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
  extrablack: 950,
};

const STYLE_TOKENS = new Set(['italic', 'oblique']);

/** `Semi-Bold` 这类被 `-` 拆成两截的字重，按连写再认一遍。 */
const WEIGHT_PAIRS: Record<string, number> = {
  extralight: 200,
  ultralight: 200,
  semibold: 600,
  demibold: 600,
  extrabold: 800,
  ultrabold: 800,
  extrablack: 950,
};

/** 从文件名读字体：`<Family>[-<Weight>][-<Style>].woff2`。 `WenKai-Bold.woff2` → 字族 `WenKai`、字重 700； `Noto-Serif-SC-Regular.woff2` → 字族 `Noto Serif SC`、字重 400； `霞鹜文楷.woff2` → 字族 `霞鹜文楷`、字重 400。 只剥**尾部**的字重 / 字形词，且至少留一段当字族 —— 名字里带 `-` 的字族 (`Noto-Serif-SC`) 因此不会被拆错。 认不出的后缀当作字族的一部分。 */
export function parseFontFileName(
  fileName: string,
): { family: string; weight: number; style: 'normal' | 'italic' } | null {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  if (!base) return null;

  const tokens = base.split('-').filter((token) => token.length > 0);
  if (tokens.length === 0) return null;

  let weight = 400;
  let style: 'normal' | 'italic' = 'normal';

  for (;;) {
    if (tokens.length < 2) break;
    const last = (tokens[tokens.length - 1] ?? '').toLowerCase();
    const previous = tokens[tokens.length - 2]?.toLowerCase() ?? '';

    // `Semi-Bold` / `Extra-Light`：两截连起来才是一个字重。
    if (tokens.length > 2) {
      const pair = `${previous}${last}`;
      const pairWeight = WEIGHT_PAIRS[pair];
      if (pairWeight !== undefined) {
        weight = pairWeight;
        tokens.pop();
        tokens.pop();
        continue;
      }
    }

    const tokenWeight = WEIGHT_TOKENS[last] ?? (/^\d{3}$/.test(last) ? Number(last) : undefined);
    if (tokenWeight !== undefined) {
      weight = tokenWeight;
      tokens.pop();
      continue;
    }

    if (STYLE_TOKENS.has(last)) {
      style = 'italic';
      tokens.pop();
      continue;
    }

    break;
  }

  const family = tokens.join(' ').trim();
  return family.length > 0 ? { family, weight, style } : null;
}

/** 目录里所有字体文件 → 哈希后的 URL。 `eager` + `?url`：构建时就确定下来，不额外发请求去列目录； 也因此这是**构建 期**清单 —— 新丢进目录的字体要重新构建（dev 下 Vite 会自己 HMR）才会出现。 只收 `woff2` / `woff`：`ttf` / `otf` 会让 `dist/` 直接背上一份未压缩的源文件 （霞鹜文楷的 TTF 是 24.7 MB）。 它们该走 `npm run fonts`（`scripts/build-fonts.mjs`）， 裁完字再以 woff2 落进这里 —— 同款字体裁到 GB2312 一级是 925 KB。 */
const FONT_URLS = import.meta.glob('../assets/fonts/*.{woff2,woff}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function buildFaces(files: Record<string, string>): BundledFontFace[] {
  const faces: BundledFontFace[] = [];
  for (const [path, url] of Object.entries(files)) {
    const file = path.split('/').pop() ?? path;
    const parsed = parseFontFileName(file);
    if (!parsed) continue;
    faces.push({ ...parsed, file, url });
  }
  // 字族名 → 稳定顺序；同一字族内按字重、字形排，`@font-face` 的匹配才会唯一。
  faces.sort(
    (a, b) =>
      a.family.localeCompare(b.family, 'zh-Hans-CN') ||
      a.weight - b.weight ||
      a.style.localeCompare(b.style),
  );
  return faces;
}

export const BUNDLED_FONT_FACES: BundledFontFace[] = buildFaces(FONT_URLS);

/** 目录里出现过的字族，按名字排序、去重。 */
export function bundledFontFamilies(): string[] {
  const families: string[] = [];
  for (const face of BUNDLED_FONT_FACES) {
    if (!families.includes(face.family)) families.push(face.family);
  }
  return families;
}

/** 下拉里的名字：内置 key 用中文说明，具体字体原样显示（字体名本身就是名字）。 */
export function fontFamilyLabel(value: string): string {
  return isMapStyleFontFamilyKey(value) ? MAP_STYLE_FONT_FAMILY_LABELS[value] : value;
}

/** 选择器选项：`系统默认` + 目录里的字体。 `current` 不在列表里时补一条（`…（当前）`）—— 否则原生 `<select>` 会因为找不到匹配项而显示第一项，作者打开抽屉会看到「系统默认」高亮，而画布上画的却是另一种字体。 */
export function fontFamilyOptions(current?: string): FontFamilyOption[] {
  const options: FontFamilyOption[] = [
    {
      value: DEFAULT_REGION_LABEL_FONT_FAMILY,
      label: MAP_STYLE_FONT_FAMILY_LABELS[DEFAULT_REGION_LABEL_FONT_FAMILY],
      source: 'builtin',
    },
    ...bundledFontFamilies().map<FontFamilyOption>((family) => ({
      value: family,
      label: family,
      source: 'bundled',
    })),
  ];

  if (current && !options.some((option) => option.value === current)) {
    options.push({
      value: current,
      label: `${fontFamilyLabel(current)}（当前）`,
      source: 'legacy',
    });
  }

  return options;
}

/** 这个构建里除「系统默认」之外还有没有可选字体（给编辑器的空态提示用）。 */
export function hasBundledFonts(): boolean {
  return BUNDLED_FONT_FACES.length > 0;
}

/** 把目录里的字体注册进 `document.fonts`。 用 `FontFace` 而不是往页面里插 `<style>`：不用拼 CSS 文本，也不会和 CSP 的 inline-style 规则打架。**不主动 `load()`** —— 注册只是让字族可用，真正下载发生在第一次有文字用到它的时候，所以十个字体文件不会在首屏一起拉。 */
export function registerBundledFonts(): void {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;

  const registered = new Set<string>();
  for (const face of BUNDLED_FONT_FACES) {
    const key = `${face.family}|${face.weight}|${face.style}`;
    if (registered.has(key)) continue;
    registered.add(key);
    try {
      document.fonts.add(
        new FontFace(face.family, `url(${face.url})`, {
          weight: String(face.weight),
          style: face.style,
          display: 'swap',
        }),
      );
    } catch {
      // 浏览器不认这个字体文件：跳过它，标签按回退链继续画。
    }
  }
}

/** v0.11.3（docs/v0.11.3.md §2）—— 等自带字体真的能画了再放内容出来。 `registerBundledFonts()` 只是**登记**，下载发生在第一次有文字用到它的时候； 而播放器列表页的主题名、卡片关卡名全是 `.font-kai`，于是首帧先按回退链画一遍 （宋体/楷体），字体到了再换 —— 玩家看到的是整页文字「刷」地变一次字形。 任何一步失败都当作「已经就绪」—— 字体取不到不该把玩家卡在加载页，回退链 本来就是设计的一部分。 采样字串带上这一页一定会画的字（主题名 / 关卡名几乎都是汉字），避免用纯 ASCII 触发加载时命中的是字体里的拉丁子集、汉字仍要二次下载。 */
export async function loadBundledFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const families = bundledFontFamilies();
  if (families.length === 0) return;

  const sample = '格物定案解题成功红楼梦';
  await Promise.all(
    families.map((family) =>
      document.fonts
        .load(`400 16px "${family}"`, sample)
        .catch(() => null),
    ),
  );
  await document.fonts.ready.catch(() => undefined);
}
