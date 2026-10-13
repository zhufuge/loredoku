import type { CardRotation, EffectType } from './domain';

/**
 * Raw database row shapes (snake_case) as returned by Knex.
 * Repositories map these to the camelCase API DTOs in ./domain.ts.
 */

export interface ProjectRow {
  id: string | number;
  name: string;
  description: string | null;
  grid_size: number;
  cover_path: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CardRow {
  id: string | number;
  code: string;
  name: string;
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

export interface CardTriggerRow {
  id: string | number;
  card_id: string | number;
  trigger_key: string;
  trigger_value: string;
  effect_type: EffectType;
  effect_config: Record<string, unknown>;
  created_at: Date | string;
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
