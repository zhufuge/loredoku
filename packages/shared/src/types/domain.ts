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
 * v0.6.1: the appearance half of an asset. It lives on a **form**, never on the
 * asset itself (docs/v0.6.1.md §5.1) — one asset may carry several looks.
 */
export interface AssetAppearance {
  fitMode: AssetFitMode;
  imagePath: string | null;
  imageUrl: string | null;
  imageThumbUrl: string | null;
  imageMime: string | null;
  imageSize: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** v0.5.1 FEAT-L01: colour-block colour (`#RRGGBB`); `null` = image mode. */
  bgColor: string | null;
}

/**
 * v0.6.1: one way an asset can look and sit on the canvas. An asset always has
 * at least one. A background form's footprint is never rendered — a background
 * cell is always one cell wide — so it stays pinned at 1×1.
 */
export interface AssetForm extends AssetAppearance {
  id: number;
  assetId: number;
  name: string;
  widthCells: number;
  heightCells: number;
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
  forms: AssetForm[];
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
  avatarMime: string | null;
  avatarSize: number | null;
  avatarWidth: number | null;
  avatarHeight: number | null;
  /** v0.5.1 FEAT-L02: colour-block colour (`#RRGGBB`); `null` = image mode. */
  bgColor: string | null;
  meta: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- Map draft JSON (single-column storage, see docs/feature-0.2.md §FEAT-06) ----
/**
 * A background cell: one asset, no footprint (it fills the single cell).
 *
 * v0.6.1: `formId` names which of the asset's forms was painted. Optional so a
 * payload written before background assets could have several forms keeps
 * validating — rendering then falls back to the asset's first form
 * (docs/v0.6.1.md §6.2).
 */
export interface DraftAssetRef {
  assetId: number;
  formId?: number;
}

/**
 * v0.6.0: the item layer. The anchor cell stores the footprint (`w` × `h`).
 *
 * v0.6.1: `formId` names the asset **form** that was placed. It is optional so a
 * v4 payload (written before forms existed) keeps validating — rendering then
 * falls back to the asset's first form (docs/v0.6.1.md §6.2).
 */
export interface DraftAnchorItem {
  assetId: number;
  formId?: number;
  w: number;
  h: number;
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
  difficulty: GameDifficulty;
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
