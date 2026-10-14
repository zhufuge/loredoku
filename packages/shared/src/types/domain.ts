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
  PARTICIPANT_TRIGGERS,
  PARTICIPANT_TARGET_TYPES,
  EFFECT_COLORS,
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
export type ParticipantTriggerKey = (typeof PARTICIPANT_TRIGGERS)[number];
export type ParticipantTargetType = (typeof PARTICIPANT_TARGET_TYPES)[number];
export type EffectColor = (typeof EFFECT_COLORS)[number];

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

export interface ItemTrigger {
  id: number;
  triggerKey: string;
  triggerValue: string;
  effectType: EffectType;
  effectConfig: Record<string, unknown>;
}

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
  meta: Record<string, unknown>;
  isActive: boolean;
  triggers: ItemTrigger[];
  createdAt: string;
  updatedAt: string;
}

// Backward-compatible aliases (kept while the web app migrates in a later phase).
export type Card = Item;
export type CardTrigger = ItemTrigger;

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

export interface CharacterSlot {
  characterId: number;
}

// ---- Participant linkage (docs/v0.3.0.md FEAT-502) ----
export type ParticipantTarget =
  | { type: 'character'; id: number; effect: EffectType; color: EffectColor }
  | { type: 'item'; id: number; effect: EffectType; color: EffectColor }
  | { type: 'cell'; x: number; y: number; effect: EffectType; color: EffectColor }
  | { type: 'region'; id: string; effect: EffectType; color: EffectColor };

export interface ParticipantTrigger {
  trigger: ParticipantTriggerKey;
  targets: ParticipantTarget[];
}

export interface PlacedCharacter {
  characterId: number;
  x: number;
  y: number;
  mapMeta: Record<string, unknown>;
  /** Slot the character came from, so it can return there when removed. */
  originSlotIndex?: number;
  /** Participant theme colour, defaults to `#FFFFFF`. Never a blue hue. */
  themeColor?: string;
  /** Highlight effects grouped by trigger, each group maintained independently. */
  triggers?: ParticipantTrigger[];
}

/** A placed character with participant fields normalised (used by UI code). */
export interface Participant extends PlacedCharacter {
  themeColor: string;
  triggers: ParticipantTrigger[];
}

export interface MapDraft {
  version: number;
  gridSize: number;
  cells: Record<string, DraftCell>;
  regions: DraftRegion[];
  characterSlots: Array<CharacterSlot | null>;
  placedCharacters: PlacedCharacter[];
}

export interface MapResponse {
  project: Project;
  draft: MapDraft;
  updatedAt: string | null;
}

export interface MapVersionSummary {
  id: number;
  versionNo: number;
  gridSize: number;
  notes: string | null;
  publishedAt: string;
  /** Snapshot totals shown on the works panel (docs/v0.3.0.md FEAT-503). */
  participantCount: number;
  regionCount: number;
  itemCount: number;
}

export interface MapVersionDetail extends MapVersionSummary {
  data: MapDraft;
}

export interface CharacterUsage {
  projectId: number;
  projectName: string;
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
