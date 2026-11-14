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
  MAP_NOTE_MAX_LENGTH,
  PARTICIPANT_DISPLAY_NUMBER_MAX,
  REGION_BORDER_WIDTH_MAX,
  REGION_BORDER_WIDTH_MIN,
  REGION_NAME_MAX_LENGTH,
} from '../constants';
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

/**
 * v0.7.4: the region label's typeface — a **font name** (`WenKai`, `霞鹜文楷`)
 * or one of the built-in keys (`system` / `serif` …).
 *
 * Not an enum any more: the set of selectable fonts is whatever lives in
 * `packages/web/src/assets/fonts/`, which `shared` must not know about. What is
 * still enforced is the *shape* of the name — length plus a character set that
 * cannot break out of the quoted slot in the CSS fallback chain
 * (`MAP_STYLE_FONT_FAMILY_NAME_PATTERN`). A name that survives here is safe to
 * render, and a name that came from another build simply falls back at render
 * time instead of failing the parse.
 */
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
  // v0.9.1：画布阴影 —— 偏移（格的百分比，v0.10.7 起；100 = 一格）+ 颜色（透明度固定 0.3）。
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
  // v0.5.2 SPEC-M07：操作光标框。`offset` 是外扩距离，v0.10.7 起按格的百分比记（100 = 一格）。
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
      /**
       * v0.10.8：标尺前缀符号（默认 C / R）。允许为空串 —— 只显示数字也是一种读法。
       *
       * 这两项**只有主题在配**：`mapStyleSchema` 同时被地图草稿与主题的 `data.style`
       * 用着，所以字段留在 schema 里（主题要靠它存）；但地图草稿里的同名值
       * v0.10.8 起**不参与渲染**（`MapRulerStrips` 按 `themeCode` 查主题），
       * 保存地图时也会被剥掉（`stripRulerSymbols`），免得库里留着两处互相矛盾的值。
       *
       * **刻意不给 `.default()`**：给了的话，任何一张地图只要存一次盘，就会把
       * 出厂符号材料化成字面量写进 `maps.data`，正是这次要清掉的东西。缺席 =
       * 用 `MAP_STYLE_RULER_DEFAULT_SYMBOLS`，读的时候才补。
       */
      columnSymbol: z.string().max(MAP_STYLE_RULER_SYMBOL_MAX_LENGTH).optional(),
      rowSymbol: z.string().max(MAP_STYLE_RULER_SYMBOL_MAX_LENGTH).optional(),
    })
    .default(() => ({ ...DEFAULT_MAP_STYLE.ruler })),
})
  /**
   * v0.5.0 FEAT-K14: `.strict()` so a v2 `style.linkageColors` block is
   * **rejected** instead of silently stripped — the web import path relies on
   * that to tell the author "this JSON is the old shape" (docs/v0.5.0.md §8.4).
   */
  .strict();

/**
 * v0.7.6 (docs/v0.7.6.md §10): the anchor key used to be `formId`, back when the
 * table was `asset_forms`. Stored drafts are rewritten by migration
 * `20260101000035`, but a JSON file exported before that still carries the old
 * key — accept it and normalise, the same way `projectId` is accepted for
 * `mapId` in `puzzleMapRefSchema`. Without this the key would be **silently
 * stripped** (inner anchors are not `.strict()`) and a multi-variant asset would
 * quietly fall back to its first look.
 */
function withLegacyAnchorKey<T extends z.ZodTypeAny>(schema: T): T {
  return z.preprocess((raw) => {
    if (raw && typeof raw === 'object' && 'formId' in raw && !('variantId' in raw)) {
      const { formId, ...rest } = raw as Record<string, unknown>;
      return { ...rest, variantId: formId };
    }
    return raw;
  }, schema) as unknown as T;
}

/** v0.6.0: the background layer — one asset, no footprint. */
export const draftAssetRefSchema = withLegacyAnchorKey(
  z.object({
    assetId: z.number().int().positive(),
    /**
     * v0.6.1: optional for the same reason as the item anchor — a payload
     * written before background assets could have several variants keeps
     * validating, and rendering falls back to the asset's first variant.
     * `draftCellSchema` is `.strict()`, so the key has to be declared here.
     */
    variantId: z.number().int().positive().optional(),
  }),
);

/**
 * v0.6.0: the item layer — the anchor cell carries the footprint.
 *
 * v0.6.1: `variantId` is **optional on purpose** — a v4 payload has no such key and
 * must keep validating; rendering falls back to the asset's first variant.
 * `draftCellSchema` is `.strict()`, so the key has to be declared here or new
 * writes would be rejected.
 */
export const draftAnchorItemSchema = withLegacyAnchorKey(
  z.object({
    assetId: z.number().int().positive(),
    variantId: z.number().int().positive().optional(),
    /**
     * v0.7.6: the footprint is still stored **per placement** — it just no longer
     * comes from the variant (every new placement writes 1). Old drafts keep
     * their 2×2 so published maps render exactly as before.
     */
    w: z.number().int().min(1),
    h: z.number().int().min(1),
  /**
   * v0.7.5 (docs/v0.7.5.md §3): the display transform. Optional so every draft
   * written before this version keeps validating — absent means identity.
   * Offsets are in **cells** and may be negative (artwork poking out to the
   * left / up); the renderer clamps again through `resolveItemTransform`.
   */
    scale: z.number().min(ITEM_SCALE_MIN).max(ITEM_SCALE_MAX).optional(),
    offsetX: z.number().min(ITEM_OFFSET_MIN).max(ITEM_OFFSET_MAX).optional(),
    offsetY: z.number().min(ITEM_OFFSET_MIN).max(ITEM_OFFSET_MAX).optional(),
  }),
);

export const draftCellSchema = z
  .object({
    background: draftAssetRefSchema.optional(),
    item: draftAnchorItemSchema.optional(),
    itemRef: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

// ---- v0.7.0 区域自有样式（docs/v0.7.0.md §4） ----
/**
 * 区域级覆盖：与地图级缺省同一套边界，但**没有默认值**——缺省在地图级，
 * 区域只记自己改过的字段（深 partial）。三个子对象都可整个缺席。
 */
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
    /**
     * v0.9.6：这块区域的标签往哪偏（画布像素，相对「格子上沿居中」）。
     *
     * x / y 都可缺：只改一个方向的作者不该被迫填另一个。整块缺席 = 不偏移。
     *
     * v0.10.7：**去掉了 ±200 的上下限**。原来那对常量是为了「别让标签跑没」，
     * 但标签被推到画面外之后照样能点回来（区域列表里点一下就能选中），而这个
     * 限制反而把「把标签推到远处、让一整块区域留白」这种排版挡死了。现在只要求
     * 是有限数字，取整的夹取在 web 侧的两处 clamp 里做。
     */
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
     * v0.7.0: replaces the flat `color` / `borderWidth` / `fillOpacity` trio.
     * `.strict()` rejects a v6 region payload on write; migration
     * `20260101000030` rewrote the stored rows.
     */
    style: regionStyleOverrideSchema.optional(),
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
 *
 * v0.6.4 (docs/v0.6.4.md §2): `displayNumber` is the optional 编号展示 text.
 * It is trimmed, bounded by {@link PARTICIPANT_DISPLAY_NUMBER_MAX} and stored
 * absent when cleared — the badge then falls back to the sequence number.
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
    displayNumber: z
      .string()
      .trim()
      .max(PARTICIPANT_DISPLAY_NUMBER_MAX, `编号展示不能超过 ${PARTICIPANT_DISPLAY_NUMBER_MAX} 个字符`)
      .nullable()
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

/**
 * 保存整份草稿：只收 `data`，服务端直接后写覆盖（不做并发比对）。
 * 刻意**不加** `.strict()`：旧客户端若还带着 `updatedAt`，会被 zod 忽略而
 * 不是报 400。
 */
export const saveMapDraftSchema = z.object({
  data: mapDraftSchema,
});

export const importMapSchema = z.object({
  data: mapDraftSchema,
});

export const updateGridSizeSchema = z.object({
  gridSize: z.number().int().min(GRID_SIZE_MIN).max(GRID_SIZE_MAX),
});

/**
 * the parts of a v2 map payload that now belong to a puzzle. A
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

/**
 * 发布入参（设计 §4.2）：版本号默认 `MAX+1`，也允许用户填任意正整数（可以
 * 填空洞号），所以 `version` 是可选的 —— 不传就用默认值。上限 9999 只是让
 * `CAST(version AS integer)` 永远安全（`version` 是 text 列）。
 *
 * `.strict()` 保留：多传的 `notes` 会被明确拒绝。
 */
export const publishSchema = z
  .object({
    version: z.number().int().min(1).max(9999).optional(),
  })
  .strict();

/**
 * 「以此为底稿新建」把 fork 的触发时机从「点击即生成」延后到
 * **编辑器里点保存**。版本条目进编辑器（`/maps/:id/edit?v={n}`）只把快照
 * 装进本地 store，保存时才调 fork，并把**编辑器当前画布**写进新行 ——
 * body 的 `data` 就是那一刻的 `editor.toDraft()`。不传（版本历史面板的
 * 「编辑此版本」）时仍用版本快照的 data。
 */
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
