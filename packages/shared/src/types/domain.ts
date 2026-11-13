import type {
  EFFECT_TYPES,
  EDITOR_TOOLS,
  CARD_ROTATIONS,
  ASSET_TYPES,
  ASSET_FIT_MODES,
  EDITOR_LAYERS,
  MAP_STATUSES,
  CHARACTER_GENDERS,
  PARTICIPANT_TARGET_TYPES,
  EFFECT_COLORS,
  GAME_DIFFICULTY_LEVELS,
  MapLinkageColor,
  MapStyle,
  RegionStyleOverride,
} from '../constants';

export type EffectType = (typeof EFFECT_TYPES)[number];
export type EditorTool = (typeof EDITOR_TOOLS)[number];
export type CardRotation = (typeof CARD_ROTATIONS)[number];
/** v0.6.0: `background` | `item` — an asset's kind, and the layer it may be placed on. */
export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetFitMode = (typeof ASSET_FIT_MODES)[number];
export type EditorLayer = (typeof EDITOR_LAYERS)[number];
export type MapStatus = (typeof MAP_STATUSES)[number];
export type CharacterGender = (typeof CHARACTER_GENDERS)[number];
export type ParticipantTargetType = (typeof PARTICIPANT_TARGET_TYPES)[number];
export type GameDifficulty = (typeof GAME_DIFFICULTY_LEVELS)[number];
/**
 * The built-in linkage colour keys (`red` / `blue`). v0.3.8 FEAT-D04 makes the
 * palette extensible, so a linkage may reference **any** key declared in the
 * map's `style.linkageColors` — see {@link LinkageColorKey}.
 */
export type EffectColor = (typeof EFFECT_COLORS)[number];
/** A linkage colour reference: the `key` of a `MapStyle.linkageColors` entry. */
export type LinkageColorKey = string;

/** A `(x, y)` grid coordinate. */
export interface CellCoord {
  x: number;
  y: number;
}

// ---- API DTOs (camelCase) ----
export interface MapEntry {
  id: number;
  name: string;
  description: string | null;
  /**
   * v0.8.0（docs/v0.8.0.md §5 / §16.8）：这一行属于哪个主题。编辑器的「基本信息」
   * 抽屉要拿它去读主题的缺省风格，才知道「这张图还吃着主题风格吗、差在哪」。
   *
   * v0.8.0 §19：接口上**只给编码**。`theme_id` 是数据库的主键，不出接口 —— 主题在
   * 地址（`/hlm/maps`）与资源包 manifest 里都是编码，两套标识并存只会让调用方各挑一个。
   */
  themeCode: string;
  /**
   * 画布尺寸不是列，真源是草稿里的 `data.gridSize`。`null` = 尚未初始化
   * （创建时不填尺寸，第一次进编辑器时由初始化弹窗写入）。
   */
  gridSize: number | null;
  coverPath: string | null;
  coverUrl: string | null;
  /**
   * 这两个字段由 `version` 推导（字段名保留，前端按旧形状读取）。血统里
   * 没有版本行时 `status = 'draft'`。
   */
  status: MapStatus;
  /** 血统内最高版本号（含软删行）；没有版本行时为 `null`。 */
  currentVersionNo: number | null;
  /** 该行自己的版本号：版本行 = `Number(version)`，草稿行 = `null`。 */
  versionNo: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MapDetail extends MapEntry {
  cardCount: number;
  regionCount: number;
  itemCount: number;
  characterCount: number;
  versionCount: number;
}

/** `EffectType` stays — participant linkages still use it. */

/**
 * v0.6.1: the appearance half of an asset. It lives on a **variant**, never on the
 * asset itself (docs/v0.6.1.md §5.1) — one asset may carry several looks.
 *
 * v0.7.6: the four upload-receipt columns (`imageMime` / `imageSize` /
 * `imageWidth` / `imageHeight`) are gone (docs/v0.7.6.md §9) — the mime is the
 * path's extension, and the other three only fed one line of uploader copy.
 */
export interface AssetAppearance {
  fitMode: AssetFitMode;
  imagePath: string | null;
  imageUrl: string | null;
  imageThumbUrl: string | null;
  /** v0.5.1 FEAT-L01: colour-block colour (`#RRGGBB`); `null` = image mode. */
  bgColor: string | null;
}

/**
 * v0.6.1: one way an asset can look on the canvas. An asset always has at least
 * one.
 *
 * v0.7.6: the four upload-receipt columns are gone — the image is just its path.
 * v0.10.6: `w` / `h` come back, but this time on the **variant** as an optional
 * pair (缺省 1×1) — a bed that spans two cells is a property of the look, not
 * of one placement. Optional so older bundles and every literal test fixture
 * keep working; the single default lives in `resolveVariantFootprint()`.
 * Only items use it; a background variant always resolves to 1×1.
 */
export interface AssetVariant extends AssetAppearance {
  id: number;
  assetId: number;
  name: string;
  /** v0.10.6: 占格宽（格）；缺省 1。 */
  w?: number;
  /** v0.10.6: 占格高（格）；缺省 1。 */
  h?: number;
  /** Palette order; the list response is sorted by `sortOrder, id`. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: number;
  code: string;
  name: string;
  /** v0.6.0: was `category`; the values are the two canvas layers. */
  type: AssetType;
  /** v0.6.0: was `canStand`, inverted — `true` = 阻挡（不可站立/不可放置）. */
  blocking: boolean;
  isActive: boolean;
  /** v0.6.1: never empty; ordered by `sortOrder, id`. */
  variants: AssetVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: number;
  code: string;
  name: string;
  gender: CharacterGender;
  description: string | null;
  avatarPath: string | null;
  avatarUrl: string | null;
  avatarThumbUrl: string | null;
  /** v0.5.1 FEAT-L02: colour-block colour (`#RRGGBB`); `null` = image mode. */
  bgColor: string | null;
  /**
   * v0.7.13 (docs/v0.7.13.md §11): the 主题色 this character brings into a
   * roster slot when it is 加入'd as a participant; `null` = no default, the
   * slot falls back to `DEFAULT_THEME_COLOR`. It is **not** the character's
   * own look — that is `bgColor`.
   */
  color: string | null;
  /**
   * v0.7.13 (docs/v0.7.13.md §11): the 编号 shown in the slot badge instead of
   * the sequence number; `null` = no default. Bounded by
   * {@link CHARACTER_DISPLAY_NAME_MAX}.
   */
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- Map draft JSON (single-column storage, see docs/feature-0.2.md §FEAT-06) ----
/**
 * A background cell: one asset, no footprint (it fills the single cell).
 *
 * v0.6.1: `variantId` names which of the asset's variants was painted. Optional so a
 * payload written before background assets could have several variants keeps
 * validating — rendering then falls back to the asset's first variant
 * (docs/v0.6.1.md §6.2).
 */
export interface DraftAssetRef {
  assetId: number;
  variantId?: number;
}

/**
 * v0.6.0: the item layer. The anchor cell stores the footprint (`w` × `h`).
 *
 * v0.6.1: `variantId` names the asset **variant** that was placed. It is optional so a
 * v4 payload (written before variants existed) keeps validating — rendering then
 * falls back to the asset's first variant (docs/v0.6.1.md §6.2).
 */
export interface DraftAnchorItem {
  assetId: number;
  variantId?: number;
  w: number;
  h: number;
  /**
   * v0.7.5 (docs/v0.7.5.md §3): the **display** transform — uniform scale and a
   * cell-unit offset that may push the artwork outside the footprint. All three
   * are optional and absent means identity (`1` / `0` / `0`); the footprint is
   * untouched, so occupancy, erasing and collision keep reading `w` × `h`.
   */
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface DraftCell {
  background?: DraftAssetRef;
  /** v0.6.0: was `object` — the item layer. */
  item?: DraftAnchorItem;
  /** v0.6.0: was `objectRef`. */
  itemRef?: string;
}

export interface DraftRegion {
  id: string;
  name: string;
  cells: Array<[number, number]>;
  labelCell?: [number, number] | null;
  /**
   * v0.7.0 (docs/v0.7.0.md §4): the region's own display style — a deep partial
   * over the map-level defaults (`MapStyle.regionOutline` / `regionHighlight` /
   * `regionLabel`). Absent = the defaults win; a present block records only what
   * differs. Replaces the old flat `color` / `borderWidth` / `fillOpacity`.
   */
  style?: RegionStyleOverride;
}

// ---- Participant linkage (docs/v0.3.1.md CLAR-603, updated v0.3.3 MOD-801) ----
/**
 * v0.3.8 FEAT-D04: `color` is a **palette key** from `MapDraft.style.linkageColors`
 * (the built-in `red` / `blue` keys keep older drafts valid), no longer a
 * closed `'red' | 'blue'` enum.
 */
export type ParticipantTarget =
  | { type: 'character'; id: number; effect: EffectType; color: LinkageColorKey }
  | {
      /** v0.6.0: was `item` — a linkage points at a resource, not at a placed item. */
      type: 'asset';
      id: number;
      /** MOD-708: `'all'` highlights every instance of `assetId`; `'instances'` only `instances`. */
      scope: 'all' | 'instances';
      /** Coordinates of specific instances when `scope === 'instances'`. */
      instances?: Array<[number, number]>;
      effect: EffectType;
      color: LinkageColorKey;
    }
  | {
      type: 'cell';
      cells: Array<[number, number]>;
      effect: EffectType;
      color: LinkageColorKey;
    }
  | { type: 'region'; id: string; effect: EffectType; color: LinkageColorKey };

/**
 * CLAR-603: participants never enter the map. A roster slot carries the
 * participant configuration directly. `null` represents an empty slot.
 * The roster length equals `gridSize`.
 */
export interface CharacterSlotEntry {
  characterId: number;
  /** Participant theme colour, defaults to `#FFFFFF`. MOD-710: no blue restriction. */
  themeColor?: string;
  /** MOD-702: one-line clue shown below the avatar; supports `**bold**` syntax. */
  clue?: string;
  /**
   * MOD-801: flat list of highlight linkages. The v0.3.2 click/touch
   * grouping (`triggers`) is gone — hover and click both play the whole
   * list (docs/v0.3.3.md MOD-802).
   */
  linkages?: ParticipantTarget[];
  /**
   * FEAT-E01 (docs/v0.4.1.md §7): the cells this participant is allowed to
   * occupy. Several entries are OR-ed; an empty / missing list means "no
   * positional constraint". Stored inside the draft JSON, so it rides along
   * into the published snapshot with no extra table.
   */
  positionConditions?: Array<{ x: number; y: number }>;
  /**
   * v0.6.4 (docs/v0.6.4.md §2): the text shown in the slot's top-left 编号
   * badge instead of the sequence number. Configured per participant in the
   * 参与者信息 drawer; absent / empty / null = the sequence number, which is
   * derived from the slot's position and therefore changes when the roster is
   * rearranged — the configured text never does, because it lives on the entry
   * and the entry moves with its participant.
   */
  displayNumber?: string | null;
}

/**
 * Backward-compatible alias kept while callers migrate to {@link CharacterSlotEntry}.
 * Structurally assignable because the new fields are optional.
 */
export type CharacterSlot = { characterId: number };

export interface MapDraft {
  version: number;
  gridSize: number;
  cells: Record<string, DraftCell>;
  regions: DraftRegion[];
  /**
   * v0.3.8 FEAT-D02: map-level display constants. Optional so `version = 1`
   * drafts stay valid — a missing block resolves to `DEFAULT_MAP_STYLE`.
   *
   * v0.5.0 FEAT-K14: the roster (`characterSlots`) and the linkage palette
   * (`style.linkageColors`) are **gone** — they moved to {@link PuzzleDraft}.
   */
  style?: MapStyle;
}

// ---- Puzzle draft JSON ----
/**
 * v0.7.1 (docs/v0.7.1.md §5.3): the canvas a puzzle was created from —
 * **source info for display only** (no FK) plus a **copy of the board**, so a
 * published puzzle is self-contained and can be frozen.
 *
 * The copy is the only truth for the puzzle's grid size
 * (`map.data.gridSize`, 高压线 4) — never a column, never `map.versionNo`.
 */
export interface PuzzleMapSnapshot {
  /** The `maps` row id this canvas was copied from (traceability only). */
  mapId: number;
  /** The version number it was copied from. */
  versionNo: number;
  /** That version's name at copy time (shown in the puzzle header). */
  mapName: string;
  /** The copied canvas (`MapDraft`, v7 shape). */
  data: MapDraft;
}

/**
 * v0.5.0 FEAT-K01: a puzzle is the "出题" half of the product. It owns the
 * roster + palette and — since v0.7.1 — a **copy** of the map canvas it was
 * created from (see {@link PuzzleMapSnapshot}).
 */
export interface PuzzleDraft {
  /** `PUZZLE_JSON_VERSION` — import / export and migration. */
  version: number;
  /** The copied canvas + where it came from. */
  map: PuzzleMapSnapshot;
  name: string;
  description: string;
  /** Linked theme-colour palette (was `MapDraft.style.linkageColors`). */
  linkageColors: MapLinkageColor[];
  /** Roster; length = `map.data.gridSize` (same convention as the map editor). */
  characterSlots: Array<CharacterSlotEntry | null>;
  /**
   * v0.6.3 (docs/v0.6.3.md §3): how many columns the roster matrix uses.
   * The row count is **derived** from it (`ceil(slots / cols)`) and never
   * stored — one number, one source of truth.
   *
   * `null` / absent = 自动: the panel picks a golden-ratio column count and
   * still shrinks it to fit its container. That is what every puzzle created
   * before this version does, which is why the field is optional.
   */
  rosterCols?: number | null;
  /**
   * v0.7.14（docs/v0.7.14.md §2）：**全局线索** —— 整个谜题共享的几条条件，
   * 与参与者各自的 `characterSlots[].clue` 分属两层：那条讲「这位住在哪」，
   * 这条讲「这盘按什么规则摆」。玩家侧把它们和描述一起贴在盘面左上角。
   *
   * **可选**：v0.7.14 之前发布的游戏行是一份冻住的 JSON，没有这个键。
   * 读的地方一律 `?? []`，不假设服务端补过默认值。
   */
  clues?: string[];
  /** v0.7.14：结束语 —— 玩家通过时出现在结算弹窗里的一句话。缺失 = 不显示。 */
  ending?: string;
  /**
   * v0.8.6（docs/v0.8.6.md §4 / v0.8.7 §4；v0.9.5 更名）：「标记」用哪张图。
   *
   * 这是**覆盖值**：配了就用它，缺席（或 `null`）就跟随主题的
   * `data.mark` —— 两者都没有才是放置层那枚 `×` 字形。作者在谜题编辑器的
   * 「基本操作」模块里上传一张，就是给这一题单独换一张；`null` 表示「回到跟随
   * 主题」，而不是「强制 ×」。
   *
   * 名字从 `forbiddenSymbol` 改成 `mark`（v0.9.5）：玩家做的是「标一下这格排除」，
   * 界面上的动词是「标记」；`forbidden` 是它落下去之后的语义，不是按钮的名字。
   *
   * **可选** —— v0.8.6 之前发布的谜题版本行里没有这个键。v0.8.7 起新建谜题也不再
   * 把主题那张拷进草稿（拷贝会让「主题换图」停在建题那一天）。
   *
   * 旧键 `forbiddenSymbol` 由 `withLegacyImageKeys` 在读入时搬过来（冻结的版本行、
   * 旧导出包还带着它）。
   */
  mark?: UploadedImage | null;
  /**
   * v0.8.7 §7：这一关的工具按钮画什么（清除 / 撤回 / 提交）。
   *
   * 与 {@link PuzzleDraft.mark} 同一套语义：这是**覆盖值**，缺席就跟随主题的
   * `ThemeData.toolIcons`，两边都没有才用内置图标。**可选** —— v0.8.7 之前的
   * 草稿与版本行里没有这个键。
   */
  toolIcons?: GameToolIcons | null;
}

export interface MapResponse {
  map: MapEntry;
  /**
   * `null` = 这张地图还没初始化（创建地图时不写草稿）。编辑器据此弹
   * 「初始化地图」弹窗：填尺寸，或导入一份地图。
   */
  draft: MapDraft | null;
}

export interface MapVersionSummary {
  id: number;
  versionNo: number;
  /** v0.5.8: 列删了，从快照 `data.gridSize` 派生。 */
  gridSize: number;
  publishedAt: string;
  /**
   * Snapshot totals shown on the version-history panel (docs/v0.3.0.md
   * FEAT-503). v0.5.0: participants moved to puzzles, so this is > 0 only for
   * legacy snapshots that still carry a roster.
   */
  participantCount: number;
  regionCount: number;
  itemCount: number;
}

export interface MapVersionDetail extends MapVersionSummary {
  data: MapDraft;
  /**
   * OPT-G01 (docs/v0.4.0.md §2): the name of the map this version was
   * published from, so the preview page can title itself with the map name
   * and show the version as a badge. Joined from `maps`.
   */
  mapName: string;
}

/**
 * SPEC-K13 §7.4 (docs/v0.5.0.md): one row of the editor's 版本历史 panel. With
 * Q3 = B a lineage spans several `maps` rows, so each version carries
 * the row that owns it — that is what 「编辑此版本」 forks from.
 */
export interface MapVersionEntry extends MapVersionSummary {
  /**
   * 版本行自己就是 `maps` 行，所以这里就是**版本行 id**
   * （合并前是「拥有它的工作条目 id」）。
   */
  mapId: number;
}

/**
 * FEAT-K03 (docs/v0.5.0.md §2.4): one option of the 「地图版本」 picker in the
 * create-puzzle dialog — a **published** map version and nothing else.
 */
export interface PublishedMapVersion {
  mapId: number;
  rootId: number;
  versionNo: number;
  mapName: string;
  /** v0.5.8: 列删了，从快照 `data.gridSize` 派生。 */
  gridSize: number;
  publishedAt: string;
  /**
   * v0.8.0（docs/v0.8.0.md §16.7）：这张图属于哪个主题 —— `新建谜题` 对话框里
   * 那枚**只读**胶囊就靠它说话（谜题的主题由底图决定，作者在这一步选不了）。
   * §19 起是编码，不是主键。
   */
  themeCode: string;
}

/**
 * FEAT-K09 (docs/v0.5.0.md §7.1): the map list shows a **union of entries** —
 * the work entry (`maps`) plus every version entry (`map_versions`) of
 * the same blood lineage. Q3 = B: lineage is keyed by `maps.root_id`.
 */
export interface MapEntrySummary {
  /** 条目自己的 `maps.id`（草稿行与版本行都是 `maps` 行）。 */
  id: number;
  /** `'draft'` 工作条目 | `'version'` 版本条目（由 `version` 列判定）。 */
  kind: 'draft' | 'version';
  /** Blood-lineage root (`maps.root_id`); the list groups by it. */
  rootId: number;
  /**
   * 版本行与草稿行同表，所以这里与 `id` 相同。保留字段是
   * 为了 URL 拼装（`/maps/{mapId}/edit`）在合并前后一字不改。
   */
  mapId: number;
  /** Version number for version entries; `null` for work entries. */
  versionNo: number | null;
  name: string;
  description: string | null;
  /** v0.8.0：同上，作用域与「风格来自主题」那一行都要它（§19 起是编码）。 */
  themeCode: string;
  /** v0.5.8: 取自草稿 `gridSize`；未初始化的地图为 `null`。 */
  gridSize: number | null;
  coverPath: string | null;
  coverUrl: string | null;
  status: MapStatus;
  /** Highest published version of the whole lineage (work entries show it too). */
  currentVersionNo: number | null;
  /** How many version entries the lineage has. */
  versionCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * FEAT-K01 + SPEC-K02 (docs/v0.5.0.md §2.3): one row of the puzzle table. The
 * table keeps the old 5 columns and their wording; only the values are the
 * puzzle's now.
 */
/**
 * v0.7.1 §6.3: one row of `puzzles` (draft row or version row), the shape the
 * puzzle list renders. Mirrors {@link MapEntrySummary} so the two list pages
 * share the same skeleton, buttons and pager.
 *
 * v0.7.1 起谜题与地图同构：`kind` 由 `version` 列判定，草稿行硬删、版本行软删。
 */
export interface PuzzleEntrySummary {
  id: number;
  kind: 'draft' | 'version';
  rootId: number;
  /** 版本行自己的号；草稿行 `null`。 */
  versionNo: number | null;
  name: string;
  description: string | null;
  /**
   * v0.8.5 §7（docs/v0.8.5 §7.md §3）：谜题编码 —— 部署弹窗按它预填访问路径。
   * `null` = v0.8.5 之前建的谜题还没补过，部署时退回「按名称推导」。
   */
  code: string | null;
  /** 派生自 `data.map.data.gridSize`（唯一真源）。 */
  gridSize: number;
  /** 底图来源（追溯 / 展示，无 FK）。 */
  mapId: number;
  mapName: string;
  mapVersionNo: number;
  coverPath: string | null;
  coverUrl: string | null;
  /** 血统内最高版本号（草稿行也带）。 */
  currentVersionNo: number | null;
  versionCount: number;
  publishedAt: string | null;
  /** 挂着未删的 game。 */
  deployed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PuzzleDetail extends PuzzleEntrySummary {
  data: PuzzleDraft;
}

/**
 * FEAT-K01 (docs/v0.5.0.md §5): `GET /api/puzzles/:id/map` — the **read-only**
 * canvas a puzzle draws on, lifted from the referenced map version. The puzzle
 * editor renders this and never writes it back.
 */
export interface PuzzleMapContext {
  mapId: number;
  versionNo: number;
  mapName: string;
  gridSize: number;
  cells: Record<string, DraftCell>;
  regions: DraftRegion[];
  /** Resolved style (a missing block becomes `DEFAULT_MAP_STYLE`); no `linkageColors`. */
  style: MapStyle;
}

/**
 * FEAT-G02 (docs/v0.4.0.md §5) + v0.7.1 §7.3: a deployed game.
 *
 * v0.7.1: the game only **references** one puzzle row (`puzzles_id` unique) —
 * the canvas and the roster are read from that row instead of a snapshot copy.
 * Because a game can only be deployed from a **published** puzzle version
 * (and version rows are read-only), the content stays frozen without a copy.
 */
export interface MapGameSummary {
  id: number;
  /** The puzzle row this game was deployed from (always a version row). */
  puzzleId: number;
  /**
   * v0.8.0（docs/v0.8.0.md §16.4）：这个游戏属于哪个主题 —— 部署页按主题分组，
   * 免得同一主题的合辑和它的单局被劈到两大块里。
   *
   * `games` 自己不存 `theme_id`（§3.1），这个值是顺着 `puzzles.theme_id` 查出来的；
   * §19 起接口给的是**编码**。
   */
  themeCode: string;
  /** 谜题名（来自 puzzle 行）。 */
  puzzleName: string;
  /** 谜题自己的版本号（`'draft'` 不可能出现）。 */
  puzzleVersionNo: number;
  name: string;
  /**
   * OPT-W04 (docs/v0.4.1.md §4): the game's access path — the page lives at
   * `/play/{slug}`. Unique among **not-deleted** games.
   */
  slug: string;
  coverUrl: string | null;
  /**
   * v0.8.6：难度**档位数字**。落库的就是这个数字（`games.difficulty` 是 smallint），
   * 文字是主题给的映射（`ThemeData.difficultyLevels[].label`）—— 展示前先用
   * `difficultyBadge` 对一遍当前分级，对不上就显示「第 N 档」。
   *
   * v0.8.3 起这里存的是字符串标识（`medium` / `tier-1`）；数字的好处是它自带
   * 顺序，删掉中间一档也不必给后面的重新编号。
   */
  difficulty: number;
  /**
   * v0.8.3：展示顺序（越小越靠前）。列表接口已按它排好序，前端不必再排 ——
   * 这个字段出现在这里，是为了让部署弹窗回填「上一次设的序号」，以及让导出
   * 清单和列表说同一个顺序。
   */
  sortWeight: number;
  /** 派生自 `puzzle.data.map.data.gridSize`。 */
  gridSize: number;
  participantCount: number;
  createdAt: string;
}

/**
 * v0.7.1 §7.3: the game page renders straight from the puzzle row — no snapshot
 * copy any more. `puzzle` is `null` only for a defensively-unreadable `data`.
 */
export interface MapGameDetail extends MapGameSummary {
  map: MapDraft;
  puzzle: PuzzleDraft | null;
}

/**
 * a character is used by **puzzles** now (the roster's home). A v0.4.x
 * map draft that still carries a roster is reported with `legacy: true`, so a
 * hard delete can still clean it up.
 */
export interface CharacterUsage {
  /** The puzzle that uses it; omitted for a legacy map draft. */
  puzzleId?: number;
  puzzleName?: string;
  mapId: number;
  mapName: string;
  /** `true` = found in a stored v0.4.x map draft rather than a puzzle. */
  legacy?: boolean;
  cells: Array<{ x: number; y: number }>;
}

export interface ResizeRemoved {
  background: number;
  /** v0.6.0: was `object` — the item layer. */
  item: number;
  regions: number;
  charactersReturnedToSlot: number;
}

export interface ResizeResult {
  gridSize: number;
  removed: ResizeRemoved;
}

export interface PublishViolation {
  rule: string;
  message: string;
}

/** 一个资源 / 角色被哪些地图的草稿引用，资源与角色详情页共用。 */
export interface AssetUsage {
  mapId: number;
  mapName: string;
  cells: CellCoord[];
}

// ---- API envelope ----
export interface ApiSuccess<T> {
  code: 0;
  message: string;
  data: T;
}

export interface ApiFailure {
  code: number;
  message: string;
  data: null;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- 主题（v0.8.0，docs/v0.8.0.md §2 / §4） ----
/**
 * 一个主题里各有几样东西。`games` 只数**活跃**的已上线游戏（`deleted_at IS NULL`）——
 * 卡片上要回答的是「这个主题现在能玩几关」，不是「历史上部署过几次」。
 */
export interface ThemeCounts {
  assets: number;
  maps: number;
  characters: number;
  puzzles: number;
  games: number;
}

/**
 * `themes.data`：主题级**缺省**，不是主题级真相（§5 的 S3 快照式）。
 *
 * - `style`：新建地图那一刻深拷贝进 `MapDraft.style`，之后与主题无关；
 * - `linkageColors`：新建谜题那一刻拷贝进 `PuzzleDraft.linkageColors`，同理。
 *
 * 两个键都可缺 —— 缺 `style` 按 `DEFAULT_MAP_STYLE` 补齐，缺 `linkageColors`
 * 沿用谜题 schema 的默认调色板。所以老的 `{}` 与「全默认」是等价的。
 *
 * `accent`（v0.8.2）是这一层里唯一的例外：它不是「拷贝给内容」的缺省，而是这个
 * 空间的**门牌色** —— 系统配置页的卡片色带、概览页的识别色用；不进导出包。
 */
export interface ThemeData {
  version: number;
  accent?: string;
  style?: MapStyle;
  linkageColors?: MapLinkageColor[];
  /**
   * v0.8.6（docs/v0.8.6.md §4 / v0.8.7 §4；v0.9.5 更名）：这个空间的**标记** ——
   * 本主题里没有单独配置的谜题都画这一张。
   *
   * 与 `style` / `linkageColors` 那种「新建时拷一份」的缺省不同：它是**读取时**的
   * 兜底（谜题 → 主题 → ×），所以换一张图，本主题下跟随的关卡下次打开就是新的，
   * 已发布的也一样。谜题自己上传过的那张仍覆盖它。
   *
   * 缺失 = 本主题里跟随的那些谜题画默认的 `×` 字形。图和谜题侧共用
   * {@link UploadedImage}。旧键 `forbiddenSymbol` 由 `withLegacyImageKeys` 搬过来。
   */
  mark?: UploadedImage | null;
  /**
   * v0.8.7 §7：本主题的工具按钮图标（清除 / 撤回 / 提交）—— 本主题里没有单独配置的
   * 谜题，按钮上都画这一套。
   *
   * 与 {@link ThemeData.mark} 同一条规矩：**读取时**兜底，不是「新建时
   * 拷一份」。所以换一套图，跟随的关卡（含已发布的）下次打开就是新的。
   */
  toolIcons?: GameToolIcons | null;
  /**
   * v0.9.2（docs/v0.9.2.md §2）：玩家**戳在格子上等待**时那圈进度环的图。
   *
   * v0.9.5 起它和提交校验的圈**合并成一套**（`ThemeRing`）：玩家看到的都是
   * 「一圈绕着一格走」，长按是等它满、校验是等它扫完 —— 同一个世界的同一种回应，
   * 不该配两张图。旧键 `pressRing` / `checkStyle.ring` 由 `withLegacyImageKeys`
   * 与 `themeRingSchema` 搬到 `ring`。
   */
  ring?: ThemeRing | null;
  /**
   * v0.8.3：这个空间的**难度分级**。
   *
   * 缺省（`undefined`）= 内置五档（极简 / 简单 / 中等 / 困难 / 专家）。给了就用
   * 给的这几档 —— 按 `level` 从小到大即「由易到难」，徽章也只认 `level`。
   *
   * 它和 `style` / `linkageColors` 一样是主题级的，但**消费方式不同**：那两个在
   * 新建内容时被拷贝走，之后各走各的；分级不拷贝 —— 部署弹窗、游戏卡、资源包
   * 每次都读**当前**主题的这几档。理由很直接：难度是一个「说法」，不是内容。
   */
  difficultyLevels?: ThemeDifficultyTier[];
  /**
   * v0.9.3（docs/v0.9.3.md §3）：**提交校验**时的样子 —— 两档颜色 + 可选的圈图。
   *
   * 与 `mark` / `toolIcons` / `ring` 同一条规矩：**读取时**兜底，不是「新建时拷一份」。
   * 改一档颜色，所有关卡（含已发布的）下次提交就是新的。
   *
   * v0.9.5：**圈图从这里搬走了**（并进 `ring`），这里只剩两档颜色 —— 校验的颜色
   * 是「对 / 错」的语义，和环长什么样是两件事。旧数据里的 `checkStyle.ring` 仍然
   * 读得出来（`themeRingSchema` 兜底），迁移会把存量行搬到新键。
   *
   * 缺失 / `null` = 内置的绿（通过）/ 红（未通过）。
   */
  checkStyle?: ThemeCheckColors | null;
}

/**
 * v0.9.5：主题的**那一圈** —— 长按计时环与提交校验圈共用一张图。
 *
 * 为什么合并：玩家看到的都是「一圈绕着一格走」。长按是等它装满（放头像）、校验是
 * 等它扫完（宣布这一位对错）—— 同一种回应、同一个尺度、同一个世界的语言。分成
 * 两张配置的后果是作者要传两次，而且很难保证它们看起来是一家人。
 *
 * 图只换**样子**，进度仍按各自时长顺时针填满 —— 环回答的是「还要等多久」，
 * 不能因为换成插画就没了刻度。
 */
export interface ThemeRing {
  /** 那一圈图。缺失 = 画内置的那圈细弧（长按白弧 / 校验本色环）。 */
  image?: UploadedImage | null;
}

/**
 * v0.9.3 / v0.9.5：提交校验的两档颜色。
 *
 * 颜色是「对 / 错」的语义色（绿 / 红），不是股市那套涨跌色。圈图 v0.9.5 起并进
 * `ThemeData.ring`，这里只剩颜色。
 */
export interface ThemeCheckColors {
  /** 通过的颜色（`#RRGGBB`）。缺省见 `THEME_CHECK_PASS_COLOR`。 */
  passColor: string;
  /** 未通过的颜色（`#RRGGBB`）。缺省见 `THEME_CHECK_FAIL_COLOR`。 */
  failColor: string;
}

/**
 * v0.8.6（docs/v0.8.6.md §4；v0.9.5 更名）：作者上传的一张**符号小图**。
 *
 * 它不是资源引用 —— 作者上传的就是这一张，落在 `storage/uploads` 下，数据里只记
 * 相对路径（{@link fileUrlFromPath} 拼地址）。标记（主题缺省 / 谜题覆盖）、三枚
 * 按钮图标、那一圈图共用这个形状。
 *
 * v0.9.5 从 `ForbiddenSymbolImage` 改名：它服务的早就不止「禁止符号」一种图。
 */
export interface UploadedImage {
  /**
   * `storage/uploads` 下的相对路径，如 `puzzles/12/mark/<uuid>.webp` /
   * `themes/3/ring/<uuid>.webp`。
   */
  path: string;
}

/**
 * v0.8.7 §7：游戏页右列三枚**动作按钮**（清除 / 撤回 / 提交）的画。
 *
 * 每枚都是「一张上传图」—— 与标记同一种形状、同一条解析顺序（谜题自己的 →
 * 主题的 → 内置图标），只是消费的位置不同：标记画在格子里，这三张只画在按钮上。
 *
 * 三者都缺席（或 `null`）时，按钮退回内置的 lucide 图标（橡皮 / 回退箭头 / 纸飞机）。
 * 用一个对象而不是三个平铺字段：作者改的是「这一套按钮长什么样」，读的一方也只需要
 * 一次 `resolveToolIcon(kind, …)`。
 */
export interface GameToolIcons {
  clear?: UploadedImage | null;
  undo?: UploadedImage | null;
  submit?: UploadedImage | null;
}

/**
 * v0.8.6：一档难度 = **数字 + 名字 + 可选颜色**。
 *
 * `level` 落库（`games.difficulty`），所以它是身份：改名、换色都不动它，改它等于
 * 把这一档在难度轴上的位置挪走。数字同时是顺序 —— 不必再另存一个「第几个」。
 */
export interface ThemeDifficultyTier {
  /** 档位数字（1 起，越大越难），`GAME_DIFFICULTY_LEVEL_MIN` … `MAX`。 */
  level: number;
  /** 徽章上的字。 */
  label: string;
  /**
   * 可选 `#rrggbb`。不填就按位置落在内置那条热力坡上（存量主题因此不用补数据）；
   * 填了则由它混出徽章的底色与字色，见 `difficultyBadge`。
   */
  color?: string;
}

/**
 * 一个主题（docs/v0.8.0.md §4 / §19）。
 *
 * **没有 `id`**：主题在接口上只以编码标识 —— 它进地址（`/hlm/maps`）、进资源包
 * manifest，将来导入时也靠它对账。数字主键是数据库的内部事务号，`themes.id` 只出现
 * 在仓储层与 `theme_id` 列上。少了它，调用方也没法两套并用。
 */
export interface Theme {
  code: string;
  name: string;
  description: string | null;
  data: ThemeData;
  counts: ThemeCounts;
  createdAt: string;
  updatedAt: string;
}

/**
 * 列表页作用域条与新建对话框要的最小形状（docs/v0.8.0.md §16.1 / §16.7）。
 * 单独给一个类型是为了让「换主题」的下拉不必去拿 90 个资源的计数。
 */
export interface ThemeOption {
  code: string;
  name: string;
}
