import {
  DEFAULT_LINKAGE_COLORS,
  DEFAULT_MAP_STYLE,
  ErrorCode,
  PUZZLE_JSON_VERSION,
} from '@loredoku/shared';
import type {
  CreatePuzzleInput,
  MapStyle,
  PuzzleDetail,
  PuzzleDraft,
  PuzzleMapContext,
  PuzzleSummary,
  SavePuzzleDraftInput,
  UpdatePuzzleInput,
} from '@loredoku/shared';
import * as puzzleRepo from '../repository/puzzleRepository';
import * as versionRepo from '../repository/versionRepository';
import * as characterRepo from '../repository/characterRepository';
import { AppError } from '../utils/AppError';
import { absorbLegacyMapDraft, readLegacyLinkageColors } from './mapDraftCompat';
import { validatePuzzleReferences } from '@loredoku/shared';

/**
 * v0.5.0 FEAT-K01 (docs/v0.5.0.md §2) — the puzzle module's service layer.
 *
 * The boundary this file enforces:
 *
 * - the referenced map version must **exist and be published** (create), and is
 *   **immutable afterwards** — a save forces `data.map` back to the stored
 *   reference, so a payload can never repoint a puzzle at another canvas;
 * - `grid_size` comes from that version, never from the client;
 * - `asset` / `region` linkage targets are checked against the version's canvas
 *   (`validatePuzzleReferences`), since the schema cannot see across tables.
 */

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

export function toSummary(row: puzzleRepo.PuzzleJoinedRow): PuzzleSummary {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    mapVersionNo: row.map_version_no,
    mapId: Number(row.map_project_id),
    mapRootId: Number(row.root_id),
    mapName: row.map_name ?? '未命名地图',
    gridSize: row.grid_size,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deployed: row.game_slug !== null && row.game_slug !== undefined,
  };
}

function toDetail(row: puzzleRepo.PuzzleJoinedRow): PuzzleDetail {
  const data = puzzleRepo.isPuzzleDraft(row.data) ? row.data : emptyDraft(row);
  return { ...toSummary(row), data };
}

/** Defensive fallback — a stored puzzle should always carry a valid draft. */
function emptyDraft(row: puzzleRepo.PuzzleJoinedRow): PuzzleDraft {
  return {
    version: PUZZLE_JSON_VERSION,
    map: {
      mapId: Number(row.map_project_id),
      versionNo: row.map_version_no,
      gridSize: row.grid_size,
    },
    name: row.name,
    description: row.description ?? '',
    linkageColors: DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry })),
    characterSlots: Array.from({ length: row.grid_size }, () => null),
  };
}

async function requireRow(id: number): Promise<puzzleRepo.PuzzleJoinedRow> {
  const row = await puzzleRepo.getPuzzleRow(id);
  if (!row) {
    throw AppError.notFound('谜题不存在');
  }
  return row;
}

export async function listPuzzles(): Promise<PuzzleSummary[]> {
  const rows = await puzzleRepo.listPuzzles();
  return rows.map(toSummary);
}

export async function getPuzzle(id: number): Promise<PuzzleDetail> {
  return toDetail(await requireRow(id));
}

/**
 * FEAT-K01 §5: the read-only canvas, lifted from the referenced version.
 * `style.linkageColors` is **stripped** (Q16) — the palette's only truth is the
 * puzzle's own `linkageColors`, which the editor merges back at render time.
 */
export async function getPuzzleMapContext(id: number): Promise<PuzzleMapContext> {
  const row = await requireRow(id);
  const version = await versionRepo.findVersionRow(Number(row.map_project_id), row.map_version_no);
  if (!version) {
    throw AppError.notFound('谜题引用的地图版本不存在');
  }
  const draft = absorbLegacyMapDraft(version.data) as
    | { cells?: PuzzleMapContext['cells']; regions?: PuzzleMapContext['regions']; style?: MapStyle }
    | null;
  return {
    mapId: Number(row.map_project_id),
    versionNo: row.map_version_no,
    mapName: row.map_name ?? version.name ?? '未命名地图',
    gridSize: row.grid_size,
    cells: draft?.cells ?? {},
    regions: draft?.regions ?? [],
    style: draft?.style ?? { ...DEFAULT_MAP_STYLE },
  };
}

/**
 * FEAT-K03: the puzzle is **bound to a published map version at creation**, and
 * that binding never changes. The roster starts empty (length = the version's
 * grid size) and the palette is inherited from the version — falling back to
 * the shipped red / blue pair for versions published before the palette existed.
 */
export async function createPuzzle(input: CreatePuzzleInput): Promise<PuzzleDetail> {
  // 创建时选版本要**过滤软删**：已删版本不能作为新谜题的底图（可见性）。
  const version = await versionRepo.getVersion(input.mapId, input.mapVersionNo);
  if (!version) {
    throw AppError.validation('所选地图版本不存在，请选择一个已发布的地图版本');
  }

  // `map_versions.grid_size` 删了，尺寸从快照自身读。
  const gridSize = version.data?.gridSize ?? 0;
  const description = input.description ?? '';
  const data: PuzzleDraft = {
    version: PUZZLE_JSON_VERSION,
    map: { mapId: input.mapId, versionNo: input.mapVersionNo, gridSize },
    name: input.name,
    description,
    linkageColors: inheritedLinkageColors(version.data),
    characterSlots: Array.from({ length: gridSize }, () => null),
  };

  const row = await puzzleRepo.createPuzzle({
    name: input.name,
    description,
    mapId: input.mapId,
    mapVersionNo: input.mapVersionNo,
    gridSize,
    data,
  });
  return toDetail(row);
}

/** The version's own palette, or the default pair when it had none. */
function inheritedLinkageColors(raw: unknown): PuzzleDraft['linkageColors'] {
  const legacy = readLegacyLinkageColors(raw);
  if (legacy.length > 0) return legacy.map((entry) => ({ ...entry }));
  return DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry }));
}

export async function savePuzzle(
  id: number,
  input: SavePuzzleDraftInput,
): Promise<PuzzleDetail> {
  const row = await requireRow(id);
  const version = await versionRepo.findVersionRow(Number(row.map_project_id), row.map_version_no);
  if (!version) {
    throw AppError.notFound('谜题引用的地图版本不存在');
  }

  // The reference and the grid size are the server's, never the client's.
  const data: PuzzleDraft = {
    ...input.data,
    map: {
      mapId: Number(row.map_project_id),
      versionNo: row.map_version_no,
      gridSize: row.grid_size,
    },
  };

  await assertKnownCharacters(data);
  assertReferenceIssues(data, version.data);

  const saved = await puzzleRepo.savePuzzleDraft(id, input.updatedAt ?? null, data);
  if (saved === undefined) {
    throw AppError.notFound('谜题不存在');
  }
  if (saved === null) {
    throw new AppError(ErrorCode.DRAFT_CONFLICT, '草稿已被其他会话修改，请刷新后重试');
  }
  return toDetail(saved);
}

/** Every roster character must exist — the same guard `mapService` applies. */
async function assertKnownCharacters(data: PuzzleDraft): Promise<void> {
  const ids = new Set<number>();
  for (const slot of data.characterSlots) {
    if (slot) ids.add(slot.characterId);
  }
  if (ids.size === 0) return;
  const existing = await characterRepo.existingCharacterIds([...ids]);
  const missing = [...ids].filter((id) => !existing.has(id));
  if (missing.length > 0) {
    throw AppError.validation('存在无效的角色引用', missing);
  }
}

/**
 * The cross-table half of §5.2: asset / region targets must exist on the
 * referenced canvas. A front-end check is not enough — an imported JSON can
 * bypass it, so the service re-runs it before every write.
 */
function assertReferenceIssues(data: PuzzleDraft, versionData: unknown): void {
  const draft = absorbLegacyMapDraft(versionData) as
    | { cells?: PuzzleMapContext['cells']; regions?: PuzzleMapContext['regions'] }
    | null;
  const issues = validatePuzzleReferences(data, {
    cells: draft?.cells ?? {},
    regions: draft?.regions ?? [],
  });
  if (issues.length > 0) {
    throw AppError.validation('联动引用校验未通过', issues.map((issue) => issue.message));
  }
}

export async function updatePuzzle(id: number, input: UpdatePuzzleInput): Promise<PuzzleDetail> {
  await requireRow(id);
  const updated = await puzzleRepo.updatePuzzle(id, input);
  if (!updated) {
    throw AppError.notFound('谜题不存在');
  }
  return toDetail(updated);
}

export async function deletePuzzle(id: number): Promise<void> {
  const deleted = await puzzleRepo.deletePuzzle(id);
  if (!deleted) {
    throw AppError.notFound('谜题不存在');
  }
}

export async function duplicatePuzzle(id: number): Promise<PuzzleDetail> {
  const source = await requireRow(id);
  const name = await uniqueCopyName(source);
  const created = await puzzleRepo.duplicatePuzzle(id, name);
  if (!created) {
    throw AppError.notFound('谜题不存在');
  }
  return toDetail(created);
}

async function uniqueCopyName(source: puzzleRepo.PuzzleJoinedRow): Promise<string> {
  let candidate = `${source.name} 副本`;
  let index = 2;
  while (
    await puzzleRepo.findPuzzleByName(Number(source.map_project_id), source.map_version_no, candidate)
  ) {
    candidate = `${source.name} 副本 ${index}`;
    index += 1;
  }
  return candidate;
}
