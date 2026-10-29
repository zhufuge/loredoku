import { z } from 'zod';
import {
  DEFAULT_THEME_CODE,
  THEME_CODE_MAX_LENGTH,
  THEME_CODE_PATTERN,
  THEME_CODE_RESERVED,
  THEME_DATA_VERSION,
  THEME_DESCRIPTION_MAX_LENGTH,
  THEME_NAME_MAX_LENGTH,
} from '../constants';
import { mapLinkageColorSchema, mapStyleSchema } from './mapDraft';

/**
 * v0.8.0 (docs/v0.8.0.md §4) —— 主题的写入口。
 *
 * `code` 与 `name` 分开，理由和地图 slug 一样：作者会想改显示名，但 URL 与
 * 资源包 manifest 不能跟着变。所以 `code` 只在**创建时**可给，之后不可改。
 */
export const themeCodeSchema = z
  .string()
  .trim()
  .min(1, '主题编码不能为空')
  .max(THEME_CODE_MAX_LENGTH, `主题编码长度不能超过 ${THEME_CODE_MAX_LENGTH}`)
  .regex(THEME_CODE_PATTERN, '主题编码只能包含小写字母、数字、下划线与连字符，且以字母或数字开头')
  /*
   * v0.8.0 §18：编码现在是工作空间的地址前缀（`/hlm/maps`）。`settings` / `play` /
   * `maps` … 这些顶层路径比 `/:themeCode` 更「具体」，会先被匹配 —— 用了它们的
   * 主题谁也进不去。所以创建时就拦，并直接说出被占用的那个词。
   */
  .refine(
    (code) => !THEME_CODE_RESERVED.includes(code),
    (code) => ({ message: `「${code}」是系统页面占用的路径，换一个编码` }),
  );

/**
 * `themes.data`：主题级缺省。两个键都可缺 —— 缺 `style` 按 `DEFAULT_MAP_STYLE`
 * 补齐，缺 `linkageColors` 沿用谜题 schema 的默认调色板（§5 的 S3 快照式）。
 * `.strict()` 与其余 schema 一致：多出来的键是写错了名字，不是新功能。
 */
export const themeDataSchema = z
  .object({
    version: z.number().int().positive().default(THEME_DATA_VERSION),
    style: mapStyleSchema.optional(),
    linkageColors: z.array(mapLinkageColorSchema).optional(),
  })
  .strict()
  .default({ version: THEME_DATA_VERSION });

/**
 * `/api/themes/:code` 的路径参数（§19）。
 *
 * 编码是**唯一**的主题寻址方式，所以路径上也走同一套规则 —— 字符集不对的请求在
 * 进入服务前就 400，而不是让服务端拿一个畸形字符串去查库。
 */
export const themeCodeParamSchema = z.object({ code: themeCodeSchema });

export const createThemeSchema = z.object({
  code: themeCodeSchema,
  name: z.string().trim().min(1, '主题名称不能为空').max(THEME_NAME_MAX_LENGTH),
  description: z.string().trim().max(THEME_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  data: themeDataSchema,
});

/**
 * 改名 / 改描述 / 改风格缺省。**`code` 不在里面** —— 它进 URL 与 manifest，
 * 改了等于换了身份，而 `theme_id` 又不可搬迁（§8 护栏 2），改名是唯一安全的编辑。
 */
export const updateThemeSchema = z
  .object({
    name: z.string().trim().min(1, '主题名称不能为空').max(THEME_NAME_MAX_LENGTH).optional(),
    description: z.string().trim().max(THEME_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    data: themeDataSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '请提供需要更新的字段');

export const listThemesQuerySchema = z.object({
  /** 作用域条与新建对话框都只要 id / code / name，`light` 省掉四张表的计数。 */
  light: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

/**
 * 一键整主题部署（§9）：`POST /api/themes/:id/deployments`。
 *
 * 不传 `puzzleIds` = 该主题下**每个谜题血统的最新已发布版本**全部上架；
 * 传了就一直用它（部署页那个「勾选哪些关卡上架」的对话框走这条路）。
 * `slug` 与单局游戏各占一个命名空间（`/play/theme/:slug` vs `/play/:slug`），不共享。
 */
export const createThemeDeploymentSchema = z.object({
  slug: z.string().trim().min(1, '请填写访问路径'),
  name: z.string().trim().min(1, '请填写合辑名称').max(THEME_NAME_MAX_LENGTH).optional(),
  description: z.string().trim().max(THEME_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  puzzleIds: z.array(z.coerce.number().int().positive()).optional(),
});

export const updateThemeDeploymentSchema = z
  .object({
    name: z.string().trim().min(1).max(THEME_NAME_MAX_LENGTH).optional(),
    description: z.string().trim().max(THEME_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    puzzleIds: z.array(z.coerce.number().int().positive()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '请提供需要更新的字段');

export type CreateThemeInput = z.infer<typeof createThemeSchema>;
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;
export type ThemeDataInput = z.infer<typeof themeDataSchema>;
export type CreateThemeDeploymentInput = z.infer<typeof createThemeDeploymentSchema>;
export type UpdateThemeDeploymentInput = z.infer<typeof updateThemeDeploymentSchema>;

/** 迁移与测试用的固定常量，避免两处各写一遍字符串。 */
export const DEFAULT_THEME_SEED = {
  code: DEFAULT_THEME_CODE,
  name: '默认',
  description: '无主题归属的历史内容',
} as const;
