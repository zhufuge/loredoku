import { z } from 'zod';
import {
  DEFAULT_LINKAGE_COLORS,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  LINKAGE_COLOR_MAX_COUNT,
  LINKAGE_COLOR_MIN_COUNT,
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  PUZZLE_JSON_VERSION,
  PUZZLE_NAME_MAX_LENGTH,
} from '../constants';
import { characterSlotEntrySchema, mapLinkageColorSchema } from './mapDraft';

const coordSchema = z.number().int().min(0).max(GRID_SIZE_MAX * 4);

/**
 * 谜题引用的已发布地图版本。画布本身**不复制**（见 docs/v0.5.0.md §5.1），
 * `gridSize` 随行以便离线校验。
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
 *   - `cell` targets      → inside `map.gridSize`
 *   - `color`             → a key of **this puzzle's** `linkageColors`
 *   - `positionConditions`→ inside `map.gridSize`
 *
 * `asset` / `region` targets live in the referenced map version and are checked
 * by `validatePuzzleReferences` (shared `puzzleRefs.ts`), which both the web
 * and the server run.
 */
function validateSelfConsistentReferences(
  draft: z.output<typeof puzzleDraftBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  const size = draft.map.gridSize;
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
    map: puzzleMapRefSchema,
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

export type PuzzleMapRefInput = z.infer<typeof puzzleMapRefSchema>;
export type PuzzleDraftInput = z.infer<typeof puzzleDraftSchema>;
export type CreatePuzzleInput = z.infer<typeof createPuzzleSchema>;
export type SavePuzzleDraftInput = z.infer<typeof savePuzzleDraftSchema>;
export type ImportPuzzleInput = z.infer<typeof importPuzzleSchema>;
export type UpdatePuzzleInput = z.infer<typeof updatePuzzleSchema>;
