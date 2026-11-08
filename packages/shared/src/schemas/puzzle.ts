import { z } from 'zod';
import {
  DEFAULT_LINKAGE_COLORS,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  LINKAGE_COLOR_MAX_COUNT,
  LINKAGE_COLOR_MIN_COUNT,
  MAP_NAME_MAX_LENGTH,
  PUZZLE_CLUE_MAX_LENGTH,
  PUZZLE_CLUES_MAX_COUNT,
  PUZZLE_CODE_MAX_LENGTH,
  PUZZLE_CODE_PATTERN,
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  PUZZLE_ENDING_MAX_LENGTH,
  PUZZLE_JSON_VERSION,
  PUZZLE_NAME_MAX_LENGTH,
} from '../constants';
import { characterSlotEntrySchema, mapDraftSchema, mapLinkageColorSchema } from './mapDraft';
import { forbiddenSymbolSchema, gameToolIconsSchema } from './common';
import { themeCodeSchema } from './theme';

const coordSchema = z.number().int().min(0).max(GRID_SIZE_MAX * 4);

/**
 * **v1** 的底图引用（docs/v0.5.0.md §5.1）：只记「哪张图的哪个版本 + 尺寸」，
 * 画布不复制。v0.7.1 起新数据不再写这个形状（见
 * {@link puzzleMapSnapshotSchema}），但存量行、导出的旧文件仍按它读取 ——
 * 所以 schema 留着，只做 v1 读取用。
 *
 * 导入的是用户手里的旧文件，键名不能强制 —— 旧文件里这个字段叫 `projectId`，
 * 收下并归一化成 `mapId`；新数据只有 `mapId`。
 */
export const puzzleMapRefSchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === 'object' && 'projectId' in raw && !('mapId' in raw)) {
      const { projectId, ...rest } = raw as Record<string, unknown>;
      return { ...rest, mapId: projectId };
    }
    return raw;
  },
  z
    .object({
      mapId: z.number().int().positive(),
      versionNo: z.number().int().positive(),
      gridSize: z.number().int().min(GRID_SIZE_MIN).max(GRID_SIZE_MAX),
    })
    .strict(),
);

/**
 * **v2** 的底图画布（docs/v0.7.1.md §5.3）：来源信息（展示 / 追溯，无 FK）+
 * 一份画布副本。谜题因此自带底图，可以独立发布与冻结。
 *
 * 尺寸的唯一真源是 `data.gridSize`（高压线 4）——`versionNo` 只用于展示。
 */
export const puzzleMapSnapshotSchema = z
  .object({
    mapId: z.number().int().positive(),
    versionNo: z.number().int().positive(),
    mapName: z.string().trim().max(MAP_NAME_MAX_LENGTH).default(''),
    data: mapDraftSchema,
  })
  .strict();

/**
 * v0.7.3 §3.4：「引入新地图」只交**来源**，不交画布。画布永远由服务端从那份已发布
 * 版本读出来 —— 与「保存时用存量覆盖 `data.map`」同一条护栏，客户端伪造不了底图。
 *
 * 缺省 = 不换底图（老行为）。
 */
export const puzzleMapSourceSchema = z
  .object({
    mapId: z.number().int().positive(),
    versionNo: z.number().int().positive(),
  })
  .strict();

export const puzzleNameSchema = z
  .string()
  .trim()
  .min(1, '谜题名称必填')
  .max(PUZZLE_NAME_MAX_LENGTH, `谜题名称不能超过 ${PUZZLE_NAME_MAX_LENGTH} 字`);
export const puzzleDescriptionSchema = z
  .string()
  .trim()
  .max(PUZZLE_DESCRIPTION_MAX_LENGTH, `描述不能超过 ${PUZZLE_DESCRIPTION_MAX_LENGTH} 字`);

/**
 * v0.7.14（docs/v0.7.14.md §2）：「题面」的两段文字，属于**整个谜题**。
 *
 * 与参与者各自的 `characterSlots[].clue` 是两回事 —— 那条讲「这位住在哪」，
 * 是给单个头像的条件；这里的线索讲**全局规则**（「每条斜线上的编号都不同」），
 * 玩家必须同时看着盘面和它们。所以它不进名册，进草稿顶层。
 *
 * 空串是允许的：作者可能先加一条空行再写。空行在**落库前**由 store 过滤掉
 * （`PuzzleInfoDrawer` 提交时 trim + 去空），schema 不替作者删内容 ——
 * 导入一份带空行的文件也不该整个失败。
 */
export const puzzleClueSchema = z
  .string()
  .trim()
  .max(PUZZLE_CLUE_MAX_LENGTH, `单条线索不能超过 ${PUZZLE_CLUE_MAX_LENGTH} 字`);

export const puzzleCluesSchema = z
  .array(puzzleClueSchema)
  .max(PUZZLE_CLUES_MAX_COUNT, `全局线索最多 ${PUZZLE_CLUES_MAX_COUNT} 条`);

export const puzzleEndingSchema = z
  .string()
  .trim()
  .max(PUZZLE_ENDING_MAX_LENGTH, `结束语不能超过 ${PUZZLE_ENDING_MAX_LENGTH} 字`);

/**
 * The palette is the map's old `style.linkageColors`, so it keeps the same
 * bounds (2–12 entries) and the same entry shape. It is **required**: the
 * create path seeds it from the referenced version (falling back to
 * `DEFAULT_LINKAGE_COLORS`), and an imported payload must state it explicitly
 * rather than silently inherit a default.
 */
const puzzleLinkageColorsSchema = z
  .array(mapLinkageColorSchema)
  .min(LINKAGE_COLOR_MIN_COUNT, '联动主题色至少保留 2 项')
  .max(LINKAGE_COLOR_MAX_COUNT, '联动主题色最多 12 项');

/**
 * Self-consistent reference check — the half of the old
 * `validateParticipantReferences` that only needs the puzzle payload itself:
 *
 *   - `character` targets → another slot's `characterId`
 *   - `cell` targets      → inside the board (`map.data.gridSize`)
 *   - `color`             → a key of **this puzzle's** `linkageColors`
 *   - `positionConditions`→ inside the board
 *
 * `asset` / `region` targets live on the puzzle's own copied canvas and are
 * checked by `validatePuzzleReferences` (shared `puzzleRefs.ts`), which both the
 * web and the server run.
 */
function validateSelfConsistentReferences(
  draft: z.output<typeof puzzleDraftBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  const size = draft.map.data.gridSize;
  const participantIds = new Set<number>();
  for (const slot of draft.characterSlots) {
    if (slot) participantIds.add(slot.characterId);
  }
  const palette = new Set(draft.linkageColors.map((entry) => entry.key));

  draft.characterSlots.forEach((slot, slotIndex) => {
    if (!slot) return;
    // MOD-801: flat linkages list (was: triggers[].targets).
    slot.linkages.forEach((target, targetIndex) => {
      const path = ['characterSlots', slotIndex, 'linkages', targetIndex];
      if (!palette.has(target.color)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'color'],
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
      // MOD-708: cell targets carry a `cells` array — validate each coord.
      if (target.type === 'cell') {
        for (const [cx, cy] of target.cells) {
          if (cx >= size || cy >= size) {
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

    /**
     * FEAT-E01 §7.4: position conditions must sit inside the board. `gridSize`
     * comes from `map` here, so the bound is checked at the draft level.
     */
    slot.positionConditions?.forEach((condition, conditionIndex) => {
      if (condition.x >= size || condition.y >= size) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['characterSlots', slotIndex, 'positionConditions', conditionIndex],
          message: `位置条件 (${condition.x}, ${condition.y}) 超出画布范围`,
        });
      }
    });
  });
}

const puzzleDraftBaseSchema = z
  .object({
    version: z.number().int().positive().default(PUZZLE_JSON_VERSION),
    map: puzzleMapSnapshotSchema,
    name: puzzleNameSchema,
    description: puzzleDescriptionSchema.default(''),
    /**
     * v0.7.14：全局线索。**默认 `[]`**，因为 v0.7.14 之前发布出去的谜题版本行
     * 是一份冻住的 JSON，里面没有这两个键 —— 解析时补齐，读取方不必到处判空。
     */
    clues: puzzleCluesSchema.default([]),
    /** v0.7.14：结束语，默认空串（= 不显示）。 */
    ending: puzzleEndingSchema.default(''),
    linkageColors: puzzleLinkageColorsSchema,
    /**
     * Roster slots. The length is **not** constrained here: the create path
     * seeds it from `map.gridSize`, but an imported payload may carry any
     * length and is normalised by the store, not rejected by the schema.
     */
    characterSlots: z.array(characterSlotEntrySchema.nullable()),
    /**
     * v0.6.3 (docs/v0.6.3.md §3): the roster matrix's column count.
     *
     * Optional for two reasons: a puzzle created before this version has no
     * such field and must keep validating (absent = 自动), and a payload
     * that has never been through the layout section must be storable too.
     * The upper bound is the board's, not the roster's — a cols value above
     * the slot count is clamped by `resolveRosterCols` at render time rather
     * than rejected here, because it is a layout hint, not a fact.
     */
    rosterCols: z
      .number()
      .int()
      .min(1, '列数至少为 1')
      .max(GRID_SIZE_MAX, `列数不能超过 ${GRID_SIZE_MAX}`)
      .nullable()
      .optional(),
    /** v0.8.6 §4：禁止符号的上传图；缺席 / `null` = 跟随主题，都没有才是 `×` 字形。 */
    forbiddenSymbol: forbiddenSymbolSchema,
    /** v0.8.7 §7：工具按钮图标；缺席 / `null` = 跟随主题，都没有才是内置图标。 */
    toolIcons: gameToolIconsSchema,
  })
  .strict();

export const puzzleDraftSchema = puzzleDraftBaseSchema.superRefine((draft, ctx) =>
  validateSelfConsistentReferences(draft, ctx),
);

/**
 * v0.8.5 §7（docs/v0.8.5 §7.md §3）：谜题编码 —— 部署时用它预填访问路径。
 *
 * 形状就是「路径中段」的形状（见 `PUZZLE_CODE_PATTERN`），所以 `puzzle-code`
 * 可以直接落进 `/play/puzzle-puzzle-code`，中间不做任何转写。大小写只收小写：
 * 路径本来就只认小写，允许大写等于允许一个「存进去和显示出来不一样」的值。
 *
 * 「这个编码在不在主题里重复」schema 管不了 —— 它不认识数据库，那一步在
 * `puzzleService.createPuzzle` 里拿着 `themeId` 查。
 */
const PUZZLE_CODE_RULE = '编码只能用小写字母、数字与连字符，不能以连字符开头或结尾';

export const puzzleCodeSchema = z
  .string()
  .trim()
  .min(2, '编码至少 2 个字符')
  .max(PUZZLE_CODE_MAX_LENGTH, `编码最多 ${PUZZLE_CODE_MAX_LENGTH} 个字符`)
  .regex(PUZZLE_CODE_PATTERN, PUZZLE_CODE_RULE);

/**
 * 同一句规则的**非 zod 版本** —— 弹窗在提交前要用它给出一行红字。
 *
 * 两处说同一组话不是冗余：schema 是服务端的门，这个函数是界面的门，共用一个
 * 常量与一个措辞，就不会出现「界面放行、服务端拒绝」那种只有 toast 能解释的
 * 状态。
 */
export function puzzleCodeError(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.length === 0) return '请填写编码';
  if (trimmed.length < 2) return '编码至少 2 个字符';
  if (trimmed.length > PUZZLE_CODE_MAX_LENGTH) {
    return `编码最多 ${PUZZLE_CODE_MAX_LENGTH} 个字符`;
  }
  if (!PUZZLE_CODE_PATTERN.test(trimmed)) return PUZZLE_CODE_RULE;
  return null;
}

/**
 * FEAT-K03: create needs a name, an optional description and — the point of
 * the dialog — the **published** map version to draw on. Whether that version
 * exists is checked by the service, which is the only place that can know.
 *
 * v0.8.5 §7：多一个**必填**的 `code`。它跟名称不一样 —— 名称可以重、可以改，
 * 编码是这一关对外的身份，部署时那串路径就是它。
 */
export const createPuzzleSchema = z.object({
  name: puzzleNameSchema,
  code: puzzleCodeSchema,
  description: puzzleDescriptionSchema.optional().nullable(),
  mapId: z.number().int().positive(),
  mapVersionNo: z.number().int().positive(),
});

export const savePuzzleDraftSchema = z.object({
  data: puzzleDraftSchema,
  updatedAt: z.string().nullable().optional(),
  /** 非空且与存量不同 = 换底图（v0.7.3 §3.4）。 */
  mapSource: puzzleMapSourceSchema.optional(),
});

export const importPuzzleSchema = z.object({
  data: puzzleDraftSchema,
});

/**
 * v0.7.2 §3.3：「编辑此版本」进 `?v=` 态时**不建行**，保存才 fork。`data` 是
 * 编辑器此刻的草稿（不传 = 用版本自己的快照，即版本历史面板的老行为）。
 *
 * 与地图的 `forkVersionBodySchema` 同形，只是内层 schema 换成 `PuzzleDraft`。
 */
export const forkPuzzleVersionBodySchema = z.object({
  data: puzzleDraftSchema.optional(),
  /** v0.7.3 §3.4：fork 同样可以带一次换底图。 */
  mapSource: puzzleMapSourceSchema.optional(),
});

export const updatePuzzleSchema = z.object({
  name: puzzleNameSchema.optional(),
  /**
   * v0.8.5 §7：编码可改。v0.8.5 之前建的谜题没有编码（`null`），这里是它们唯一的
   * 补写入口；改它**不会**动已部署游戏的路径 —— 路径是给持链接的人的承诺，
   * 只有重新部署才会按新编码重填。
   */
  code: puzzleCodeSchema.optional(),
  description: puzzleDescriptionSchema.optional().nullable(),
});

/**
 * v0.7.1 §6.3: 谜题列表与地图列表同参数 —— `kind` 让「草稿」「版本」两块各自
 * 分页（前端对同一端点发两个请求，各自的 `total` 才准），关键词与排序也走
 * 服务端（客户端只能排当前页）。
 */
export const listPuzzlesQuerySchema = z.object({
  keyword: z.string().trim().max(PUZZLE_NAME_MAX_LENGTH).optional(),
  kind: z.enum(['draft', 'version']).optional(),
  sort: z.enum(['updatedAt', 'name', 'createdAt']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  /**
   * §19：按主题编码筛。**谜题的主题不在这里选** —— 它由底图决定（§7.1），
   * 所以 `createPuzzleSchema` 没有主题字段，服务端从 `mapId` 那一行读。
   */
  themeCode: themeCodeSchema.optional(),
});

export type PuzzleMapRefInput = z.infer<typeof puzzleMapRefSchema>;
export type PuzzleMapSource = z.infer<typeof puzzleMapSourceSchema>;
export type PuzzleDraftInput = z.infer<typeof puzzleDraftSchema>;
export type CreatePuzzleInput = z.infer<typeof createPuzzleSchema>;
export type SavePuzzleDraftInput = z.infer<typeof savePuzzleDraftSchema>;
export type ImportPuzzleInput = z.infer<typeof importPuzzleSchema>;
export type UpdatePuzzleInput = z.infer<typeof updatePuzzleSchema>;
export type ListPuzzlesQuery = z.infer<typeof listPuzzlesQuerySchema>;
export type ForkPuzzleVersionInput = z.infer<typeof forkPuzzleVersionBodySchema>;
