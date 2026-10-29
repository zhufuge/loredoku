import { z } from 'zod';
import { blockingFor } from '../assetRules';
import { bgColorSchema } from './appearance';
import { themeCodeSchema } from './theme';
import {
  ASSET_CODE_MAX_LENGTH,
  ASSET_CODE_PATTERN,
  ASSET_FIT_MODES,
  ASSET_NAME_MAX_LENGTH,
  ASSET_TYPES,
  DEFAULT_ASSET_FIT_MODE,
  DEFAULT_ASSET_TYPE,
  EFFECT_TYPES,
} from '../constants';

export const effectTypeSchema = z.enum(EFFECT_TYPES);

/**
 * v0.5.2 SPEC-M06 (docs/v0.5.2.md §6): the image fill mode is **in use** —
 * `MapAssetLayers` reads it for `object-fit` on both the background and the
 * item layer — so it stays.
 */
export const assetFitModeSchema = z.enum(ASSET_FIT_MODES);

export const assetCodeSchema = z
  .string()
  .trim()
  .min(1, '业务 ID 不能为空')
  .max(ASSET_CODE_MAX_LENGTH, `业务 ID 长度不能超过 ${ASSET_CODE_MAX_LENGTH}`)
  .regex(ASSET_CODE_PATTERN, '业务 ID 仅允许字母、数字与下划线');

export const assetTypeSchema = z.enum(ASSET_TYPES);

/**
 * v0.5.2 FEAT-M03: the free-form `meta` blob and the whole trigger feature are
 * gone — §3.1 lists every symbol that went with them.
 *
 * v0.5.2 FEAT-M04: both schemas normalise `blocking` through `blockingFor`, so
 * a background asset never blocks no matter what the caller sent.
 *
 * v0.6.1: the footprint and the appearance belong to a **variant**, so they left
 * the asset payload. Creating an asset still takes the initial variant's
 * appearance (`bgColor` / `fitMode`) — the server writes them into the single
 * 「默认」 variant it creates alongside (docs/v0.6.1.md §5.2; since v0.7.6 that
 * variant carries no footprint at all — every placement is 1×1).
 */
export const createAssetSchema = z
  .object({
    /**
     * v0.8.0（docs/v0.8.0.md §7.1 / §19）：新建时就要说清建在哪个主题 —— `theme_id`
     * 建行后不可改，「建错主题」的代价是删了重建。
     *
     * **必填，且用编码。** §19 起没有「默认主题」这个落点了（`themes.is_default` 已删）：
     * 猜一个主题比报错更糟 —— 作者会在另一个世界里的列表里找自己刚建的东西。
     */
    themeCode: themeCodeSchema,
    code: assetCodeSchema,
    name: z.string().trim().min(1, '资源名称不能为空').max(ASSET_NAME_MAX_LENGTH),
    type: assetTypeSchema.default(DEFAULT_ASSET_TYPE),
    blocking: z.boolean().default(false),
    /** The initial variant's fill mode; the rest of its look is uploaded later. */
    fitMode: assetFitModeSchema.default(DEFAULT_ASSET_FIT_MODE),
    /** v0.5.1 FEAT-L01: colour-block colour; `null` keeps the image mode. */
    bgColor: bgColorSchema,
    /**
     * v0.5.3 FEAT-N06 (docs/v0.5.3.md §5): create straight into the enabled
     * state when the caller already handed over an appearance (image or colour
     * block). Omitted → `false`, which is exactly OPT-305's "no artwork yet".
     */
    isActive: z.boolean().optional(),
  })
  .transform((value) => ({ ...value, blocking: blockingFor(value.type, value.blocking) }));

/**
 * v0.6.1: `widthCells` / `heightCells` / `fitMode` / `bgColor` are gone — with
 * several variants per asset, "the asset's footprint" is no longer a thing. Use
 * `PATCH /api/assets/:id/variants/:variantId` instead.
 */
export const updateAssetSchema = z
  .object({
    name: z.string().trim().min(1).max(ASSET_NAME_MAX_LENGTH).optional(),
    type: assetTypeSchema.optional(),
    blocking: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .transform((value) =>
    value.blocking === undefined
      ? value
      : { ...value, blocking: blockingFor(value.type ?? DEFAULT_ASSET_TYPE, value.blocking) },
  );

export const listAssetsQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  type: assetTypeSchema.optional(),
  /** §19：按主题编码筛。`undefined` = 全部主题（系统配置页 / 打包体检用）。 */
  themeCode: themeCodeSchema.optional(),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
