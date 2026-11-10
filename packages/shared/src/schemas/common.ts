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

/**
 * v0.8.6（docs/v0.8.6.md §4）：玩家侧那张**符号小图** —— 标记、按钮图标、
 * 计时环 / 校验圈都是同一种「一张上传图」。
 *
 * 只存 `storage/uploads` 下的**相对路径**（如 `puzzles/12/mark/<uuid>.webp`），
 * 不存绝对 URL：`PUBLIC_BASE_URL` 会随环境变（端口、域名），存进 JSON 的那一刻写死的
 * 地址，换个环境就指向别人的服务器。渲染时由 `fileUrlFromPath` 拼成站内地址。
 *
 * 路径必须至少两段、不能含 `..` —— 它是交给 `resolveUploadPath` 去读文件的，放一个
 * 可以往上跳的路径进来等于把一个任意文件读取的口子写进数据。
 */
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

/**
 * `null` 与整键缺席等价 = 默认的 `×` 字形 —— 所以「素材被删了就回到 ×」不会把
 * 草稿写坏。主题缺省与谜题各自用同一个形状。
 */
export const uploadedImageSchema = z
  .object({ path: uploadedImagePathSchema })
  .strict();

/**
 * v0.9.5：这一枚**可选**的符号图。`null` / 缺席 = 跟随上一层（谜题→主题→内置）。
 *
 * 不改名会把「谁在用哪一种」搅在一起：`uploadedImageSchema` 是**形状**，
 * 这个是「可以被覆盖掉的那一格」。
 */
export const optionalUploadedImageSchema = uploadedImageSchema.nullable().optional();

/**
 * v0.9.5：**旧键兼容** —— 把 `forbiddenSymbol` 搬到 `mark`。
 *
 * v0.9.5 之前这个字段叫 `forbiddenSymbol`，库里的 JSON 与已发布的版本行、已导出的
 * 资源包都还带着旧名字。用 `z.preprocess` 在读入那一刻搬过来，而不是写一份
 * 「新旧两套字段」：两份字段会让每个读点都要判「哪个有值」，而它们本来就该是
 * 同一个东西。写出去时只写新键（迁移会把存量行改完，之后这条兜底只服务旧包 /
 * 冻结行）。
 *
 * 只搬 `forbiddenSymbol → mark` 这一对。主题顶层的 `pressRing` 不属于这里 ——
 * 它并进的是 `ThemeData.ring`，由 `themeRingSchema` 自己处理（两者是不同的键）。
 */
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

/**
 * v0.8.7 §7：游戏页三枚动作按钮的图标（清除 / 撤回 / 提交）。
 *
 * 与标记同一个形状、同一条路径校验 —— 它们都是「一张上传图」，只是画的位置不同。
 * `kind` 落进地址段，所以先在这里把它守成一个枚举：一个拼错的 `tool-icons/claer`
 * 该是 400，而不是「上传成功但哪儿也没变」。
 */
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
