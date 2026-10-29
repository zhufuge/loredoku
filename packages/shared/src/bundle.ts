import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from './constants';
import type {
  Asset,
  Character,
  GameDifficulty,
  MapDraft,
  MapGameSummary,
  ParticipantTarget,
  PuzzleDraft,
} from './types/domain';
import {
  collectPuzzleThemeRefs,
  dedupeThemeRefs,
  type ThemeRefTarget,
} from './themeScope';

/**
 * v0.8.0 (docs/v0.8.0.md §11) —— 资源包的纯函数部分。
 *
 * 取材是**已部署的游戏**（§11.1）：每一关按 `MapGameDetail` 的形状来，包内只做两件事 ——
 * 引用 id 重编号（§11.3）与文件路径换成包内相对路径。IO、zip、校验和在服务端，
 * 这里只做能单测的那一半。
 */

export interface BundleGameInput {
  summary: MapGameSummary;
  map: MapDraft;
  /** 冻结的谜题版本行（含画布副本）。 */
  puzzle: PuzzleDraft;
}

/**
 * 老 id → 包内序号。三张表各一套，另存一份反向表（`originIds`，对账用，不参与渲染）。
 *
 * 为什么是**序号**而不是 `code` 字符串（§11.3）：渲染层只认
 * `assetsById: Map<number, Asset>`，换成字符串会波及画布层 / schema / 校验 / 导入导出。
 */
export interface BundleIdMaps {
  assets: Map<number, number>;
  variants: Map<number, number>;
  characters: Map<number, number>;
  originAssets: Record<string, number>;
  originCharacters: Record<string, number>;
}

function assign(map: Map<number, number>, id: number): void {
  if (map.has(id)) return;
  map.set(id, map.size + 1);
}

/**
 * 按「首次出现顺序」分配序号。顺序确定 ⇒ 同一份输入永远得到同一份包，
 * 两次导出可以直接 `diff`。
 */
export function buildBundleIdMaps(games: ReadonlyArray<BundleGameInput>): BundleIdMaps {
  const assets = new Map<number, number>();
  const variants = new Map<number, number>();
  const characters = new Map<number, number>();
  for (const game of games) {
    const refs = collectPuzzleThemeRefs(game.puzzle);
    for (const ref of dedupeThemeRefs(refs)) {
      if (ref.kind === 'asset') assign(assets, ref.id);
      else if (ref.kind === 'variant') assign(variants, ref.id);
      else assign(characters, ref.id);
    }
  }
  return {
    assets,
    variants,
    characters,
    originAssets: invert(assets),
    originCharacters: invert(characters),
  };
}

function invert(map: Map<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [origin, local] of map) out[String(local)] = origin;
  return out;
}

/** 未知引用原样保留 —— 打包前的体检会先把它拦下来，这里不做二次判断。 */
function remap(map: Map<number, number>, id: number): number {
  return map.get(id) ?? id;
}

function remapOptional(map: Map<number, number>, id: number | null | undefined): number | null {
  if (id == null) return null;
  return remap(map, id);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 把一关里所有引用改成包内序号。三处改写（§11.3）：
 *
 * ```
 * cells["3,5"].item.assetId      4165 → 1
 * cells["3,5"].item.variantId    4934 → 1
 * characterSlots[0].characterId  3062 → 3
 * linkages[0].id (type=asset)    4986 → 1
 * ```
 *
 * 画布副本里的 `map.mapId` / `map.versionNo` **不动**：它们是「画布从哪来」的追溯
 * 字段，不是引用（v0.7.1 §5.3）。
 */
export function renumberPuzzleDraft(puzzle: PuzzleDraft, ids: BundleIdMaps): PuzzleDraft {
  const next = clone(puzzle);

  for (const cell of Object.values(next.map.data.cells ?? {})) {
    if (cell.background) {
      cell.background.assetId = remap(ids.assets, cell.background.assetId);
      const variantId = remapOptional(ids.variants, cell.background.variantId);
      if (variantId == null) delete cell.background.variantId;
      else cell.background.variantId = variantId;
    }
    if (cell.item) {
      cell.item.assetId = remap(ids.assets, cell.item.assetId);
      const variantId = remapOptional(ids.variants, cell.item.variantId);
      if (variantId == null) delete cell.item.variantId;
      else cell.item.variantId = variantId;
    }
  }

  next.characterSlots = next.characterSlots.map((slot) => {
    if (!slot) return null;
    return {
      ...slot,
      characterId: remap(ids.characters, slot.characterId),
      linkages: (slot.linkages ?? []).map((linkage) => remapLinkage(linkage, ids)),
    };
  });

  return next;
}

/**
 * 联动目标的四种类型里只有两种是数据库 id：
 *
 * - `asset` → `ids.assets`；
 * - `character` → `ids.characters`（**漏掉它会得到一个指向不存在角色的包**）；
 * - `cell` 是坐标、`region` 是草稿内的区域 id（`R1` 这种），两者都跟着这一关走，照抄。
 */
function remapLinkage(linkage: ParticipantTarget, ids: BundleIdMaps): ParticipantTarget {
  switch (linkage.type) {
    case 'asset':
      return { ...linkage, id: remap(ids.assets, linkage.id) };
    case 'character':
      return { ...linkage, id: remap(ids.characters, linkage.id) };
    default:
      return linkage;
  }
}

export interface BundleManifestGame {
  /** = `game.slug`，同时是包内的关卡 key 与存档键的尾段（§11.4）。 */
  key: string;
  file: string;
  name: string;
  puzzleName: string;
  gridSize: number;
  difficulty: GameDifficulty;
  cover: string | null;
}

export interface BundleManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface BundleManifest {
  format: string;
  formatVersion: number;
  exportedAt: string;
  theme: { code: string; name: string; description: string | null };
  games: BundleManifestGame[];
  assets: string;
  characters: string;
  fonts: Array<{ family: string; builtin: boolean }>;
  files: BundleManifestFile[];
  originIds: {
    assets: Record<string, number>;
    characters: Record<string, number>;
    games: Record<string, number>;
  };
}

export interface BuildBundleManifestInput {
  theme: { code: string; name: string; description: string | null };
  exportedAt: string;
  games: BundleManifestGame[];
  files: BundleManifestFile[];
  fonts: string[];
  ids: BundleIdMaps;
  originGames: Record<string, number>;
}

/**
 * 主题不版本化（§4），所以包的身份是 `exportedAt` 而不是版本号 ——
 * 给一个假版本号只会让人以为「v2 的包能升级 v1 的包」。
 */
export function buildBundleManifest(input: BuildBundleManifestInput): BundleManifest {
  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt: input.exportedAt,
    theme: input.theme,
    games: input.games,
    assets: 'assets.json',
    characters: 'characters.json',
    fonts: input.fonts.map((family) => ({ family, builtin: true })),
    files: input.files,
    originIds: {
      assets: input.ids.originAssets,
      characters: input.ids.originCharacters,
      games: input.originGames,
    },
  };
}

/** 包内关卡文件：`summary` + 画布 + 谜题（引用已重编号）。 */
export interface BundlePuzzleFile {
  key: string;
  summary: MapGameSummary;
  map: MapDraft;
  puzzle: PuzzleDraft;
}

export function buildBundlePuzzleFile(
  game: BundleGameInput,
  ids: BundleIdMaps,
): BundlePuzzleFile {
  return {
    key: game.summary.slug,
    summary: game.summary,
    map: game.map,
    puzzle: renumberPuzzleDraft(game.puzzle, ids),
  };
}

/** 体检用：这一关引用到的资源 / 角色（重编号之前的老 id）。 */
export function bundleRefsOf(game: BundleGameInput): ThemeRefTarget[] {
  return dedupeThemeRefs(collectPuzzleThemeRefs(game.puzzle));
}

// ---- 包内那三份「侧表」（§11.2） ----

/**
 * `theme.json`：只装身份。
 *
 * **没有 `style`** —— 风格跟着每一关走（`PuzzleDraft.map.data.style` + `linkageColors`），
 * 包里再放一份就会和关卡里那份不一致，而关卡里那份才是玩家看到的。
 */
export interface BundleThemeFile {
  code: string;
  name: string;
  description: string | null;
  exportedAt: string;
}

/**
 * `assets.json` / `characters.json` 的条目就是领域对象本身，只换掉三个 URL 字段：
 *
 * - `imageUrl` / `avatarUrl`：包内相对路径（`files/assets/1-stone-paving.webp`），
 * - `imageThumbUrl` / `avatarThumbUrl`：缩略图没跟着走时是 `null`。
 *
 * 之所以不新造一套 `BundleAsset` 类型：下一版播放器的渲染层只认
 * `assetsById: Map<number, Asset>`（§11.3），类型一致就不需要适配层 ——
 * 由 `GameSource.resolveFile` 负责把相对路径拼到包根。
 */
export interface BundleAssetsFile {
  version: number;
  assets: Asset[];
}

export interface BundleCharactersFile {
  version: number;
  characters: Character[];
}
