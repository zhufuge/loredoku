import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from './constants';
import type {
  Asset,
  Character,
  ForbiddenSymbolImage,
  GameDifficulty,
  MapDraft,
  MapGameSummary,
  ParticipantTarget,
  PuzzleDraft,
  ThemeCheckStyle,
  ThemeDifficultyTier,
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
 *
 * v0.8.6 的禁止符号不在这张表里：它是上传文件而不是资源 id，包内路径的改写发生在
 * 服务端的 `bundleService`（它要真的把文件搬进包里）。
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
  /**
   * v0.8.6：**档位数字**（v0.8.3 时是字符串标识）。导入方按自己的分级解释 ——
   * 数字对不上就显示「第 N 档」，不用猜是哪个名字。
   */
  difficulty: number;
  cover: string | null;
}

export interface BundleManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

/**
 * 包里的主题身份 + **难度分级**（2026-11-09 补，见 docs/v0.9.0.md §13）。
 *
 * `difficultyLevels` 为什么放 manifest 而不放 theme.json：播放器进列表页时已经要读
 * manifest（关卡清单在里面），再为几档名字多取一次 theme.json 不值；manifest.theme
 * 本来就把 theme.json 的 code / name / description 抄了一份，这里只是同一个做法。
 * 存的是**导出那一刻的原始配置**，排序与兜底留给读包方的 `resolveDifficultyTiers`。
 *
 * 可选而非必填：v0.9.0 导出的老包没有这个键。新播放器读老包时按「没配过」处理
 * （内置五档），所以这次是**向后兼容的加法**，不动 `BUNDLE_FORMAT_VERSION` —— 升版
 * 会让所有存量包在 `assertBundleFormat` 那里直接被拒。
 */
export interface BundleManifestTheme {
  code: string;
  name: string;
  description: string | null;
  difficultyLevels?: readonly ThemeDifficultyTier[];
  /**
   * v0.9.2 §2：长按计时环那张图（主题级，所有关卡共用一张）。
   *
   * 放在 manifest 而不是逐关复制：同一张图进 8 份没有意义，而播放器进列表页时
   * 已经读了 manifest，顺手就能拿到。`path` 是**包内相对路径**
   * （`files/ring/press-ring.webp`），由播放器拼到包根。
   *
   * 可选：没配过环的主题没有这个键，播放器画内置白弧。
   */
  pressRing?: ForbiddenSymbolImage | null;
  /**
   * v0.9.3 §3：提交校验的两档颜色与圈图。
   *
   * 与 `pressRing` 同一条「主题级共用一份」：颜色是几个字节，圈图是一张图 ——
   * 都写进 manifest，播放器不必再读 theme.json。`ring.path` 是包内相对路径
   * （`files/check/check-ring.webp`）。
   *
   * 可选：没配过的主题没有这个键，播放器按内置绿 / 红处理。
   */
  checkStyle?: ThemeCheckStyle | null;
}

export interface BundleManifest {
  format: string;
  formatVersion: number;
  exportedAt: string;
  theme: BundleManifestTheme;
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
  theme: BundleManifestTheme;
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
    theme: {
      code: input.theme.code,
      name: input.theme.name,
      description: input.theme.description,
      // 没配过就不写这个键（概览页「恢复内置五档」也是删键）：缺省主题与老包的
      // manifest 因此一个字节都不多，读包方一律按 undefined 处理。
      ...(input.theme.difficultyLevels
        ? { difficultyLevels: input.theme.difficultyLevels }
        : {}),
      // v0.9.2 §2：同一条「没配就不写键」—— 计时环是可选装饰。
      ...(input.theme.pressRing ? { pressRing: input.theme.pressRing } : {}),
      // v0.9.3 §3：校验样式同理。颜色与圈图可能只配了一半，按原样抄进去。
      ...(input.theme.checkStyle ? { checkStyle: input.theme.checkStyle } : {}),
    },
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
  const puzzle = renumberPuzzleDraft(game.puzzle, ids);
  return {
    key: game.summary.slug,
    summary: game.summary,
    /**
     * v0.9.0 §5 修正：`map` 必须是**重编号之后**的那份。
     *
     * v0.8.0 这里写的是 `map: game.map` —— 它是 `puzzle.map.data` 的原始引用
     * （服务端 `toDetail` 就是这么给的），而 `renumberPuzzleDraft` 是 clone 一份
     * 再改引用 id。于是包里出现**两份画布**：`puzzle.map.data` 里的 `assetId`
     * 是 1..N，`map` 里的还是数据库原 id。播放器读前者正常，读后者就是一张
     * 没有背景的空棋盘。
     *
     * 为什么到现在才暴露：v0.8.0 到 v0.8.7 都没有播放器，没人真的消费过这个字段；
     * v0.9.0 的播放器第一眼看到的就是它。
     */
    map: puzzle.map.data,
    puzzle,
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
 *
 * **难度分级也不在这里**（2026-11-09 补，docs/v0.9.0.md §13）：它是列表页唯一用得着的
 * 主题配置，跟着 `manifest.theme` 一起发，播放器不必为它多取一次文件。style 不能进包
 * 的理由是「会与关卡里那份不一致」；分级没有这个问题 —— 关卡里只有 `difficulty` 数字，
 * 名字与颜色只有主题这一份。
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
