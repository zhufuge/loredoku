import type { CardRotation, EffectType, ItemCategory, MapDraft } from './domain';
import type { PROJECT_STATUSES } from '../constants';

export interface ProjectRow {
  id: string | number;
  name: string;
  description: string | null;
  grid_size: number;
  cover_path: string | null;
  status: (typeof PROJECT_STATUSES)[number];
  current_version_no: number | null;
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
  image_path: string | null;
  image_mime: string | null;
  image_size: number | null;
  image_width: number | null;
  image_height: number | null;
  meta: Record<string, unknown>;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export type CardRow = ItemRow;

export interface ItemTriggerRow {
  id: string | number;
  item_id: string | number;
  trigger_key: string;
  trigger_value: string;
  effect_type: EffectType;
  effect_config: Record<string, unknown>;
  created_at: Date | string;
}

export type CardTriggerRow = ItemTriggerRow;

export interface CharacterRow {
  id: string | number;
  code: string;
  name: string;
  description: string | null;
  avatar_path: string | null;
  avatar_mime: string | null;
  avatar_size: number | null;
  avatar_width: number | null;
  avatar_height: number | null;
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