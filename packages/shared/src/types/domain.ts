import type {
  EFFECT_TYPES,
  EDITOR_TOOLS,
  CARD_ROTATIONS,
  ITEM_CATEGORIES,
  ITEM_FIT_MODES,
  EDITOR_LAYERS,
  REGION_SHAPES,
  PROJECT_STATUSES,
  CHARACTER_GENDERS,
  PARTICIPANT_TARGET_TYPES,
  EFFECT_COLORS,
  GAME_DIFFICULTY_LEVELS,
  MapLinkageColor,
  MapStyle,
} from '../constants';

export type EffectType = (typeof EFFECT_TYPES)[number];
export type EditorTool = (typeof EDITOR_TOOLS)[number];
export type CardRotation = (typeof CARD_ROTATIONS)[number];
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export type ItemFitMode = (typeof ITEM_FIT_MODES)[number];
export type EditorLayer = (typeof EDITOR_LAYERS)[number];
export type RegionShape = (typeof REGION_SHAPES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
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
export interface Project {
  id: number;
  name: string;
  description: string | null;
  /**
   * v0.5.8: no longer a column — the canvas size lives in the draft
   * (`draft_data.gridSize`). `null` = 尚未初始化（创建时不再填尺寸，第一次
   * 进编辑器时由初始化弹窗写入）。
   */
  gridSize: number | null;
  coverPath: string | null;
  coverUrl: string | null;
  status: ProjectStatus;
  currentVersionNo: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends Project {
  cardCount: number;
  regionCount: number;
  itemCount: number;
  characterCount: number;
  versionCount: number;
}

/** `EffectType` stays — participant linkages still use it. */

export interface Item {
  id: number;
  code: string;
  name: string;
  category: ItemCategory;
  widthCells: number;
  heightCells: number;
  canStand: boolean;
  fitMode: ItemFitMode;
  imagePath: string | null;
  imageUrl: string | null;
  imageThumbUrl: string | null;
  imageMime: string | null;
  imageSize: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** v0.5.1 FEAT-L01: colour-block colour (`#RRGGBB`); `null` = image mode. */
  bgColor: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Backward-compatible aliases (kept while the web app migrates in a later phase).
export type Card = Item;

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
export interface DraftItemRef {
  itemId: number;
}

export interface DraftAnchorItem {
  itemId: number;
  w: number;
  h: number;
}

export interface DraftCell {
  background?: DraftItemRef;
  object?: DraftAnchorItem;
  objectRef?: string;
}

export interface DraftRegion {
  id: string;
  name: string;
  color: string;
  borderWidth: number;
  fillOpacity: number;
  cells: Array<[number, number]>;
  labelCell?: [number, number] | null;
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
      type: 'item';
      id: number;
      /** MOD-708: `'all'` highlights every instance of `itemId`; `'instances'` only `instances`. */
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

// ---- Puzzle draft JSON (v0.5.0 FEAT-K08) ----
/**
 * v0.5.0 FEAT-K01: a puzzle is the "出题" half of the product. It owns the
 * roster + palette and **references** one published map version for its
 * canvas (read-only) instead of copying it — see docs/v0.5.0.md §5.1.
 */
export interface PuzzleDraft {
  /** `PUZZLE_JSON_VERSION` — import / export and migration. */
  version: number;
  /** The referenced published map version. `gridSize` is denormalised for offline checks. */
  map: { projectId: number; versionNo: number; gridSize: number };
  name: string;
  description: string;
  /** Linked theme-colour palette (was `MapDraft.style.linkageColors`). */
  linkageColors: MapLinkageColor[];
  /** Roster; length = `map.gridSize` (same convention as the old map editor). */
  characterSlots: Array<CharacterSlotEntry | null>;
}

export interface MapResponse {
  project: Project;
  /**
   * v0.5.8: `null` = 这张地图还没初始化（创建时不再写草稿）。编辑器据此弹
   * 「初始化地图」弹窗：填尺寸，或导入一份地图。
   */
  draft: MapDraft | null;
  updatedAt: string | null;
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
  projectName: string;
}

/**
 * SPEC-K13 §7.4 (docs/v0.5.0.md): one row of the editor's 版本历史 panel. With
 * Q3 = B a lineage spans several `maps` rows, so each version carries
 * the row that owns it — that is what 「编辑此版本」 forks from.
 */
export interface MapVersionEntry extends MapVersionSummary {
  /** The `maps.id` this version belongs to. */
  projectId: number;
}

/**
 * FEAT-K03 (docs/v0.5.0.md §2.4): one option of the 「地图版本」 picker in the
 * create-puzzle dialog — a **published** map version and nothing else.
 */
export interface PublishedMapVersion {
  projectId: number;
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
  /** The entry's own id: work entry = `maps.id`; version entry = `map_versions.id`. */
  id: number;
  /** `'draft'` work entry | `'version'` version entry. */
  kind: 'draft' | 'version';
  /** Blood-lineage root (`maps.root_id`); the list groups by it. */
  rootId: number;
  /** The owning `maps.id` (the work entry itself, or the version's owner). */
  projectId: number;
  /** Version number for version entries; `null` for work entries. */
  versionNo: number | null;
  name: string;
  description: string | null;
  /** v0.5.8: 取自草稿 `gridSize`；未初始化的地图为 `null`。 */
  gridSize: number | null;
  coverPath: string | null;
  coverUrl: string | null;
  status: ProjectStatus;
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
export interface PuzzleSummary {
  id: number;
  name: string;
  description: string | null;
  /** The referenced published map version — the 版本 column shows `v{n}`. */
  mapVersionNo: number;
  /** The `maps.id` that owns that version. */
  mapProjectId: number;
  /** That map's blood-lineage root. */
  mapRootId: number;
  mapName: string;
  gridSize: number;
  status: ProjectStatus;
  /** Q5: the 发布时间 column reads this (the header wording is unchanged). */
  createdAt: string;
  updatedAt: string;
  /** FEAT-G02: this puzzle already has a deployed game. */
  deployed: boolean;
}

export interface PuzzleDetail extends PuzzleSummary {
  data: PuzzleDraft;
}

/**
 * FEAT-K01 (docs/v0.5.0.md §5): `GET /api/puzzles/:id/map` — the **read-only**
 * canvas a puzzle draws on, lifted from the referenced map version. The puzzle
 * editor renders this and never writes it back.
 */
export interface PuzzleMapContext {
  projectId: number;
  versionNo: number;
  mapName: string;
  gridSize: number;
  cells: Record<string, DraftCell>;
  regions: DraftRegion[];
  /** Resolved style (a missing block becomes `DEFAULT_MAP_STYLE`); no `linkageColors`. */
  style: MapStyle;
}

/**
 * FEAT-G02 (docs/v0.4.0.md §5): a deployed game. v0.5.0 CONS-K16 narrows the
 * unit from "one map" to **one puzzle** — `puzzle_id` is unique, so deploying
 * another version of the same puzzle overwrites the row.
 */
export interface MapGameSummary {
  id: number;
  /** CONS-K16: the puzzle this game was deployed from (`null` for legacy rows). */
  puzzleId: number | null;
  /** The referenced map version's owner row + version number (badges / keys). */
  projectId: number;
  versionNo: number;
  name: string;
  /**
   * OPT-W04 (docs/v0.4.1.md §4): the game's access path — the page lives at
   * `/games/{slug}`. Unique across every deployed game.
   */
  slug: string;
  coverUrl: string | null;
  difficulty: GameDifficulty;
  gridSize: number;
  participantCount: number;
  createdAt: string;
}

/**
 * CONS-K16 (docs/v0.5.0.md §10.1): the frozen payload a game renders.
 *
 * - `map` — the canvas (v3 shape: no roster);
 * - `puzzle` — the puzzle data at deploy time (roster / palette / description);
 * - `legacyCharacterSlots` / `legacyLinkageColors` — v0.4.x snapshots kept the
 *   roster and palette inside the map, so the server lifts them out on read and
 *   legacy games stay playable with **zero** repair.
 */
export interface MapGameSnapshot {
  map: MapDraft;
  puzzle: PuzzleDraft | null;
  legacyCharacterSlots?: Array<CharacterSlotEntry | null>;
  legacyLinkageColors?: MapLinkageColor[];
}

/** The game page renders the snapshot the puzzle carried when it was deployed. */
export interface MapGameDetail extends MapGameSummary {
  snapshot: MapGameSnapshot;
}

/**
 * v0.5.0: a character is used by **puzzles** now (the roster's home). A v0.4.x
 * map draft that still carries a roster is reported with `legacy: true`, so a
 * hard delete can still clean it up.
 */
export interface CharacterUsage {
  /** The puzzle that uses it; omitted for a legacy map draft. */
  puzzleId?: number;
  puzzleName?: string;
  projectId: number;
  projectName: string;
  /** `true` = found in a stored v0.4.x map draft rather than a puzzle. */
  legacy?: boolean;
  cells: Array<{ x: number; y: number }>;
}

export interface ResizeRemoved {
  background: number;
  object: number;
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

export interface MapCell {
  x: number;
  y: number;
  cardId: number;
  rotation: CardRotation;
  zIndex: number;
}

export interface RegionData {
  id: number;
  name: string;
  description: string | null;
  color: string;
  borderWidth: number;
  fillOpacity: number;
  cells: CellCoord[];
  createdAt: string;
  updatedAt: string;
}

export interface MapData {
  project: Project;
  cells: MapCell[];
  regions: RegionData[];
}

export interface CardUsage {
  projectId: number;
  projectName: string;
  cells: CellCoord[];
}

export type ItemUsage = CardUsage;
export type CharacterUsageDetail = CardUsage;

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
