import { z } from 'zod';
import {
  DEFAULT_MAP_STYLE,
  DEFAULT_REGION_COLOR,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  LINKAGE_COLOR_KEY_PATTERN,
  LINKAGE_COLOR_LABEL_MAX_LENGTH,
  MAP_STYLE_CELL_SIZE_MAX,
  MAP_STYLE_CELL_SIZE_MIN,
  MAP_STYLE_COLOR_PATTERN,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAP_STYLE_OPERATION_OFFSET_MAX,
  MAP_STYLE_OPERATION_OFFSET_MIN,
  MAP_STYLE_RULER_FONT_MAX,
  MAP_STYLE_RULER_FONT_MIN,
  MAP_STYLE_RULER_GAP_MAX,
  MAP_STYLE_RULER_GAP_MIN,
  MAP_STYLE_REGION_LABEL_FONT_MAX,
  MAP_STYLE_REGION_LABEL_FONT_MIN,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  MAP_STYLE_REGION_LABEL_STROKE_MIN,
  PROJECT_NOTE_MAX_LENGTH,
  REGION_BORDER_WIDTH_DEFAULT,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  REGION_FILL_OPACITY_DEFAULT,
  REGION_FILL_OPACITY_MAX,
  REGION_FILL_OPACITY_MIN,
  REGION_NAME_MAX_LENGTH,
} from '../constants';
import { regionColorSchema } from './map';
import { participantLinkagesSchema, themeColorSchema } from './participant';

const coordSchema = z.number().int().min(0).max(GRID_SIZE_MAX * 4);
const cellKeySchema = z.string().regex(/^\d+,\d+$/, '单元格坐标格式应为 "x,y"');

// ---- v0.3.8 FEAT-D02 地图样式（地图级缺省值） ----
/** Colours are `#RRGGBB`; the only exception is the cursor shadow ring. */
const styleColorSchema = z
  .string()
  .trim()
  .regex(MAP_STYLE_COLOR_PATTERN, '颜色需为 #RRGGBB 格式');
const styleShadowSchema = z
  .string()
  .trim()
  .regex(/^(#[0-9a-fA-F]{6}|rgba?\([\d\s.,%]+\))$/, '阴影色需为 #RRGGBB 或 rgb/rgba() 格式');

const styleLineSchema = (defaults: { width: number; color: string }) =>
  z.object({
    width: z
      .number()
      .min(MAP_STYLE_LINE_WIDTH_MIN)
      .max(MAP_STYLE_LINE_WIDTH_MAX)
      .default(defaults.width),
    color: styleColorSchema.default(defaults.color),
  });

const regionOutlineWidthSchema = z
  .number()
  .int()
  .min(REGION_BORDER_WIDTH_MIN)
  .max(REGION_BORDER_WIDTH_MAX)
  .default(DEFAULT_MAP_STYLE.regionOutline.width);

export const mapLinkageColorSchema = z.object({
  key: z.string().trim().regex(LINKAGE_COLOR_KEY_PATTERN, '主题色 key 需为小写字母开头的标识符'),
  label: z.string().trim().min(1).max(LINKAGE_COLOR_LABEL_MAX_LENGTH),
  color: styleColorSchema,
});

export const mapStyleSchema = z.object({
  cellSize: z
    .number()
    .int()
    .min(MAP_STYLE_CELL_SIZE_MIN)
    .max(MAP_STYLE_CELL_SIZE_MAX)
    .nullable()
    .default(DEFAULT_MAP_STYLE.cellSize),
  canvasFrame: styleLineSchema(DEFAULT_MAP_STYLE.canvasFrame).default(() => ({
    ...DEFAULT_MAP_STYLE.canvasFrame,
  })),
  gridSeparator: styleLineSchema(DEFAULT_MAP_STYLE.gridSeparator).default(() => ({
    ...DEFAULT_MAP_STYLE.gridSeparator,
  })),
  mouseCursorBox: z.object({
    width: z
      .number()
      .min(MAP_STYLE_LINE_WIDTH_MIN)
      .max(MAP_STYLE_LINE_WIDTH_MAX)
      .default(DEFAULT_MAP_STYLE.mouseCursorBox.width),
    color: styleColorSchema.default(DEFAULT_MAP_STYLE.mouseCursorBox.color),
    blockedColor: styleColorSchema.default(DEFAULT_MAP_STYLE.mouseCursorBox.blockedColor),
    shadowColor: styleShadowSchema.default(DEFAULT_MAP_STYLE.mouseCursorBox.shadowColor),
  }).default(() => ({
    ...DEFAULT_MAP_STYLE.mouseCursorBox,
  })),
  operationCursorBox: z.object({
    width: z
      .number()
      .min(MAP_STYLE_LINE_WIDTH_MIN)
      .max(MAP_STYLE_LINE_WIDTH_MAX)
      .default(DEFAULT_MAP_STYLE.operationCursorBox.width),
    color: styleColorSchema.default(DEFAULT_MAP_STYLE.operationCursorBox.color),
    offset: z
      .number()
      .min(MAP_STYLE_OPERATION_OFFSET_MIN)
      .max(MAP_STYLE_OPERATION_OFFSET_MAX)
      .default(DEFAULT_MAP_STYLE.operationCursorBox.offset),
  }).default(() => ({
    ...DEFAULT_MAP_STYLE.operationCursorBox,
  })),
  regionLabel: z.object({
    fontSize: z
      .number()
      .int()
      .min(MAP_STYLE_REGION_LABEL_FONT_MIN)
      .max(MAP_STYLE_REGION_LABEL_FONT_MAX)
      .default(DEFAULT_MAP_STYLE.regionLabel.fontSize),
    strokeWidth: z
      .number()
      .min(MAP_STYLE_REGION_LABEL_STROKE_MIN)
      .max(MAP_STYLE_REGION_LABEL_STROKE_MAX)
      .default(DEFAULT_MAP_STYLE.regionLabel.strokeWidth),
    color: styleColorSchema.default(DEFAULT_MAP_STYLE.regionLabel.color),
    strokeColor: styleColorSchema.default(DEFAULT_MAP_STYLE.regionLabel.strokeColor),
    hoverFontSize: z
      .number()
      .int()
      .min(MAP_STYLE_REGION_LABEL_FONT_MIN)
      .max(MAP_STYLE_REGION_LABEL_FONT_MAX)
      .default(DEFAULT_MAP_STYLE.regionLabel.hoverFontSize),
    hoverColor: styleColorSchema.default(DEFAULT_MAP_STYLE.regionLabel.hoverColor),
    hoverStrokeColor: styleColorSchema.default(DEFAULT_MAP_STYLE.regionLabel.hoverStrokeColor),
  }).default(() => ({
    ...DEFAULT_MAP_STYLE.regionLabel,
  })),
  regionOutline: z
    .object({
      width: regionOutlineWidthSchema,
      color: styleColorSchema.default(DEFAULT_MAP_STYLE.regionOutline.color),
    })
    .default(() => ({ ...DEFAULT_MAP_STYLE.regionOutline })),
  regionHighlight: styleLineSchema(DEFAULT_MAP_STYLE.regionHighlight).default(() => ({
    ...DEFAULT_MAP_STYLE.regionHighlight,
  })),
  // v0.3.9 FEAT-E02: ruler text size + the text→board gap.
  ruler: z
    .object({
      fontSize: z
        .number()
        .int()
        .min(MAP_STYLE_RULER_FONT_MIN)
        .max(MAP_STYLE_RULER_FONT_MAX)
        .default(DEFAULT_MAP_STYLE.ruler.fontSize),
      gap: z
        .number()
        .min(MAP_STYLE_RULER_GAP_MIN)
        .max(MAP_STYLE_RULER_GAP_MAX)
        .default(DEFAULT_MAP_STYLE.ruler.gap),
    })
    .default(() => ({ ...DEFAULT_MAP_STYLE.ruler })),
})
  /**
   * v0.5.0 FEAT-K14: `.strict()` so a v2 `style.linkageColors` block is
   * **rejected** instead of silently stripped — the web import path relies on
   * that to tell the author "this JSON is the old shape" (docs/v0.5.0.md §8.4).
   */
  .strict();

export const draftItemRefSchema = z.object({
  itemId: z.number().int().positive(),
});

export const draftAnchorItemSchema = z.object({
  itemId: z.number().int().positive(),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});

export const draftCellSchema = z
  .object({
    background: draftItemRefSchema.optional(),
    object: draftAnchorItemSchema.optional(),
    objectRef: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const draftRegionSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1, '区域名称不能为空').max(REGION_NAME_MAX_LENGTH),
    color: regionColorSchema.default(DEFAULT_REGION_COLOR),
    borderWidth: z
      .number()
      .int()
      .min(REGION_BORDER_WIDTH_MIN)
      .max(REGION_BORDER_WIDTH_MAX)
      .default(REGION_BORDER_WIDTH_DEFAULT),
    fillOpacity: z
      .number()
      .min(REGION_FILL_OPACITY_MIN)
      .max(REGION_FILL_OPACITY_MAX)
      .default(REGION_FILL_OPACITY_DEFAULT),
    cells: z.array(z.tuple([coordSchema, coordSchema])).min(1, '区域至少包含一个单元格'),
    labelCell: z.tuple([coordSchema, coordSchema]).nullable().optional(),
  })
  .strict();

export const characterSlotSchema = z.object({
  characterId: z.number().int().positive(),
});

/**
 * CLAR-603 + MOD-702/801 + FEAT-E01: a roster slot carries participant linkage
 * directly. The roster length equals `gridSize`; null entries represent empty
 * slots. `clue` is an optional one-line clue text (0-200 chars, supports
 * `**bold**`). `linkages` is the flat MOD-801 list (no click/touch grouping).
 *
 * FEAT-E01 (docs/v0.4.1.md §7.4): `positionConditions` is the optional set of
 * cells this participant may occupy (OR-ed). Old drafts without the field stay
 * valid — an absent list means "no positional constraint".
 */
export const characterSlotEntrySchema = z
  .object({
    characterId: z.number().int().positive(),
    themeColor: themeColorSchema,
    clue: z.string().trim().max(200).default(''),
    linkages: participantLinkagesSchema,
    positionConditions: z
      .array(z.object({ x: coordSchema, y: coordSchema }).strict())
      .optional(),
  })
  // MOD-801: legacy `triggers` payloads are rejected, not silently stripped.
  .strict();

/**
 * v0.5.0 FEAT-K14: the map draft is pure canvas — `characterSlots` and
 * `style.linkageColors` moved to {@link PuzzleDraft}, so the old
 * `superRefine` that cross-checked participant linkages is gone with them.
 * Every remaining reference (regions / cells) is inside this payload, which is
 * why the schema is now a plain `.strict()` object.
 *
 * `.strict()` also means a **v2 payload is rejected**; the server absorbs those
 * on read (`service/mapDraftCompat.ts`) rather than rewriting stored data.
 */
export const mapDraftSchema = z
  .object({
    version: z.number().int().positive(),
    gridSize: z.number().int().min(GRID_SIZE_MIN).max(GRID_SIZE_MAX),
    cells: z.record(cellKeySchema, draftCellSchema),
    regions: z.array(draftRegionSchema),
    /**
     * v0.3.8 FEAT-D02: optional so `version = 1` drafts keep validating; a
     * missing block resolves to `DEFAULT_MAP_STYLE` at render time.
     */
    style: mapStyleSchema.optional(),
  })
  .strict();

export const createRegionInputSchema = draftRegionSchema.omit({ id: true });
export const updateRegionInputSchema = draftRegionSchema.omit({ id: true }).partial();

export const saveMapDraftSchema = z.object({
  data: mapDraftSchema,
  updatedAt: z.string().nullable().optional(),
});

export const importMapSchema = z.object({
  data: mapDraftSchema,
});

export const updateGridSizeSchema = z.object({
  gridSize: z.number().int().min(GRID_SIZE_MIN).max(GRID_SIZE_MAX),
});

/**
 * v0.5.0 §8.4: the parts of a v2 map payload that now belong to a puzzle. A
 * `.strict()` parse would reject such a file with a generic message, so both
 * the web (before sending) and the server (before parsing) call this to say
 * **what** is wrong and where to import it instead.
 */
export function legacyMapDraftBlocks(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  const blocks: string[] = [];
  if ('characterSlots' in record) blocks.push('参与者（characterSlots）');
  const style = record['style'];
  if (typeof style === 'object' && style !== null && 'linkageColors' in style) {
    blocks.push('联动主题色（style.linkageColors）');
  }
  return blocks;
}

export const publishSchema = z.object({
  notes: z.string().trim().max(PROJECT_NOTE_MAX_LENGTH).optional().nullable(),
});

export const listVersionsQuerySchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const regionStringIdParamSchema = z.object({
  regionId: z.string().trim().min(1).max(64),
});

export type DraftItemRefInput = z.infer<typeof draftItemRefSchema>;
export type DraftAnchorItemInput = z.infer<typeof draftAnchorItemSchema>;
export type DraftCellInput = z.infer<typeof draftCellSchema>;
export type DraftRegionInput = z.infer<typeof draftRegionSchema>;
export type MapDraftInput = z.infer<typeof mapDraftSchema>;
export type MapStyleInput = z.infer<typeof mapStyleSchema>;
export type MapLinkageColorInput = z.infer<typeof mapLinkageColorSchema>;
export type SaveMapDraftInput = z.infer<typeof saveMapDraftSchema>;
export type ImportMapInput = z.infer<typeof importMapSchema>;
export type UpdateGridSizeInput = z.infer<typeof updateGridSizeSchema>;
export type PublishInput = z.infer<typeof publishSchema>;
