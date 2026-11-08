import { z } from 'zod';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  FORBIDDEN_SYMBOL_PATH_MAX_LENGTH,
  MAX_PAGE_SIZE,
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
 * v0.8.6（docs/v0.8.6.md §4）：玩家侧「禁止符号」那一张上传图。
 *
 * 只存 `storage/uploads` 下的**相对路径**（如 `puzzles/12/forbidden-symbol/<uuid>.webp`），
 * 不存绝对 URL：`PUBLIC_BASE_URL` 会随环境变（端口、域名），存进 JSON 的那一刻写死的
 * 地址，换个环境就指向别人的服务器。渲染时由 `fileUrlFromPath` 拼成站内地址。
 *
 * 路径必须至少两段、不能含 `..` —— 它是交给 `resolveUploadPath` 去读文件的，放一个
 * 可以往上跳的路径进来等于把一个任意文件读取的口子写进数据。
 */
export const forbiddenSymbolPathSchema = z
  .string()
  .trim()
  .min(1, '禁止符号图片路径不能为空')
  .max(
    FORBIDDEN_SYMBOL_PATH_MAX_LENGTH,
    `禁止符号图片路径不能超过 ${FORBIDDEN_SYMBOL_PATH_MAX_LENGTH} 个字符`,
  )
  .regex(
    /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$/,
    '禁止符号图片路径格式不正确',
  )
  .refine(
    (value) => !value.split('/').includes('..'),
    '禁止符号图片路径不能包含 ..',
  );

/**
 * `null` 与整键缺席等价 = 默认的 `×` 字形 —— 所以「素材被删了就回到 ×」不会把
 * 草稿写坏。主题缺省与谜题各自用同一个形状。
 */
export const forbiddenSymbolImageSchema = z
  .object({ path: forbiddenSymbolPathSchema })
  .strict();

export const forbiddenSymbolSchema = forbiddenSymbolImageSchema.nullable().optional();
