import { z } from 'zod';
import {
  BG_COLOR_PATTERN,
  DEFAULT_THEME_CODE,
  GAME_DIFFICULTY_LEVEL_MAX,
  GAME_DIFFICULTY_LEVEL_MIN,
  THEME_CODE_MAX_LENGTH,
  THEME_CODE_PATTERN,
  THEME_CODE_RESERVED,
  THEME_DATA_VERSION,
  THEME_DESCRIPTION_MAX_LENGTH,
  THEME_DIFFICULTY_COLOR_PATTERN,
  THEME_DIFFICULTY_LABEL_MAX_LENGTH,
  THEME_DIFFICULTY_TIER_MAX,
  THEME_CHECK_FAIL_COLOR,
  THEME_CHECK_PASS_COLOR,
  THEME_VERDICT_TEXT_MAX_LENGTH,
  THEME_GAME_LIST_COUNT_TOKEN,
  THEME_GAME_LIST_TEXT_MAX_LENGTH,
  THEME_NAME_MAX_LENGTH,
} from '../constants';
import { mapLinkageColorSchema, mapStyleSchema } from './mapDraft';
import {
  gameToolIconsSchema,
  moveLegacyImageKeys,
  optionalUploadedImageSchema,
  withLegacyImageKeys,
} from './common';

/** 难度档位：`level` 是身份、落进 `games.difficulty`；`color` 缺省按内置五档（docs/v0.8.6.md §3）。 */
export const themeDifficultyTierSchema = z
  .object({
    level: z
      .number()
      .int('难度档位必须是整数')
      .min(GAME_DIFFICULTY_LEVEL_MIN, `难度档位最小是 ${GAME_DIFFICULTY_LEVEL_MIN}`)
      .max(GAME_DIFFICULTY_LEVEL_MAX, `难度档位最大是 ${GAME_DIFFICULTY_LEVEL_MAX}`),
    label: z
      .string()
      .trim()
      .min(1, '难度名称不能为空')
      .max(THEME_DIFFICULTY_LABEL_MAX_LENGTH, `难度名称最多 ${THEME_DIFFICULTY_LABEL_MAX_LENGTH} 个字`),
    color: z
      .string()
      .trim()
      .regex(THEME_DIFFICULTY_COLOR_PATTERN, '颜色要写成 #rrggbb')
      .optional(),
  })
  .strict();

/** 主题写入口（v0.8.0 §4）：`code` 只在创建时可给，之后不可改 —— URL 与 manifest 依赖它。 */
export const themeCodeSchema = z
  .string()
  .trim()
  .min(1, '主题编码不能为空')
  .max(THEME_CODE_MAX_LENGTH, `主题编码长度不能超过 ${THEME_CODE_MAX_LENGTH}`)
  .regex(THEME_CODE_PATTERN, '主题编码只能包含小写字母、数字、下划线与连字符，且以字母或数字开头')
  /* 编码是地址前缀；与 `settings` / `play` / `maps` 等顶层路由重名的主题谁也进不去，创建时即拦。 */
  .refine(
    (code) => !THEME_CODE_RESERVED.includes(code),
    (code) => ({ message: `「${code}」是系统页面占用的路径，换一个编码` }),
  );

/** 校验两档颜色（v0.9.3 §3）：`.default()` 让解析时补齐，库里不会出现缺色的半成品。 */
export const themeCheckColorsSchema = z
  .object({
    passColor: z.string().regex(BG_COLOR_PATTERN, '校验通过色需为 #RRGGBB 格式')
      .default(THEME_CHECK_PASS_COLOR),
    failColor: z.string().regex(BG_COLOR_PATTERN, '校验未通过色需为 #RRGGBB 格式')
      .default(THEME_CHECK_FAIL_COLOR),
  })
  .strict()
  .nullable()
  .optional();

/** 那一圈（计时环 + 校验圈共用）：形状特意留 `image` 一层；旧键由 `stripLegacyThemeKeys` 在外层搬。 */
export const themeRingSchema = z
  .object({ image: optionalUploadedImageSchema })
  .strict()
  .nullable()
  .optional();

/** 结算卡配置：三项都可缺且允许空串（= 用内置那句），空串在上层按缺省处理。 */
export const themeVerdictSchema = z
  .object({
    iconText: z
      .string()
      .trim()
      .max(THEME_VERDICT_TEXT_MAX_LENGTH, `图标文字最多 ${THEME_VERDICT_TEXT_MAX_LENGTH} 个字`)
      .optional(),
    icon: optionalUploadedImageSchema,
    title: z
      .string()
      .trim()
      .max(THEME_VERDICT_TEXT_MAX_LENGTH, `标题最多 ${THEME_VERDICT_TEXT_MAX_LENGTH} 个字`)
      .optional(),
  })
  .strict()
  .nullable()
  .optional();

/** 列表页文案：允许空串；非空时必须含 `{n}`，否则会静默失败，故在写入口就拦。 */
const gameListTextSchema = z
  .string()
  .trim()
  .max(THEME_GAME_LIST_TEXT_MAX_LENGTH, `文案最多 ${THEME_GAME_LIST_TEXT_MAX_LENGTH} 个字`)
  .refine(
    (value) => value.length === 0 || value.includes(THEME_GAME_LIST_COUNT_TOKEN),
    `文案里要留一个 ${THEME_GAME_LIST_COUNT_TOKEN}，它会换成关数`,
  );

export const themeGameListSchema = z
  .object({
    playable: gameListTextSchema.optional(),
    passed: gameListTextSchema.optional(),
  })
  .strict()
  .nullable()
  .optional();

/** `themes.data` 的对象那一半（旧键预处理在外层）；`.strict()`：多出来的键是写错了名字。 */
const themeDataObjectSchema = z
  .object({
    version: z.number().int().positive().default(THEME_DATA_VERSION),
    /** 识别色：只管配置页色带 / 概览页，**不进包、不参与渲染**；可选，不替作者编颜色。 */
    accent: z.string().regex(BG_COLOR_PATTERN, '识别色需为 #RRGGBB 格式').optional(),
    style: mapStyleSchema.optional(),
    linkageColors: z.array(mapLinkageColorSchema).optional(),
    /** 标记：**读取时**兜底（谜题 → 主题 → ×），故换图对跟随关卡立刻生效；旧键 `forbiddenSymbol` 读入时搬入。 */
    mark: withLegacyImageKeys(optionalUploadedImageSchema),
    /** v0.8.7 §7：工具按钮图标（清除 / 撤回 / 提交），解析顺序同标记。 */
    toolIcons: gameToolIconsSchema,
    /** 那一圈：计时环与校验圈共用一张图；缺了 = 各自的内置细弧，旧键由 `stripLegacyThemeKeys` 搬入。 */
    ring: themeRingSchema,
    /**
     * 结算卡通过那一面的图标与标题。缺了 = 内置 🎉 + 「解题成功」。
     */
    verdict: themeVerdictSchema,
    /**
     * 游戏列表页那两行字（「N 关可玩」/「已通过 N 关」）。缺了 = 内置。
     */
    gameList: themeGameListSchema,
    /**
     * v0.9.3 §3；v0.9.5 起只剩两档颜色（圈图并进 `ring`）。缺了 = 内置绿 / 红。
     */
    checkStyle: themeCheckColorsSchema,
    /** 难度分级：缺省 = 内置五档；给了就整份替换（追加会让作者删不掉「专家」这一档）。 */
    difficultyLevels: z
      .array(themeDifficultyTierSchema)
      .min(1, '至少保留一档难度')
      .max(THEME_DIFFICULTY_TIER_MAX, `最多定义 ${THEME_DIFFICULTY_TIER_MAX} 档难度`)
      .optional(),
  })
  .strict()
  /** 重复 `level` 是数据坏了（`games.difficulty` 指不出哪档，库无外键可拦），故在此报出是第几档。 */
  .refine(
    (data) => {
      const levels = (data.difficultyLevels ?? []).map((tier) => tier.level);
      return new Set(levels).size === levels.length;
    },
    (data) => {
      const seen = new Set<number>();
      const duplicate = (data.difficultyLevels ?? []).find((tier) =>
        seen.has(tier.level) ? true : (seen.add(tier.level), false),
      );
      return {
        message: `难度档位「${duplicate?.level ?? ''}」重复了`,
        path: ['difficultyLevels'],
      };
    },
  )
  .default({ version: THEME_DATA_VERSION });

/** `themes.data`：缺省补齐，且必须**先搬旧键再校验** —— `.strict()` 不接受未知键，故 `preprocess` 在最外层。 */
export const themeDataSchema = z.preprocess(
  (raw) => stripLegacyThemeKeys(raw),
  themeDataObjectSchema,
);

/** 旧键搬运：`forbiddenSymbol → mark`、`pressRing` / `checkStyle.ring → ring.image`，并摘掉 `checkStyle.ring`；必在对象层做，字段级看不到同级旧键。 */
export function stripLegacyThemeKeys(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const record = { ...(raw as Record<string, unknown>) };

  // 标记：`forbiddenSymbol → mark`
  const withMark = moveLegacyImageKeys(record) as Record<string, unknown>;

  // 那一圈：`pressRing` / `checkStyle.ring` → `ring.image`（已有 `ring` 就不动）
  const existingRing = withMark['ring'];
  const hasNewRing =
    existingRing &&
    typeof existingRing === 'object' &&
    !Array.isArray(existingRing) &&
    'image' in (existingRing as Record<string, unknown>);
  if (!hasNewRing) {
    const pressRing = withMark['pressRing'];
    const checkRing =
      withMark['checkStyle'] &&
      typeof withMark['checkStyle'] === 'object' &&
      !Array.isArray(withMark['checkStyle'])
        ? ((withMark['checkStyle'] as Record<string, unknown>)['ring'] ?? null)
        : null;
    const source = imagePathOf(pressRing) ?? imagePathOf(checkRing);
    if (source) withMark['ring'] = { image: { path: source } };
  }
  delete withMark['pressRing'];

  // `checkStyle` 只剩颜色
  const checkStyle = withMark['checkStyle'];
  if (checkStyle && typeof checkStyle === 'object' && !Array.isArray(checkStyle)) {
    const { ring: _ring, ...colors } = checkStyle as Record<string, unknown>;
    withMark['checkStyle'] = colors;
  }
  return withMark;
}

/** 从 `{ path }` / `{ image: { path } }` 里取出路径；取不到就是 `null`。 */
function imagePathOf(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record['path'] === 'string') return record['path'];
  const image = record['image'];
  if (image && typeof image === 'object' && !Array.isArray(image)) {
    const path = (image as Record<string, unknown>)['path'];
    if (typeof path === 'string') return path;
  }
  return null;
}

/** `/api/themes/:code` 路径参数：字符集不对的请求进服务前就 400，不拿畸形串查库。 */
export const themeCodeParamSchema = z.object({ code: themeCodeSchema });

export const createThemeSchema = z.object({
  code: themeCodeSchema,
  name: z.string().trim().min(1, '主题名称不能为空').max(THEME_NAME_MAX_LENGTH),
  description: z.string().trim().max(THEME_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  data: themeDataSchema,
});

/** 改名 / 改描述 / 改风格缺省。**`code` 不在里面** —— 它进 URL 与 manifest，改名是唯一安全的编辑。 */
export const updateThemeSchema = z
  .object({
    name: z.string().trim().min(1, '主题名称不能为空').max(THEME_NAME_MAX_LENGTH).optional(),
    description: z.string().trim().max(THEME_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    data: themeDataSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '请提供需要更新的字段');

/** 只改两档颜色：两个字段都可选，但**至少要给一个**，空 body 是一次无意义的写库。 */
export const updateThemeCheckStyleSchema = z
  .object({
    passColor: z.string().regex(BG_COLOR_PATTERN, '校验通过色需为 #RRGGBB 格式').optional(),
    failColor: z.string().regex(BG_COLOR_PATTERN, '校验未通过色需为 #RRGGBB 格式').optional(),
  })
  .strict()
  .refine(
    (value) => value.passColor !== undefined || value.failColor !== undefined,
    '请提供需要更新的颜色',
  );

/** 结算卡两句文字：两项都可选、**至少给一项**；给空串就是恢复内置。 */
export const updateThemeVerdictSchema = z
  .object({
    iconText: z
      .string()
      .trim()
      .max(THEME_VERDICT_TEXT_MAX_LENGTH, `图标文字最多 ${THEME_VERDICT_TEXT_MAX_LENGTH} 个字`)
      .optional(),
    title: z
      .string()
      .trim()
      .max(THEME_VERDICT_TEXT_MAX_LENGTH, `标题最多 ${THEME_VERDICT_TEXT_MAX_LENGTH} 个字`)
      .optional(),
  })
  .strict()
  .refine(
    (value) => value.iconText !== undefined || value.title !== undefined,
    '请提供需要更新的文字',
  );

export const listThemesQuerySchema = z.object({
  /** 作用域条与新建对话框都只要 id / code / name，`light` 省掉四张表的计数。 */
  light: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

/** 导出可只打选中的几关：`games` 是逗号分隔的游戏 id；缺席 = 全部在线关（老包不受影响）。 */
export const themeBundleQuerySchema = z.object({
  games: z
    .string()
    .regex(/^\d+(,\d+)*$/, 'games 只能是逗号分隔的游戏 id')
    .transform((value) => value.split(',').map((part) => Number(part)))
    .optional(),
});

export type ThemeBundleQuery = z.infer<typeof themeBundleQuerySchema>;

export type CreateThemeInput = z.infer<typeof createThemeSchema>;
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;
export type ThemeDataInput = z.infer<typeof themeDataSchema>;

/** 迁移与测试用的固定常量，避免两处各写一遍字符串。 */
export const DEFAULT_THEME_SEED = {
  code: DEFAULT_THEME_CODE,
  name: '默认',
  description: '无主题归属的历史内容',
} as const;
