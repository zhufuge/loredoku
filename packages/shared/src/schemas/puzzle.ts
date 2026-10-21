import { z } from 'zod';
import {
  DEFAULT_LINKAGE_COLORS,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  LINKAGE_COLOR_MAX_COUNT,
  LINKAGE_COLOR_MIN_COUNT,
  MAP_NAME_MAX_LENGTH,
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  PUZZLE_JSON_VERSION,
  PUZZLE_NAME_MAX_LENGTH,
} from '../constants';
import { characterSlotEntrySchema, mapDraftSchema, mapLinkageColorSchema } from './mapDraft';

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
  })
  .strict();

export const puzzleDraftSchema = puzzleDraftBaseSchema.superRefine((draft, ctx) =>
  validateSelfConsistentReferences(draft, ctx),
);

/**
 * FEAT-K03: create needs a name, an optional description and — the point of
 * the dialog — the **published** map version to draw on. Whether that version
 * exists is checked by the service, which is the only place that can know.
 */
export const createPuzzleSchema = z.object({
  name: puzzleNameSchema,
  description: puzzleDescriptionSchema.optional().nullable(),
  mapId: z.number().int().positive(),
  mapVersionNo: z.number().int().positive(),
});

export const savePuzzleDraftSchema = z.object({
  data: puzzleDraftSchema,
  updatedAt: z.string().nullable().optional(),
});

export const importPuzzleSchema = z.object({
  data: puzzleDraftSchema,
});

export const updatePuzzleSchema = z.object({
  name: puzzleNameSchema.optional(),
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
});

export type PuzzleMapRefInput = z.infer<typeof puzzleMapRefSchema>;
export type PuzzleDraftInput = z.infer<typeof puzzleDraftSchema>;
export type CreatePuzzleInput = z.infer<typeof createPuzzleSchema>;
export type SavePuzzleDraftInput = z.infer<typeof savePuzzleDraftSchema>;
export type ImportPuzzleInput = z.infer<typeof importPuzzleSchema>;
export type UpdatePuzzleInput = z.infer<typeof updatePuzzleSchema>;
export type ListPuzzlesQuery = z.infer<typeof listPuzzlesQuerySchema>;
