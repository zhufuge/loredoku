import { z } from 'zod';
import {
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
import { gameToolIconsSchema, moveLegacyImageKeys, optionalUploadedImageSchema } from './common';
import { themeCodeSchema } from './theme';

/** **v1** 底图引用（docs/v0.5.0.md §5.1）：只读存量与旧导出文件，新数据用 snapshot；旧字段 `projectId` 读入归一化为 `mapId`。 */
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

/** **v2** 底图画布（docs/v0.7.1.md §5.3）：自带画布副本，可独立发布；尺寸只认真源 `data.gridSize`。 */
export const puzzleMapSnapshotSchema = z
  .object({
    mapId: z.number().int().positive(),
    versionNo: z.number().int().positive(),
    mapName: z.string().trim().max(MAP_NAME_MAX_LENGTH).default(''),
    data: mapDraftSchema,
  })
  .strict();

/** 「引入新地图」只交来源（v0.7.3 §3.4）：画布由服务端从已发布版本读出，客户端伪造不了；缺省 = 不换底图。 */
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

/** 题面线索（v0.7.14 §2）：属整个谜题、进草稿顶层，不进名册；允许空串，空行由 store 落库前过滤。 */
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

/** Same palette/bounds as the map's old `style.linkageColors`; **required** — imports must state it, not inherit a default. */
const puzzleLinkageColorsSchema = z
  .array(mapLinkageColorSchema)
  .min(LINKAGE_COLOR_MIN_COUNT, '联动主题色至少保留 2 项')
  .max(LINKAGE_COLOR_MAX_COUNT, '联动主题色最多 12 项');

/** Self-consistent reference check for character / color / cell / position targets; asset / region are checked by `validatePuzzleReferences` (shared `puzzleRefs.ts`). */
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

    /** FEAT-E01 §7.4: position conditions must sit inside the board (`map.data.gridSize`). */
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

const puzzleDraftObjectSchema = z
  .object({
    version: z.number().int().positive().default(PUZZLE_JSON_VERSION),
    map: puzzleMapSnapshotSchema,
    name: puzzleNameSchema,
    description: puzzleDescriptionSchema.default(''),
    /** 全局线索。默认 `[]`：早先发布的行里没有这个键，解析时补齐。 */
    clues: puzzleCluesSchema.default([]),
    /** 结束语，默认空串（= 不显示）。 */
    ending: puzzleEndingSchema.default(''),
    linkageColors: puzzleLinkageColorsSchema,
    /** Roster slots. Length is **not** constrained: imports may carry any length and are normalised by the store. */
    characterSlots: z.array(characterSlotEntrySchema.nullable()),
    /** 列数（v0.6.3 §3）：可缺（老数据 = 自动）；上界取画布，超出槽位数由 `resolveRosterCols` 渲染时夹取。 */
    rosterCols: z
      .number()
      .int()
      .min(1, '列数至少为 1')
      .max(GRID_SIZE_MAX, `列数不能超过 ${GRID_SIZE_MAX}`)
      .nullable()
      .optional(),
    /** 标记：缺席 / `null` = 跟随主题，都没有才是 `×`；旧键 `forbiddenSymbol` 读入时搬过来（v0.8.6 §4）。 */
    mark: optionalUploadedImageSchema,
    /** v0.8.7 §7：工具按钮图标；缺席 / `null` = 跟随主题，都没有才是内置图标。 */
    toolIcons: gameToolIconsSchema,
  })
  .strict();

/** 旧键搬运（`forbiddenSymbol → mark`）：`.strict()` 拒未知键，故必须**先**搬再校验，`preprocess` 套最外层。 */
const puzzleDraftBaseSchema = z.preprocess(
  (raw) => moveLegacyImageKeys(raw),
  puzzleDraftObjectSchema,
);

export const puzzleDraftSchema = puzzleDraftBaseSchema.superRefine((draft, ctx) =>
  validateSelfConsistentReferences(draft, ctx),
);

/** 谜题编码（v0.8.5 §7）：形状即路径中段，只收小写；主题内是否重复在 `puzzleService.createPuzzle` 里查。 */
const PUZZLE_CODE_RULE = '编码只能用小写字母、数字与连字符，不能以连字符开头或结尾';

export const puzzleCodeSchema = z
  .string()
  .trim()
  .min(2, '编码至少 2 个字符')
  .max(PUZZLE_CODE_MAX_LENGTH, `编码最多 ${PUZZLE_CODE_MAX_LENGTH} 个字符`)
  .regex(PUZZLE_CODE_PATTERN, PUZZLE_CODE_RULE);

/** 同一句规则的非 zod 版本，供弹窗提交前给红字；与 schema 共用常量与措辞，避免两处判据不一致。 */
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

/** FEAT-K03 / v0.8.5 §7: create needs name, optional description, the **published** map version and a required `code` (path identity); existence is checked by the service. */
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

/** 「编辑此版本」不建行，保存才 fork（v0.7.2 §3.3）：`data` 不传 = 用版本自己的快照。 */
export const forkPuzzleVersionBodySchema = z.object({
  data: puzzleDraftSchema.optional(),
  /** v0.7.3 §3.4：fork 同样可以带一次换底图。 */
  mapSource: puzzleMapSourceSchema.optional(),
});

export const updatePuzzleSchema = z.object({
  name: puzzleNameSchema.optional(),
  /** 编码可改（v0.8.5 §7），是 v0.8.5 之前谜题补写的唯一入口；改它**不动**已部署路径，路径只随重新部署更新。 */
  code: puzzleCodeSchema.optional(),
  description: puzzleDescriptionSchema.optional().nullable(),
});

/** 列表与地图列表同参数（v0.7.1 §6.3）：`kind` 让草稿 / 版本各自分页，关键词与排序走服务端。 */
export const listPuzzlesQuerySchema = z.object({
  keyword: z.string().trim().max(PUZZLE_NAME_MAX_LENGTH).optional(),
  kind: z.enum(['draft', 'version']).optional(),
  sort: z.enum(['updatedAt', 'name', 'createdAt']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  /** §19：按主题编码筛；谜题的主题由底图决定（§7.1），故创建 schema 没有主题字段。 */
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
