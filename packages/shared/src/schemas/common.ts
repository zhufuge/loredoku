import { z } from 'zod';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  GAME_TOOL_ICON_KINDS,
  MAX_PAGE_SIZE,
  SYMBOL_IMAGE_PATH_MAX_LENGTH,
} from '../constants';

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const positiveInt = z.number().int().positive();

/** 符号小图（v0.8.6 §4，标记 / 按钮图标 / 计时环共用）：只存 `storage/uploads` 下的**相对路径**（绝对 URL 换环境就失效）；至少两段、禁 `..` —— 它要交给 `resolveUploadPath` 读文件。 */
export const uploadedImagePathSchema = z
  .string()
  .trim()
  .min(1, '图片路径不能为空')
  .max(
    SYMBOL_IMAGE_PATH_MAX_LENGTH,
    `图片路径不能超过 ${SYMBOL_IMAGE_PATH_MAX_LENGTH} 个字符`,
  )
  .regex(
    /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$/,
    '图片路径格式不正确',
  )
  .refine(
    (value) => !value.split('/').includes('..'),
    '图片路径不能包含 ..',
  );

/** `null` 与整键缺席等价 = 默认 `×`，故「素材被删了就回到 ×」不会把草稿写坏。 */
export const uploadedImageSchema = z
  .object({ path: uploadedImagePathSchema })
  .strict();

/** 可选符号图：`null` / 缺席 = 跟随上一层（谜题 → 主题 → 内置）；名字与形状型 `uploadedImageSchema` 区分开。 */
export const optionalUploadedImageSchema = uploadedImageSchema.nullable().optional();

/** 旧键兼容：读入时把 `forbiddenSymbol` 搬到 `mark`（存量 JSON / 已发布行 / 旧包都带旧名），写出去只写新键；`pressRing` 不在此列，它并进 `ThemeData.ring`。 */
export function withLegacyImageKeys<T extends z.ZodTypeAny>(schema: T): T {
  return z.preprocess((raw) => moveLegacyImageKeys(raw), schema) as unknown as T;
}

/** 见 {@link withLegacyImageKeys}。导出给单测直接喂数据。 */
export function moveLegacyImageKeys(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const record = { ...(raw as Record<string, unknown>) };
  if (!('mark' in record) && 'forbiddenSymbol' in record) {
    record['mark'] = record['forbiddenSymbol'];
  }
  delete record['forbiddenSymbol'];
  return record;
}

/** v0.8.7 §7：三枚动作按钮图标；`kind` 落进地址段，故先守成枚举 —— 拼错的 `tool-icons/claer` 该是 400，而非「上传成功但哪儿也没变」。 */
export const gameToolIconKindSchema = z.enum(GAME_TOOL_ICON_KINDS);

export const gameToolIconsSchema = z
  .object({
    clear: optionalUploadedImageSchema,
    undo: optionalUploadedImageSchema,
    submit: optionalUploadedImageSchema,
  })
  .strict()
  .nullable()
  .optional();

/** `POST /themes/:code/tool-icons/:icon` 与谜题侧同款的一条路径参数。 */
export const toolIconParamSchema = z.object({ icon: gameToolIconKindSchema });
