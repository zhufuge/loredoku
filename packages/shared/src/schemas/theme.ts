import { z } from 'zod';
import {
  BG_COLOR_PATTERN,
  DEFAULT_THEME_CODE,
  GAME_DIFFICULTY_KEY_MAX_LENGTH,
  GAME_DIFFICULTY_KEY_PATTERN,
  THEME_CODE_MAX_LENGTH,
  THEME_CODE_PATTERN,
  THEME_CODE_RESERVED,
  THEME_DATA_VERSION,
  THEME_DESCRIPTION_MAX_LENGTH,
  THEME_DIFFICULTY_LABEL_MAX_LENGTH,
  THEME_DIFFICULTY_TIER_MAX,
  THEME_NAME_MAX_LENGTH,
} from '../constants';
import { mapLinkageColorSchema, mapStyleSchema } from './mapDraft';

/**
 * v0.8.3（docs/v0.8.3.md §3）：主题自己的一档难度。
 *
 * 只存 `key` 与 `label`，**不存颜色** —— 徽章底色由它在列表里的位置决定（沿用
 * `index.css` 那条五档热力坡）。理由：作者要回答的是「我这关算第几档」，不是
 * 「这档是什么色」；而让作者选色，浅色下选定的淡色在深色界面里就会变成一块
 * 亮补丁（v0.7.8 已经为此把五个 hex 换成 CSS 变量）。
 */
export const themeDifficultyTierSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, '难度标识不能为空')
      .max(GAME_DIFFICULTY_KEY_MAX_LENGTH)
      .regex(GAME_DIFFICULTY_KEY_PATTERN, '难度标识只能包含字母、数字与连字符，且以字母开头'),
    label: z
      .string()
      .trim()
      .min(1, '难度名称不能为空')
      .max(THEME_DIFFICULTY_LABEL_MAX_LENGTH, `难度名称最多 ${THEME_DIFFICULTY_LABEL_MAX_LENGTH} 个字`),
  })
  .strict();

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
 * `themes.data`：主题级**缺省**，两个键可缺 —— 缺 `style` 按 `DEFAULT_MAP_STYLE`
 * 补齐，缺 `linkageColors` 沿用谜题 schema 的默认调色板（§5 的 S3 快照式）。
 * `.strict()` 与其余 schema 一致：多出来的键是写错了名字，不是新功能。
 *
 * v0.8.2 起多一个 `accent`：它**不是**缺省，是这个空间的门牌色（见下）。
 */
export const themeDataSchema = z
  .object({
    version: z.number().int().positive().default(THEME_DATA_VERSION),
    /**
     * v0.8.2：主题的**识别色**。
     *
     * 它和 `style` / `linkageColors` 不是一类东西：那两个是「新建内容时拷贝过去的
     * 初始值」，会进画布、进导出包；`accent` 只回答「这一屏属于哪个世界」——
     * 系统配置页的卡片色带、概览页的识别色事实行用它，**不进包、不参与渲染**。
     *
     * 可选：没选过就没有门牌，卡片也就不画色带 —— 不替作者编一个颜色出来。
     */
    accent: z.string().regex(BG_COLOR_PATTERN, '识别色需为 #RRGGBB 格式').optional(),
    style: mapStyleSchema.optional(),
    linkageColors: z.array(mapLinkageColorSchema).optional(),
    /**
     * v0.8.3：难度分级。缺省 = 内置五档；给了就**整份替换**，不是「在内置之上
     * 追加」—— 追加语义会让作者删不掉「专家」这一档，而删掉正是最常见的诉求。
     */
    difficultyLevels: z
      .array(themeDifficultyTierSchema)
      .min(1, '至少保留一档难度')
      .max(THEME_DIFFICULTY_TIER_MAX, `最多定义 ${THEME_DIFFICULTY_TIER_MAX} 档难度`)
      .optional(),
  })
  .strict()
  /**
   * 重复的 `key` 是**数据坏了**，不是样式问题：两行共用同一个标识，`game.difficulty`
   * 就指不出是哪一档，而库里没有外键能替我们拦下它。所以在这里就说清楚是第几个。
   */
  .refine(
    (data) => {
      const keys = (data.difficultyLevels ?? []).map((tier) => tier.key);
      return new Set(keys).size === keys.length;
    },
    (data) => {
      const seen = new Set<string>();
      const duplicate = (data.difficultyLevels ?? []).find((tier) =>
        seen.has(tier.key) ? true : (seen.add(tier.key), false),
      );
      return {
        message: `难度标识「${duplicate?.key ?? ''}」重复了`,
        path: ['difficultyLevels'],
      };
    },
  )
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
