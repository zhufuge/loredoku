import type {
  AssetFitMode,
  AssetType,
  CardRotation,
  CharacterGender,
  GameDifficulty,
  MapDraft,
} from './domain';

export interface MapRow {
  id: string | number;
  name: string;
  description: string | null;
  cover_path: string | null;
  /**
   * v0.5.0 SPEC-K11 / Q3 = B: the blood-lineage root. A plain map points at
   * itself; a map forked from a published version keeps the original's root,
   * so both stay in one group and share one version numbering.
   */
  root_id: string | number;
  /**
   * 画布数据。草稿行可为 `NULL`（未初始化），版本行必非空（CHECK 兜住）。
   */
  data: MapDraft | null;
  /**
   * `'draft'` = 工作条目，纯数字字符串 = 已发布版本。
   * **不要**直接 `Number()`：`Number('draft')` 是 NaN，转换统一走
   * `versionToNo()`（docs/map-table-merge-design.md §15 P0-2）。
   */
  version: string;
  /** 软删标记：只有版本行会被设置；草稿行是硬删。 */
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * v0.6.0: the `assets` table (was `items`); `category` → `type`, `can_stand` → `blocking`.
 *
 * v0.6.1: the asset row keeps only identity + behaviour; the appearance lives on
 * {@link AssetVariantRow} (docs/v0.6.1.md §3).
 */
export interface AssetRow {
  id: string | number;
  code: string;
  name: string;
  type: AssetType;
  blocking: boolean;
  /** v0.5.2 FEAT-M03: the free-form `meta` blob was dropped with the column. */
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * v0.6.1: one row of `asset_variants` (then `asset_forms`) — how an asset looks.
 * `asset_id` cascades, so deleting the asset deletes its variants.
 *
 * v0.7.6: the table lost six columns (docs/v0.7.6.md §9): the footprint
 * (`width_cells` / `height_cells`, now a per-placement constant of 1) and the
 * upload receipt (`image_mime` / `image_size` / `image_width` / `image_height`).
 */
export interface AssetVariantRow {
  id: string | number;
  asset_id: string | number;
  name: string;
  fit_mode: AssetFitMode;
  image_path: string | null;
  /** v0.5.1 FEAT-L01: colour-block colour (`#RRGGBB`); `null` = image mode. */
  bg_color: string | null;
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * v0.7.6: the avatar is **one path and nothing else** (docs/v0.7.6.md).
 * `avatar_mime` / `meta` went first (zero readers, zero information); the
 * `avatar_size` / `avatar_width` / `avatar_height` trio followed — they only
 * fed one line of uploader copy, and every cover in this repo (maps / games /
 * puzzles) already stores nothing but `cover_path`.
 */
export interface CharacterRow {
  id: string | number;
  code: string;
  name: string;
  gender: CharacterGender;
  description: string | null;
  avatar_path: string | null;
  /** v0.5.1 FEAT-L02: colour-block colour (`#RRGGBB`); `null` = image mode. */
  bg_color: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * v0.7.1 §7.2: a deployed game only points at **one puzzle row**.
 *
 * `puzzle_id` is unique across live rows, so re-deploying the same version
 * replaces that row (`gameRepository.upsertGame` does delete-then-insert);
 * different versions of the same puzzle each get their own game and slug.
 * Cancelling a deployment sets `deleted_at` — the row stays, the slug becomes
 * reusable (partial unique index) and the player link 404s.
 */
export interface MapGameRow {
  id: string | number;
  puzzle_id: string | number;
  name: string;
  /** OPT-W04: the unique access path (`/play/{slug}`). */
  slug: string;
  cover_path: string | null;
  difficulty: GameDifficulty;
  /** 取消部署 = 假删；列表与详情一律过滤掉。 */
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * v0.7.1 §5.1: `puzzles` is versioned exactly like `maps` — `root_id` groups a
 * blood lineage, `version` is `'draft'` or a numeric string, and version rows
 * are soft-deleted (draft rows are hard-deleted).
 *
 * `data` carries the whole `PuzzleDraft` **including the copied canvas**, so the
 * row is self-contained: no `map_project_id` / `map_version_no` / `grid_size` /
 * `status` columns any more.
 */
export interface PuzzleRow {
  id: string | number;
  /** 血统根；普通谜题指向自己，fork 出的草稿沿用来源的根。 */
  root_id: string | number;
  /** `'draft'` = 工作条目，纯数字字符串 = 已发布版本（转换走 `versionToNo()`）。 */
  version: string;
  /** 软删标记：只有版本行会被设置；草稿行是硬删。 */
  deleted_at: Date | string | null;
  name: string;
  description: string | null;
  cover_path: string | null;
  /** `PuzzleDraft`（v2）；读之前过 `absorbLegacyPuzzleDraft`。 */
  data: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface MapCellRow {
  id: string | number;
  project_id: string | number;
  x: number;
  y: number;
  card_id: string | number | null;
  rotation: CardRotation;
  z_index: number;
  updated_at: Date | string;
}

export interface MapRegionRow {
  id: string | number;
  project_id: string | number;
  name: string;
  description: string | null;
  color: string;
  border_width: number;
  fill_opacity: string | number;
  meta: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface MapRegionCellRow {
  region_id: string | number;
  x: number;
  y: number;
}