import { z } from 'zod';
import {
  DEFAULT_MAP_STYLE,
  DEFAULT_REGION_LABEL_FONT_FAMILY,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  ITEM_OFFSET_MAX,
  ITEM_OFFSET_MIN,
  ITEM_SCALE_MAX,
  ITEM_SCALE_MIN,
  LINKAGE_COLOR_KEY_PATTERN,
  LINKAGE_COLOR_LABEL_MAX_LENGTH,
  MAP_STYLE_CELL_SIZE_MAX,
  MAP_STYLE_CELL_SIZE_MIN,
  MAP_STYLE_COLOR_PATTERN,
  MAP_STYLE_FONT_FAMILY_NAME_MAX_LENGTH,
  MAP_STYLE_FONT_FAMILY_NAME_PATTERN,
  MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX,
  MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_LINE_WIDTH_MIN,
  MAP_STYLE_OPERATION_OFFSET_MAX,
  MAP_STYLE_OPERATION_OFFSET_MIN,
  MAP_STYLE_REGION_LABEL_FONT_MAX,
  MAP_STYLE_REGION_LABEL_FONT_MIN,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  MAP_STYLE_REGION_LABEL_STROKE_MIN,
  MAP_STYLE_RULER_FONT_MAX,
  MAP_STYLE_RULER_FONT_MIN,
  MAP_STYLE_RULER_GAP_MAX,
  MAP_STYLE_RULER_GAP_MIN,
  MAP_STYLE_RULER_SYMBOL_MAX_LENGTH,
  MAP_STYLE_SHADOW_OFFSET_MAX,
  MAP_STYLE_SHADOW_OFFSET_MIN,
  PARTICIPANT_DISPLAY_NUMBER_MAX,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  REGION_NAME_MAX_LENGTH,
} from '../constants';
import { participantLinkagesSchema, themeColorSchema } from './participant';

const coordSchema = z.number().int().min(0).max(GRID_SIZE_MAX * 4);
const cellKeySchema = z.string().regex(/^\d+,\d+$/, '单元格坐标格式应为 "x,y"');

// ---- FEAT-D02 地图样式（地图级缺省值） ----
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

/** Region label typeface: a font **name** (`WenKai`) or built-in key (`system`); only its *shape* is enforced (charset cannot break the CSS fallback chain), unknown names fall back at render. */
const fontFamilySchema = z
  .string()
  .trim()
  .min(1)
  .max(MAP_STYLE_FONT_FAMILY_NAME_MAX_LENGTH)
  .regex(MAP_STYLE_FONT_FAMILY_NAME_PATTERN, 'fontFamily 需为字体名（不含引号 / 逗号 / 分号）');

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
  // 画布阴影 —— 偏移（格的百分比；100 = 一格）+ 颜色（透明度固定 0.3）。
  canvasShadow: z
    .object({
      offset: z
        .number()
        .min(MAP_STYLE_SHADOW_OFFSET_MIN)
        .max(MAP_STYLE_SHADOW_OFFSET_MAX)
        .default(DEFAULT_MAP_STYLE.canvasShadow.offset),
      color: styleColorSchema.default(DEFAULT_MAP_STYLE.canvasShadow.color),
    })
    .default(() => ({ ...DEFAULT_MAP_STYLE.canvasShadow })),
  // v0.9.1 §5：物品描边 —— 宽度 0 即关闭（出厂默认），颜色 #RRGGBB。
  itemOutline: z
    .object({
      width: z
        .number()
        .min(MAP_STYLE_ITEM_OUTLINE_WIDTH_MIN)
        .max(MAP_STYLE_ITEM_OUTLINE_WIDTH_MAX)
        .default(DEFAULT_MAP_STYLE.itemOutline.width),
      color: styleColorSchema.default(DEFAULT_MAP_STYLE.itemOutline.color),
    })
    .default(() => ({ ...DEFAULT_MAP_STYLE.itemOutline })),
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
  // 操作光标框。`offset` 是外扩距离，按格的百分比记（100 = 一格）。
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
    fontFamily: fontFamilySchema.default(DEFAULT_REGION_LABEL_FONT_FAMILY),
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
    hoverStrokeWidth: z
      .number()
      .min(MAP_STYLE_REGION_LABEL_STROKE_MIN)
      .max(MAP_STYLE_REGION_LABEL_STROKE_MAX)
      .default(DEFAULT_MAP_STYLE.regionLabel.hoverStrokeWidth),
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
  // Ruler text size + the text→board gap.
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
      /** 标尺前缀符号（默认 C / R，空串合法）：**只有主题在配**；地图草稿里的值不渲染、保存时被剥掉（`stripRulerSymbols`），且**刻意无 `.default()`** —— 否则一次存盘就把出厂符号写进 `maps.data`。缺席 = `MAP_STYLE_RULER_DEFAULT_SYMBOLS`。 */
      columnSymbol: z.string().max(MAP_STYLE_RULER_SYMBOL_MAX_LENGTH).optional(),
      rowSymbol: z.string().max(MAP_STYLE_RULER_SYMBOL_MAX_LENGTH).optional(),
    })
    .default(() => ({ ...DEFAULT_MAP_STYLE.ruler })),
})
  /** FEAT-K14: `.strict()` so a v2 `style.linkageColors` block is **rejected**, not stripped — the web import path uses that to say "this is the old shape" (docs/v0.5.0.md §8.4). */
  .strict();

/** 旧键 `formId → variantId`（v0.7.6 §10；迁移 `20260101000035` 已改写存量）：不收它会被静默剥掉（内层非 `.strict()`），多变体素材退回第一种样式。 */
function withLegacyAnchorKey<T extends z.ZodTypeAny>(schema: T): T {
  return z.preprocess((raw) => {
    if (raw && typeof raw === 'object' && 'formId' in raw && !('variantId' in raw)) {
      const { formId, ...rest } = raw as Record<string, unknown>;
      return { ...rest, variantId: formId };
    }
    return raw;
  }, schema) as unknown as T;
}

/** The background layer — one asset, no footprint. */
export const draftAssetRefSchema = withLegacyAnchorKey(
  z.object({
    assetId: z.number().int().positive(),
    /** 可缺：早于多变体背景的旧数据仍要用；渲染退回素材第一变体，`draftCellSchema` 是 `.strict()` 故须在此声明。 */
    variantId: z.number().int().positive().optional(),
  }),
);

/** 物品层：占位尺寸挂在锚点格。`variantId` 可缺（v4 无此键），渲染退回第一变体；`.strict()` 故须声明。 */
export const draftAnchorItemSchema = withLegacyAnchorKey(
  z.object({
    assetId: z.number().int().positive(),
    variantId: z.number().int().positive().optional(),
    /** 占位尺寸**按次存**（新放置一律 1）；旧草稿保留 2×2，已发布地图照旧渲染。 */
    w: z.number().int().min(1),
    h: z.number().int().min(1),
  /** 显示变换（v0.7.5 §3）：可缺 = 恒等；偏移单位是**格**、可为负，渲染再由 `resolveItemTransform` 夹取。 */
    scale: z.number().min(ITEM_SCALE_MIN).max(ITEM_SCALE_MAX).optional(),
    offsetX: z.number().min(ITEM_OFFSET_MIN).max(ITEM_OFFSET_MAX).optional(),
    offsetY: z.number().min(ITEM_OFFSET_MIN).max(ITEM_OFFSET_MAX).optional(),
  }),
);

export const draftCellSchema = z
  .object({
    background: draftAssetRefSchema.optional(),
    /** The 背景修饰 layer — always 1×1, coexists with background / item. */
    decoration: draftAssetRefSchema.optional(),
    item: draftAnchorItemSchema.optional(),
    itemRef: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

// ---- v0.7.0 区域自有样式（docs/v0.7.0.md §4） ----
/** 区域级覆盖：与地图级同一套边界但**无默认值**（缺省在地图级），只记改过的字段（深 partial）。 */
const regionOutlineOverrideSchema = z
  .object({
    width: z.number().int().min(REGION_BORDER_WIDTH_MIN).max(REGION_BORDER_WIDTH_MAX).optional(),
    color: styleColorSchema.optional(),
  })
  .strict();

const regionHighlightOverrideSchema = z
  .object({
    width: z.number().min(MAP_STYLE_LINE_WIDTH_MIN).max(MAP_STYLE_LINE_WIDTH_MAX).optional(),
    color: styleColorSchema.optional(),
  })
  .strict();

const regionLabelOverrideSchema = z
  .object({
    fontFamily: fontFamilySchema.optional(),
    fontSize: z
      .number()
      .int()
      .min(MAP_STYLE_REGION_LABEL_FONT_MIN)
      .max(MAP_STYLE_REGION_LABEL_FONT_MAX)
      .optional(),
    strokeWidth: z
      .number()
      .min(MAP_STYLE_REGION_LABEL_STROKE_MIN)
      .max(MAP_STYLE_REGION_LABEL_STROKE_MAX)
      .optional(),
    color: styleColorSchema.optional(),
    strokeColor: styleColorSchema.optional(),
    hoverFontSize: z
      .number()
      .int()
      .min(MAP_STYLE_REGION_LABEL_FONT_MIN)
      .max(MAP_STYLE_REGION_LABEL_FONT_MAX)
      .optional(),
    hoverColor: styleColorSchema.optional(),
    hoverStrokeColor: styleColorSchema.optional(),
    hoverStrokeWidth: z
      .number()
      .min(MAP_STYLE_REGION_LABEL_STROKE_MIN)
      .max(MAP_STYLE_REGION_LABEL_STROKE_MAX)
      .optional(),
    /** 标签偏移（画布像素，相对「格子上沿居中」）：x / y 各自可缺；**不设上下限** —— 推到画面外也能在区域列表点回来，取整夹取在 web 侧 clamp。 */
    offset: z
      .object({
        x: z.number().finite().optional(),
        y: z.number().finite().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const regionStyleOverrideSchema = z
  .object({
    outline: regionOutlineOverrideSchema.optional(),
    highlight: regionHighlightOverrideSchema.optional(),
    label: regionLabelOverrideSchema.optional(),
  })
  .strict();

export const draftRegionSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1, '区域名称不能为空').max(REGION_NAME_MAX_LENGTH),
    cells: z.array(z.tuple([coordSchema, coordSchema])).min(1, '区域至少包含一个单元格'),
    labelCell: z.tuple([coordSchema, coordSchema]).nullable().optional(),
    /**
     * `.strict()` rejects a v6 region payload on write.
     */
    style: regionStyleOverrideSchema.optional(),
  })
  .strict();

export const characterSlotSchema = z.object({
  characterId: z.number().int().positive(),
});

/** 名册槽（CLAR-603 / MOD-702 / FEAT-E01）：长度 = `gridSize`，null = 空槽；`clue` ≤200 字、支持 `**bold**`，
 * `positionConditions` 可缺（= 无位置约束），`displayNumber` 清空即缺席、徽章退回序号。 */
export const characterSlotEntrySchema = z
  .object({
    characterId: z.number().int().positive(),
    themeColor: themeColorSchema,
    clue: z.string().trim().max(200).default(''),
    linkages: participantLinkagesSchema,
    positionConditions: z
      .array(z.object({ x: coordSchema, y: coordSchema }).strict())
      .optional(),
    displayNumber: z
      .string()
      .trim()
      .max(PARTICIPANT_DISPLAY_NUMBER_MAX, `编号展示不能超过 ${PARTICIPANT_DISPLAY_NUMBER_MAX} 个字符`)
      .nullable()
      .optional(),
  })
  // MOD-801: legacy `triggers` payloads are rejected, not silently stripped.
  .strict();

/** 地图草稿是纯画布：`characterSlots` / `style.linkageColors` 归谜题。`.strict()` 连 v2 payload 也拒；服务端读取时经 `service/mapDraftCompat.ts` 吸收，不改存量。 */
export const mapDraftSchema = z
  .object({
    version: z.number().int().positive(),
    gridSize: z.number().int().min(GRID_SIZE_MIN).max(GRID_SIZE_MAX),
    cells: z.record(cellKeySchema, draftCellSchema),
    regions: z.array(draftRegionSchema),
    /** 可缺：`version = 1` 草稿仍要能校验；缺省在渲染时解析为 `DEFAULT_MAP_STYLE`。 */
    style: mapStyleSchema.optional(),
  })
  .strict();

export const createRegionInputSchema = draftRegionSchema.omit({ id: true });
export const updateRegionInputSchema = draftRegionSchema.omit({ id: true }).partial();

/** 保存整份草稿：只收 `data`、后写覆盖（无并发比对）；刻意**不加** `.strict()`，旧客户端的 `updatedAt` 被忽略而非 400。 */
export const saveMapDraftSchema = z.object({
  data: mapDraftSchema,
});

export const importMapSchema = z.object({
  data: mapDraftSchema,
});

export const updateGridSizeSchema = z.object({
  gridSize: z.number().int().min(GRID_SIZE_MIN).max(GRID_SIZE_MAX),
});

/** v2 地图里已归属谜题的部分：`.strict()` 只会报「无效」，故 web 与 server 都先调它说清**哪里**错了、该去导入谜题。 */
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

/** 发布入参（§4.2）：`version` 可缺（默认 `MAX+1`，可填空洞号）；上限 9999 保证 text 列 `CAST(version AS integer)` 安全；`.strict()` 明确拒绝 `notes`。 */
export const publishSchema = z
  .object({
    version: z.number().int().min(1).max(9999).optional(),
  })
  .strict();

/** 「以此为底稿新建」延后到在编辑器点保存才 fork：`data` 不传 = 用版本快照（版本历史面板的老行为）。 */
export const forkVersionBodySchema = z.object({
  data: mapDraftSchema.optional(),
});

export const listVersionsQuerySchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const regionStringIdParamSchema = z.object({
  regionId: z.string().trim().min(1).max(64),
});

export type DraftAssetRefInput = z.infer<typeof draftAssetRefSchema>;
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
export type ForkVersionInput = z.infer<typeof forkVersionBodySchema>;
