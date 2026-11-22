import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from './constants';
import type {
  Asset,
  Character,
  MapDraft,
  MapGameSummary,
  ParticipantTarget,
  PuzzleDraft,
  ThemeCheckColors,
  ThemeDifficultyTier,
  ThemeRing,
  ThemeVerdict,
  ThemeGameListTexts,
} from './types/domain';
import {
  collectPuzzleThemeRefs,
  dedupeThemeRefs,
  type ThemeRefTarget,
} from './themeScope';

/** v0.8.0 (docs/v0.8.0.md §11) —— 资源包的纯函数部分。 取材是**已部署的游戏**（§11.1）：每一关按 `MapGameDetail` 的形状来，包内只做两件事 —— 引用 id 重编号（§11.3）与文件路径换成包内相对路径。IO、zip、校验和在服务端， 这里只做能单测的那一半。 */

export interface BundleGameInput {
  summary: MapGameSummary;
  map: MapDraft;
  /** 冻结的谜题版本行（含画布副本）。 */
  puzzle: PuzzleDraft;
}

/** 老 id → 包内序号。三张表各一套，另存一份反向表（`originIds`，对账用，不参与渲染）。 为什么是**序号**而不是 `code` 字符串（§11.3）：渲染层只认 `assetsById: Map<number, Asset>`，换成字符串会波及画布层 / schema / 校验 / 导入导出。 */
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

/** 按「首次出现顺序」分配序号。顺序确定 ⇒ 同一份输入永远得到同一份包， 两次导出可以直接 `diff`。 */
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

/** 把一关里所有引用（item / variant / character / linkage）改成包内序号（§11.3）；画布副本里的 `map.mapId` / `map.versionNo` **不动** —— 它们是追溯字段，不是引用（v0.7.1 §5.3）；上传文件（标记等）的包内路径由服务端 `bundleService` 改写。 */
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
    // 背景修饰层：漏掉它，包里的这一格还指着数据库原 id，
    // 而 assets.json 里那个资源根本不存在（collectMapThemeRefs 没收它）。
    if (cell.decoration) {
      cell.decoration.assetId = remap(ids.assets, cell.decoration.assetId);
      const variantId = remapOptional(ids.variants, cell.decoration.variantId);
      if (variantId == null) delete cell.decoration.variantId;
      else cell.decoration.variantId = variantId;
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

/** 联动目标的四种类型里只有两种是数据库 id：；`asset` → `ids.assets`；；`character` → `ids.characters`（**漏掉它会得到一个指向不存在角色的包**）；；`cell` 是坐标、`region` 是草稿内的区域 id（`R1` 这种），两者都跟着这一关走，照抄。 */
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
  /** 难度是**档位数字**。导入方按自己的分级解释 —— 数字对不上就显示「第 N 档」，不用猜是哪个名字。 */
  difficulty: number;
  cover: string | null;
}

export interface BundleManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

/**
 * 包里的主题身份 + **难度分级**（见 docs/v0.9.0.md §13）：存**导出那一刻的原始配置**，排序与兜底留给读包方的 `resolveDifficultyTiers`。放 manifest 是因为播放器进列表页已经要读它。可选键 —— 老包没有它，所以**不动 `BUNDLE_FORMAT_VERSION`**（升版会让所有存量包在 `assertBundleFormat` 被拒）。
 */
export interface BundleManifestTheme {
  code: string;
  name: string;
  description: string | null;
  difficultyLevels?: readonly ThemeDifficultyTier[];
  /**
   * v0.9.2 §2；v0.9.5 起与提交校验圈**合并成一套**（`ThemeRing`）。放在 manifest 而不是逐关复制：播放器进列表页已经读过 manifest。`image.path` 是**包内相对路径**（`files/ring/ring.webp`）。可选 —— 没配过环的主题没有这个键；老包的 `pressRing` / `checkStyle.ring` 由 `migrateLegacyBundleRing` 换成这个形状。
   */
  ring?: ThemeRing | null;
  /** v0.9.3 §3；v0.9.5 起只剩两档颜色（圈图并进 `ring`）。 与 `ring` 同一条「主题级共用一份」：颜色是几个字节，都写进 manifest，播放器不必再读 theme.json。 可选：没配过的主题没有这个键，播放器按内置绿 / 红处理。 */
  checkStyle?: ThemeCheckColors | null;
  /** 结算卡通过那一面的图标与标题。 与 `ring` / `checkStyle` 同一条「主题级共用一份」：它不随关卡变，进 manifest 之后播放器结算时不必再读一次 theme.json。`icon.path`（若配了图）是**包内相对路径**（`files/verdict/verdict.webp`）。 可选：没配过的主题没有这个键，结算卡画内置 🎉 + 「解题成功」。 */
  verdict?: ThemeVerdict | null;
  /** 游戏列表页那两行字的模板（「N 关可玩」/「已通过 N 关」）。 与 `verdict` 同一条规矩：没配过的主题没有这个键，列表页用内置那两句。 文案随包走，于是**不重新导出**就改不掉 —— 这是有意的：包是一份可离线运行的快照，它说的话应该和导出那一刻一致。 */
  gameList?: ThemeGameListTexts | null;
  /**
   * 列表页标题的字体（v0.11.10）。与 `gameList` 同一条规矩：跟着包走，不重新导出就改不掉。
   * 可选 —— 老包没有这个键，标题按页面缺省的衬线画。
   */
  fontFamily?: string;
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

/** 主题不版本化（§4），所以包的身份是 `exportedAt` 而不是版本号 —— 给一个假版本号只会让人以为「v2 的包能升级 v1 的包」。 */
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
      // v0.9.2 §2 / v0.9.5：同一条「没配就不写键」—— 那一圈是可选装饰。
      ...(input.theme.ring ? { ring: input.theme.ring } : {}),
      // v0.9.3 §3：校验颜色同理。只配了颜色没配图是常态。
      ...(input.theme.checkStyle ? { checkStyle: input.theme.checkStyle } : {}),
      // 结算卡的图标与标题，同一条「没配就不写键」。
      ...(input.theme.verdict ? { verdict: input.theme.verdict } : {}),
      // 列表页那两行字的模板，同一条「没配就不写键」。
      ...(input.theme.gameList ? { gameList: input.theme.gameList } : {}),
      // 列表页标题的字体（v0.11.10），同理。
      ...(input.theme.fontFamily ? { fontFamily: input.theme.fontFamily } : {}),
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
     * v0.9.0 §5 修正：`map` 必须是**重编号之后**的那份 —— `game.map` 是 `puzzle.map.data` 的**原始**引用，照抄会让包里出现两份画布（`puzzle.map.data` 里 `assetId` 是 1..N，`map` 里还是数据库原 id），播放器读后者就是一张没有背景的空棋盘。
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
 * `theme.json`：只装身份 —— **没有 `style`**（风格跟着每一关走，包里再放一份就会和关卡里那份不一致，而玩家看到的是关卡里那份）；**难度分级也不在这里**，随 `manifest.theme` 发（docs/v0.9.0.md §13）。
 */
export interface BundleThemeFile {
  code: string;
  name: string;
  description: string | null;
  exportedAt: string;
}

/**
 * `assets.json` / `characters.json` 的条目就是领域对象本身，只换三个 URL 字段：`imageUrl` / `avatarUrl` 是**包内相对路径**（由 `GameSource.resolveFile` 拼到包根），缩略图没跟着走时 `*ThumbUrl` 是 `null`。不新造 `BundleAsset` 类型 —— 播放器渲染层只认 `assetsById: Map<number, Asset>`（§11.3）。
 */
export interface BundleAssetsFile {
  version: number;
  assets: Asset[];
}

export interface BundleCharactersFile {
  version: number;
  characters: Character[];
}
