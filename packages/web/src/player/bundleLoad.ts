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

/** v0.9.0（docs/v0.9.0.md §5）—— 纯函数 + fetch 读一个已导出的主题资源包：无 React / 路由 / axios，包结构只在服务端 `bundleService` 解释一次（v0.8.0 §11.2）。 */

/** 包挂在哪 —— **站点 base 之下的 `<code>/`**。 不硬编码 `/loredoku/`：构建产物的 base 是 `vite.player.config.ts` 里的常量， 换一个部署路径（`/games/`）时这里的地址要跟着换，而 `import.meta.env.BASE_URL` 是 Vite 帮我们对齐好的那一个值（以 `/` 结尾）。 */
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

/** 存档键的身份段（v0.8.0 §11.6 定的形状）。 与线上（原样用 slug）**刻意不通**：离线包里的进度不该出现在线上，反之亦然。 `localStorage` 里加不加前缀由 `gameProgressKey()` 那一层决定，这里只给中段。 */
export function bundleStorageId(code: string, key: string): string {
  return `bundle:${code}:${key}`;
}

/** 站内路径（router 挂在 `/loredoku` 下，完整地址是 `/loredoku/<code>/play/`）；结尾斜杠必须留：每个路由都是真目录，少了它先吃 301、地址栏还会跳变（v0.11.1）。 */
export function themeHrefOf(code: string): string {
  return `/${code}/play/`;
}

export function gameHrefOf(code: string, key: string): string {
  return `/${code}/play/${key}/`;
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
 * 2026-11-09 补（docs/v0.9.0.md §13）：包里每关只带 `difficulty` 数字，徽章的字与颜色取自 `manifest.theme.difficultyLevels`；老包没有这个键，缺省 / 空 / 乱序都由 `shared/difficulty.ts` 的 `resolveDifficultyTiers` 兜底。
 */
export function bundleDifficultyTiers(
  manifest: BundleManifest,
): readonly ThemeDifficultyTier[] {
  return resolveDifficultyTiers(manifest.theme.difficultyLevels);
}

/** 相对路径 → 可用 URL：图片挂在形态（variant）上而非资源上，必须下钻一层，否则画布上「名字都在、图全破」（v0.6.1 §5.1）。 */
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

/** 版本对不上就直说，不要试着「尽量读」。 包之间没有升级关系（v0.8.0 §11.4：身份是 `exportedAt`，不是版本号），所以格式版本不同意味着「这个播放器不认识这个包」，唯一的正确做法是让作者重新导出 —— 硬读只会得到一片空白画布，比一句明确的错误难查得多。 */
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

/** 一关。`key` 必须出现在 `manifest.games` 里 —— 它同时是文件名与存档键的尾段， 不在清单里就是「没有这一关」，不必再去猜文件路径。 */
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
