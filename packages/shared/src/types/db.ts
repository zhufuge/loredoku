import type {
  CardRotation,
  CharacterGender,
  GameDifficulty,
  ItemCategory,
  ItemFitMode,
  MapDraft,
} from './domain';
import type { PROJECT_STATUSES } from '../constants';

export interface ProjectRow {
  id: string | number;
  name: string;
  description: string | null;
  grid_size: number;
  cover_path: string | null;
  status: (typeof PROJECT_STATUSES)[number];
  current_version_no: number | null;
  /**
   * v0.5.0 SPEC-K11 / Q3 = B: the blood-lineage root. A plain map points at
   * itself; a map forked from a published version keeps the original's root,
   * so both stay in one group and share one version numbering.
   */
  root_id: string | number;
  draft_data: MapDraft | null;
  draft_updated_at: Date | string | null;
  created_at: Date | string;
  updatedAt: Date | string;
  updated_at: Date | string;
}

export interface ItemRow {
  id: string | number;
  code: string;
  name: string;
  category: ItemCategory;
  width_cells: number;
  height_cells: number;
  can_stand: boolean;
  fit_mode: ItemFitMode;
  image_path: string | null;
  image_mime: string | null;
  image_size: number | null;
  image_width: number | null;
  image_height: number | null;
  /** v0.5.1 FEAT-L01: colour-block colour (`#RRGGBB`); `null` = image mode. */
  bg_color: string | null;
  /** v0.5.2 FEAT-M03: the free-form `meta` blob was dropped with the column. */
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export type CardRow = ItemRow;

/**
 * v0.5.2 FEAT-M03 (docs/v0.5.2.md §3.1): `item_triggers` is dropped, so this
 * row shape — and its `CardTriggerRow` alias — no longer exist.
 */

export interface CharacterRow {
  id: string | number;
  code: string;
  name: string;
  gender: CharacterGender;
  description: string | null;
  avatar_path: string | null;
  avatar_mime: string | null;
  avatar_size: number | null;
  avatar_width: number | null;
  avatar_height: number | null;
  /** v0.5.1 FEAT-L02: colour-block colour (`#RRGGBB`); `null` = image mode. */
  bg_color: string | null;
  meta: Record<string, unknown>;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface MapVersionRow {
  id: string | number;
  project_id: string | number;
  version_no: number;
  grid_size: number;
  data: MapDraft;
  notes: string | null;
  snapshot_created_at: Date | string;
}

/**
 * v0.5.0 CONS-K16: a deployed game. `puzzle_id` is unique — one deployed game
 * per puzzle, later deploys overwrite the row. `project_id` / `version_no`
 * survive as the referenced map version, and legacy rows have `puzzle_id = NULL`
 * with a v0.4.x snapshot shape.
 */
export interface MapGameRow {
  id: string | number;
  puzzle_id: string | number | null;
  project_id: string | number;
  version_no: number;
  name: string;
  /** OPT-W04: the unique access path (`/games/{slug}`). */
  slug: string;
  cover_path: string | null;
  cover_mime: string | null;
  cover_size: number | null;
  cover_width: number | null;
  cover_height: number | null;
  difficulty: GameDifficulty;
  grid_size: number;
  /**
   * Typed loosely on purpose: rows written before v0.5.0 hold the v0.4.x shape
   * (roster inside the map), and the server lifts those into a
   * {@link MapGameSnapshot} while reading.
   */
  snapshot: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

/** v0.5.0 FEAT-K01: one row of `puzzles`. */
export interface PuzzleRow {
  id: string | number;
  name: string;
  description: string | null;
  map_project_id: string | number;
  map_version_no: number;
  grid_size: number;
  /** `PuzzleDraft`; read through `absorbLegacyPuzzleDraft` before parsing. */
  data: unknown;
  status: (typeof PROJECT_STATUSES)[number];
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