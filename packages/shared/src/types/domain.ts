import type { EFFECT_TYPES, EDITOR_TOOLS, CARD_ROTATIONS } from '../constants';

export type EffectType = (typeof EFFECT_TYPES)[number];
export type EditorTool = (typeof EDITOR_TOOLS)[number];
export type CardRotation = (typeof CARD_ROTATIONS)[number];

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
  gridSize: number;
  coverPath: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends Project {
  cardCount: number;
  regionCount: number;
}

export interface CardTrigger {
  id: number;
  triggerKey: string;
  triggerValue: string;
  effectType: EffectType;
  effectConfig: Record<string, unknown>;
}

export interface Card {
  id: number;
  code: string;
  name: string;
  imagePath: string | null;
  imageUrl: string | null;
  imageMime: string | null;
  imageSize: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  meta: Record<string, unknown>;
  isActive: boolean;
  triggers: CardTrigger[];
  createdAt: string;
  updatedAt: string;
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
