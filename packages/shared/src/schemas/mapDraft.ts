import { z } from 'zod';
import {
  DEFAULT_LINKAGE_COLORS,
  DEFAULT_MAP_STYLE,
  DEFAULT_REGION_COLOR,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  LINKAGE_COLOR_KEY_PATTERN,
  LINKAGE_COLOR_LABEL_MAX_LENGTH,
  LINKAGE_COLOR_MAX_COUNT,
  LINKAGE_COLOR_MIN_COUNT,
  MAP_STYLE_CELL_SIZE_MAX,
  MAP_STYLE_CELL_SIZE_MIN,
  MAP_STYLE_COLOR_PATTERN,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAP_STYLE_OPERATION_OFFSET_MAX,
  MAP_STYLE_OPERATION_OFFSET_MIN,
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

const regionBorderWidthSchema = z
  .number()
  .int()
  .min(REGION_BORDER_WIDTH_MIN)
  .max(REGION_BORDER_WIDTH_MAX)
  .default(DEFAULT_MAP_STYLE.regionBorder.width);

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
  border: styleLineSchema(DEFAULT_MAP_STYLE.border).default(() => ({
    ...DEFAULT_MAP_STYLE.border,
  })),
  mouseCursor: z.object({
    width: z
      .number()
      .min(MAP_STYLE_LINE_WIDTH_MIN)
      .max(MAP_STYLE_LINE_WIDTH_MAX)
      .default(DEFAULT_MAP_STYLE.mouseCursor.width),
    color: styleColorSchema.default(DEFAULT_MAP_STYLE.mouseCursor.color),
    blockedColor: styleColorSchema.default(DEFAULT_MAP_STYLE.mouseCursor.blockedColor),
    shadowColor: styleShadowSchema.default(DEFAULT_MAP_STYLE.mouseCursor.shadowColor),
  }).default(() => ({
    ...DEFAULT_MAP_STYLE.mouseCursor,
  })),
  operationCursor: z.object({
    width: z
      .number()
      .min(MAP_STYLE_LINE_WIDTH_MIN)
      .max(MAP_STYLE_LINE_WIDTH_MAX)
      .default(DEFAULT_MAP_STYLE.operationCursor.width),
    color: styleColorSchema.default(DEFAULT_MAP_STYLE.operationCursor.color),
    offset: z
      .number()
      .min(MAP_STYLE_OPERATION_OFFSET_MIN)
      .max(MAP_STYLE_OPERATION_OFFSET_MAX)
      .default(DEFAULT_MAP_STYLE.operationCursor.offset),
  }).default(() => ({
    ...DEFAULT_MAP_STYLE.operationCursor,
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
  regionBorder: z
    .object({
      width: regionBorderWidthSchema,
      color: styleColorSchema.default(DEFAULT_MAP_STYLE.regionBorder.color),
    })
    .default(() => ({ ...DEFAULT_MAP_STYLE.regionBorder })),
  regionHighlight: styleLineSchema(DEFAULT_MAP_STYLE.regionHighlight).default(() => ({
    ...DEFAULT_MAP_STYLE.regionHighlight,
  })),
  linkageColors: z
    .array(mapLinkageColorSchema)
    .min(LINKAGE_COLOR_MIN_COUNT, '联动主题色至少保留 2 项')
    .max(LINKAGE_COLOR_MAX_COUNT, '联动主题色最多 12 项')
    .default(DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry }))),
});

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
 * CLAR-603 + MOD-702/801: a roster slot carries participant linkage directly.
 * The roster length equals `gridSize`; null entries represent empty slots.
 * `clue` is an optional one-line clue text (0-200 chars, supports `**bold**`).
 * `linkages` is the flat MOD-801 list (no click/touch grouping).
 */
export const characterSlotEntrySchema = z
  .object({
    characterId: z.number().int().positive(),
    themeColor: themeColorSchema,
    clue: z.string().trim().max(200).default(''),
    linkages: participantLinkagesSchema,
  })
  // MOD-801: legacy `triggers` payloads are rejected, not silently stripped.
  .strict();

/**
 * CLAR-603: validates that every participant linkage references an object
 * that exists in the same map. Linkages reference:
 *   - characters → another roster slot's `characterId`
 *   - items      → an object anchor in `cells`
 *   - cells      → within the `gridSize` square
 *   - regions    → a `regions[i].id`
 */
function validateParticipantReferences(
  draft: z.output<typeof mapDraftBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  const participantIds = new Set<number>();
  for (const slot of draft.characterSlots) {
    if (slot) participantIds.add(slot.characterId);
  }
  const objectItemIds = new Set<number>();
  for (const cell of Object.values(draft.cells)) {
    if (cell.object) objectItemIds.add(cell.object.itemId);
  }
  const regionIds = new Set(draft.regions.map((region) => region.id));
  /**
   * FEAT-D04 §「保存时校验」: every linkage colour must be a key of **this
   * map's** palette. A draft without a `style` block falls back to the
   * built-in `red` / `blue` defaults.
   */
  const palette = new Set(
    (draft.style?.linkageColors ?? DEFAULT_LINKAGE_COLORS).map((entry) => entry.key),
  );

  draft.characterSlots.forEach((slot, slotIndex) => {
    if (!slot) return;
    // MOD-801: flat linkages list (was: triggers[].targets).
    slot.linkages.forEach((target, targetIndex) => {
      const path = ['characterSlots', slotIndex, 'linkages'];
      void targetIndex;
      if (!palette.has(target.color)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, targetIndex, 'color'],
          message: `联动主题色 ${target.color} 未在调色板中定义`,
        });
      }
      if (target.type === 'character' && !participantIds.has(target.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `联动目标角色 #${target.id} 不在参与者中`,
        });
      }
      if (target.type === 'item' && !objectItemIds.has(target.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `联动目标物品 #${target.id} 不在地图中`,
        });
      }
      if (target.type === 'region' && !regionIds.has(target.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `联动目标区域 ${target.id} 不在地图中`,
        });
      }
      // MOD-708: cell targets have a `cells` array — validate each coord.
      if (target.type === 'cell') {
        for (const [cx, cy] of target.cells) {
          if (cx >= draft.gridSize || cy >= draft.gridSize) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path,
              message: `联动目标方格 (${cx}, ${cy}) 超出画布范围`,
            });
            break;
          }
        }
      }
    });
  });
}

const mapDraftBaseSchema = z
  .object({
    version: z.number().int().positive(),
    gridSize: z.number().int().min(GRID_SIZE_MIN).max(GRID_SIZE_MAX),
    cells: z.record(cellKeySchema, draftCellSchema),
    regions: z.array(draftRegionSchema),
    characterSlots: z.array(characterSlotEntrySchema.nullable()),
    /**
     * v0.3.8 FEAT-D02: optional so `version = 1` drafts keep validating; a
     * missing block resolves to `DEFAULT_MAP_STYLE` at render time.
     */
    style: mapStyleSchema.optional(),
  })
  .strict();

export const mapDraftSchema = mapDraftBaseSchema.superRefine((draft, ctx) =>
  validateParticipantReferences(draft, ctx),
);

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
