import {
  BUNDLE_FORMAT,
  BUNDLE_FORMAT_VERSION,
  resolveDifficultyTiers,
  type Asset,
  type BundleAssetsFile,
  type BundleCharactersFile,
  type BundleManifest,
  type BundleManifestGame,
  type BundlePuzzleFile,
  type Character,
  type MapGameDetail,
  type ThemeDifficultyTier,
} from '@loredoku/shared';

/**
 * v0.9.0（docs/v0.9.0.md §5）—— 播放器读一个**已导出的主题资源包**。
 *
 * 这个文件里全是纯函数 + 两个 fetch：没有 React、不知道路由、不认识 axios。
 * 好处是它们能单测（`bundleLoad.test.ts` 用假的 manifest 与关卡 JSON 跑），
 * 而且「包长什么样」这一件事只在这里被解释一次。
 *
 * 包的结构（v0.8.0 §11.2，服务端 `bundleService` 产出）：
 *
 * ```
 * manifest.json          身份 + 难度分级 + 关卡清单 + 每个文件的校验和
 * theme.json             主题名 / 描述（只装身份，没有 style）
 * assets.json            全量资源，URL 已换成包内相对路径
 * characters.json        全量角色，同上
 * puzzles/<key>.json     { key, summary, map, puzzle }，引用已重编号
 * files/**               图片、封面
 * ```
 */

/**
 * 包挂在哪 —— **站点 base 之下的 `<code>/`**。
 *
 * 不硬编码 `/loredoku/`：构建产物的 base 是 `vite.player.config.ts` 里的常量，
 * 换一个部署路径（`/games/`）时这里的地址要跟着换，而 `import.meta.env.BASE_URL`
 * 是 Vite 帮我们对齐好的那一个值（以 `/` 结尾）。
 */
export function playerBase(): string {
  return import.meta.env.BASE_URL;
}

/** 包根，带结尾斜杠：`/loredoku/hlm/`。 */
export function bundleRoot(code: string): string {
  return `${playerBase()}${encodeURIComponent(code)}/`;
}

/** 包内相对路径 → 能塞进 `<img src>` 的地址。 */
export function bundleFileUrl(root: string, path: string | null | undefined): string | null {
  if (!path) return null;
  return `${root}${path.replace(/^\/+/, '')}`;
}

/**
 * 存档键的身份段（v0.8.0 §11.6 定的形状）。
 *
 * 与线上（原样用 slug）**刻意不通**：离线包里的进度不该出现在线上，反之亦然。
 * `localStorage` 里加不加前缀由 `gameProgressKey()` 那一层决定，这里只给中段。
 */
export function bundleStorageId(code: string, key: string): string {
  return `bundle:${code}:${key}`;
}

/**
 * 路由地址。返回值是**站内路径**（相对 router 的 basename）：播放器的 router 挂在
 * `/loredoku` 下，所以这里写 `/<code>/play`，浏览器里看到的完整地址是
 * `/loredoku/<code>/play`。
 */
export function themeHrefOf(code: string): string {
  return `/${code}/play`;
}

export function gameHrefOf(code: string, key: string): string {
  return `/${code}/play/${key}`;
}

/** 列表页卡片要的字段 —— 只要manifest 里那几项，不必打开关卡文件。 */
export interface BundleGameCard {
  slug: string;
  name: string;
  coverUrl: string | null;
  difficulty: number;
  gridSize: number;
}

export function toGameCard(game: BundleManifestGame, root: string): BundleGameCard {
  return {
    slug: game.key,
    name: game.name,
    coverUrl: bundleFileUrl(root, game.cover),
    difficulty: game.difficulty,
    gridSize: game.gridSize,
  };
}

/**
 * 2026-11-09 补（docs/v0.9.0.md §13）：列表页徽章上的**字与颜色**。
 *
 * 包里每关只带 `difficulty` 数字；名字、颜色、有哪几档都是主题级的，导出时冻在
 * `manifest.theme.difficultyLevels`。不读它，`DifficultyBadge` 就走内置五档 ——
 * 作者配的「初 / 通」在下载包里变成「极简 / 简单」，第 6 档以后还会显示「第 6 档」。
 *
 * 为什么在这里包一层而不是页面直接调 `resolveDifficultyTiers`：老包（v0.9.0 导出的）
 * 没有这个键，缺省 / 空数组 / 乱序三种情况都要按同一条规矩兜底 —— 那条规矩在
 * `shared/difficulty.ts`，线上 `useDifficultyTiersByCode` 用的也是它。让「包长什么样」
 * 继续只在这个文件里被解释一次。
 */
export function bundleDifficultyTiers(
  manifest: BundleManifest,
): readonly ThemeDifficultyTier[] {
  return resolveDifficultyTiers(manifest.theme.difficultyLevels);
}

/**
 * 把 `assets.json` 里的相对路径换成可用的 URL。
 *
 * **图片挂在形态（variant）上，不在资源上**（v0.6.1 §5.1：一个资源可以有几个样子），
 * 所以这里要下钻一层 —— 只改资源那一层会得到一个「名字都在、图全是破的」的画布。
 *
 * 为什么在**读包这一层**做，而不是让渲染层每次拼：画布 / 名册 / 标记三处的
 * `<img>` 都在深层组件里，各拼一次前缀，迟早漏一处；而且渲染层认的是「`imageUrl`
 * 就是能用的地址」这条老约定（v0.8.0 §11.2 的 `resolveFile` 就是干这个的）。
 */
export function resolveAssetFileUrls(assets: readonly Asset[], root: string): Asset[] {
  return assets.map((asset) => ({
    ...asset,
    variants: asset.variants.map((variant) => ({
      ...variant,
      imageUrl: bundleFileUrl(root, variant.imageUrl),
      imageThumbUrl: bundleFileUrl(root, variant.imageThumbUrl),
    })),
  }));
}

export function resolveCharacterFileUrls(characters: readonly Character[], root: string): Character[] {
  return characters.map((character) => ({
    ...character,
    avatarUrl: bundleFileUrl(root, character.avatarUrl),
    avatarThumbUrl: bundleFileUrl(root, character.avatarThumbUrl),
  }));
}

/** 关卡文件 → 页面认识的形状（`MapGameDetail` = 摘要 + 画布 + 谜题）。 */
export function toGameDetail(file: BundlePuzzleFile): MapGameDetail {
  return { ...file.summary, map: file.map, puzzle: file.puzzle };
}

/**
 * 版本对不上就直说，不要试着「尽量读」。
 *
 * 包之间没有升级关系（v0.8.0 §11.4：身份是 `exportedAt`，不是版本号），所以
 * 格式版本不同意味着「这个播放器不认识这个包」，唯一的正确做法是让作者重新导出 ——
 * 硬读只会得到一片空白画布，比一句明确的错误难查得多。
 */
export function assertBundleFormat(manifest: BundleManifest): void {
  if (manifest.format !== BUNDLE_FORMAT) {
    throw new Error(`这不是格物的主题资源包（format=${String(manifest.format)}）`);
  }
  if (manifest.formatVersion !== BUNDLE_FORMAT_VERSION) {
    throw new Error(
      `资源包格式是 v${String(manifest.formatVersion)}，这个播放器只认 v${BUNDLE_FORMAT_VERSION} —— 请用同一个版本重新导出`,
    );
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} 取不到（HTTP ${response.status}）`);
  }
  return (await response.json()) as T;
}

export async function loadManifest(root: string): Promise<BundleManifest> {
  const manifest = await fetchJson<BundleManifest>(`${root}manifest.json`);
  assertBundleFormat(manifest);
  return manifest;
}

/**
 * 一关。`key` 必须出现在 `manifest.games` 里 —— 它同时是文件名与存档键的尾段，
 * 不在清单里就是「没有这一关」，不必再去猜文件路径。
 */
export async function loadGame(
  root: string,
  manifest: BundleManifest,
  key: string,
): Promise<MapGameDetail> {
  const entry = manifest.games.find((game) => game.key === key);
  if (!entry) throw new Error(`这个主题里没有叫「${key}」的关卡`);
  const file = await fetchJson<BundlePuzzleFile>(`${root}${entry.file}`);
  return toGameDetail(file);
}

export async function loadAssets(root: string, manifest: BundleManifest): Promise<Asset[]> {
  const file = await fetchJson<BundleAssetsFile>(`${root}${manifest.assets}`);
  return resolveAssetFileUrls(file.assets, root);
}

export async function loadCharacters(
  root: string,
  manifest: BundleManifest,
): Promise<Character[]> {
  const file = await fetchJson<BundleCharactersFile>(`${root}${manifest.characters}`);
  return resolveCharacterFileUrls(file.characters, root);
}
