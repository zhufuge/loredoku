import {
  DEFAULT_LINKAGE_COLORS,
  DEFAULT_MAP_STYLE,
  ErrorCode,
  MAP_JSON_VERSION,
  PUZZLE_JSON_VERSION,
  absorbLegacyPuzzleDraft,
  puzzleGridSize,
  validatePuzzleReferences,
} from '@loredoku/shared';
import type {
  CreatePuzzleInput,
  ListPuzzlesQuery,
  MapDraft,
  PublishViolation,
  PuzzleDetail,
  PuzzleDraft,
  PuzzleEntrySummary,
  PuzzleMapContext,
  PuzzleMapSnapshot,
  PuzzleMapSource,
  SavePuzzleDraftInput,
  UpdatePuzzleInput,
} from '@loredoku/shared';
import * as puzzleRepo from '../repository/puzzleRepository';
import * as puzzleVersionRepo from '../repository/puzzleVersionRepository';
import * as versionRepo from '../repository/versionRepository';
import * as gameRepo from '../repository/gameRepository';
import * as characterRepo from '../repository/characterRepository';
import * as mapRepo from '../repository/mapRepository';
import * as themeService from './themeService';
import { AppError } from '../utils/AppError';
import { absorbLegacyMapDraft, readLegacyLinkageColors } from './mapDraftCompat';
import { processForbiddenSymbolImage, processPuzzleCover } from '../utils/image';
import { buildFileUrl } from '../utils/paths';

/**
 * 谜题模块的服务层（v0.7.1 §5）。
 *
 * 这里守住四条边界：
 *
 * 1. **谜题自带底图**：创建时把地图版本画布整份复制进 `data.map.data`，此后再
 *    也不问地图要数据（`getPuzzleMapContext` 读自己的副本）。JSON 里那份画布是
 *    服务端资产 —— 保存时一律用存量覆盖客户端送来的副本，画布不可能被改掉。
 * 2. **尺寸只有一个来源**：`puzzleGridSize(draft)`，没有任何列参与。
 * 3. **版本行只读**：改名 / 描述 / 封面 / 保存一律先过 {@link findWritable}。
 * 4. **联动引用对自带画布校验**：schema 看不见跨表的 `asset` / `region`，写在
 *    这里，导入的 JSON 也绕不过去。
 */

/** Raised when `POST /api/puzzles/:id/cover` arrives without a file part. */
export function coverRequired(): AppError {
  return AppError.validation('请选择封面图片');
}

/** Raised when `POST /api/puzzles/:id/forbidden-symbol` arrives without a file part. */
export function forbiddenSymbolRequired(): AppError {
  return AppError.validation('请选择禁止符号图片');
}

/** 存量行读成 `PuzzleDraft`（v1 会补一份空画布）；读不出来就是坏数据。 */
function rowDraft(row: { data: unknown }): PuzzleDraft | null {
  return absorbLegacyPuzzleDraft(row.data);
}

/**
 * 本次保存该用哪份底图（v0.7.3 §3.4）。
 *
 * 客户端只交来源（`mapSource`），画布永远从这里读 —— 与「保存时用存量覆盖
 * `data.map`」同一条护栏：底图只可能是某个**已发布版本**的冻结快照，绝不来自
 * 请求体。三种情形：
 *
 * 1. 没带 `mapSource`，或它与存量相同 → 用存量（老行为，零查询）；
 * 2. 不同 → 读那份已发布版本（过滤软删）并换成它的画布；
 * 3. 版本不存在 / 没有画布 / 方格尺寸不同 → 400。
 *
 * 尺寸必须一致不是客气：底图尺寸决定名册长度与所有格子坐标，换尺寸等于换坐标系
 * （那是「新建谜题」的事）。
 */
async function resolveMapSnapshot(
  current: PuzzleMapSnapshot,
  mapSource?: PuzzleMapSource,
): Promise<PuzzleMapSnapshot> {
  if (!mapSource) return current;
  if (mapSource.mapId === current.mapId && mapSource.versionNo === current.versionNo) {
    return current;
  }

  const version = await versionRepo.getVersion(mapSource.mapId, mapSource.versionNo);
  if (!version) {
    throw AppError.validation('所选地图版本不存在，请选择一个已发布的地图版本');
  }
  const canvas = absorbLegacyMapDraft(version.data) as MapDraft;
  const gridSize = canvas?.gridSize ?? 0;
  if (gridSize <= 0) {
    throw AppError.validation('所选地图版本没有可用的画布');
  }
  const currentSize = current.data.gridSize;
  if (gridSize !== currentSize) {
    throw AppError.validation(
      `只能引入方格尺寸相同的地图版本（当前 ${currentSize} × ${currentSize}）`,
    );
  }

  return {
    mapId: mapSource.mapId,
    versionNo: mapSource.versionNo,
    mapName: version.name ?? '',
    data: canvas,
  };
}

function toDetail(row: puzzleRepo.PuzzleRowWithLineage): PuzzleDetail {
  const entry = puzzleRepo.toPuzzleEntry(row);
  return { ...entry, data: rowDraft(row) ?? emptyDraft(entry) };
}

/** Defensive fallback —— 存进去的谜题本该永远是一份合法的草稿。 */
function emptyDraft(entry: PuzzleEntrySummary): PuzzleDraft {
  return {
    version: PUZZLE_JSON_VERSION,
    map: {
      mapId: entry.mapId,
      versionNo: entry.mapVersionNo,
      mapName: entry.mapName,
      data: {
        version: MAP_JSON_VERSION,
        gridSize: entry.gridSize,
        cells: {},
        regions: [],
      } as MapDraft,
    },
    name: entry.name,
    description: entry.description ?? '',
    linkageColors: DEFAULT_LINKAGE_COLORS.map((color) => ({ ...color })),
    characterSlots: Array.from({ length: entry.gridSize }, () => null),
    rosterCols: null,
  };
}

/**
 * 复制 / fork 的取名兜底：`{base} 副本`、`{base} 副本 2`… 直到不撞名。
 * 只看草稿行（版本名是发布快照，拿它占位会让序号莫名跳号）。
 */
async function uniqueCopyName(base: string): Promise<string> {
  let candidate = `${base} 副本`;
  let index = 2;
  while (await puzzleRepo.existsByName(candidate)) {
    candidate = `${base} 副本 ${index}`;
    index += 1;
  }
  return candidate;
}

/** `base` 本身不撞名就用它，撞了才走副本序列（fork 的命名用）。 */
async function uniqueName(base: string): Promise<string> {
  if (!(await puzzleRepo.existsByName(base))) return base;
  return uniqueCopyName(base);
}

/**
 * v0.8.5 §7：编码在主题内不重。
 *
 * 为什么不是数据库唯一约束：同一条谜题的草稿行与版本行**共用**一个编码（那是
 * 这一关的身份，不是版本的属性），唯一索引会把它们判成冲突。所以只在「新建」
 * 与「改编码」这两个真正的入口查一次。
 */
async function assertCodeFree(themeId: number, code: string): Promise<void> {
  if (await puzzleRepo.codeTaken(themeId, code)) {
    throw AppError.conflict(`编码「${code}」已经被这个主题的另一个谜题用过了`);
  }
}

/**
 * 复制出一条新谜题时给它找一个空编码：先试原样，撞了就 `-2`、`-3`……
 *
 * 原谜题没有编码时也返回 `null` —— 不为了「每个谜题都要有编码」去发明一个。
 */
async function freeCode(themeId: number, base: string | null): Promise<string | null> {
  if (!base) return null;
  const stem = base.slice(0, 44).replace(/-+$/g, '');
  let candidate = stem;
  let index = 2;
  while (await puzzleRepo.codeTaken(themeId, candidate)) {
    candidate = `${stem}-${index}`;
    index += 1;
  }
  return candidate;
}

async function requireRow(id: number): Promise<puzzleRepo.PuzzleRowWithLineage> {
  const row = await puzzleRepo.findById(id);
  if (!row) {
    throw AppError.notFound('谜题不存在');
  }
  return row;
}

/**
 * 版本行也是合法的 `puzzles` 行，所以每个「条目级」写操作都要先过这里 ——
 * 版本是冻结快照，改名 / 封面 / 保存都会让已部署的游戏悄悄变形。
 */
async function findWritable(id: number): Promise<puzzleRepo.PuzzleRowWithLineage> {
  const row = await requireRow(id);
  if (row.version !== 'draft') {
    throw AppError.validation('已发布的版本不可修改');
  }
  return row;
}

export async function listPuzzleEntries(
  query: ListPuzzlesQuery & { page: number; pageSize: number },
): Promise<{ list: PuzzleEntrySummary[]; total: number }> {
  // §19：谜题的主题来自底图，但筛选参数仍按主题编码给。
  const { themeCode, ...rest } = query;
  return puzzleRepo.listPuzzleEntries({
    ...rest,
    themeId: await themeService.filterThemeId(themeCode),
  });
}

export async function getPuzzle(id: number): Promise<PuzzleDetail> {
  return toDetail(await requireRow(id));
}

/**
 * 谜题编辑器渲染的只读画布 —— 从**自己的副本**读（v0.7.1 起不再 join 地图）。
 * `style` 里没有 `linkageColors`：调色板的唯一真源是谜题自己的
 * `linkageColors`，编辑器渲染时再合并。
 */
export async function getPuzzleMapContext(id: number): Promise<PuzzleMapContext> {
  const row = await requireRow(id);
  const draft = rowDraft(row);
  if (!draft) {
    throw AppError.validation('谜题的底图画布不可读，请重新创建谜题');
  }
  const canvas = draft.map.data;
  return {
    mapId: draft.map.mapId,
    versionNo: draft.map.versionNo,
    mapName: draft.map.mapName || '未命名地图',
    gridSize: puzzleGridSize(draft),
    cells: canvas.cells ?? {},
    regions: canvas.regions ?? [],
    style: canvas.style ?? { ...DEFAULT_MAP_STYLE },
  };
}

/**
 * 创建谜题（仍是 JSON，先建行才有 id 能挂封面）：把所选**已发布**地图版本的
 * 画布复制进 `data.map.data`，名册按画布尺寸开空位，调色板继承源版本的
 * 老调色板（没有就用随包的红 / 蓝对）。
 *
 * 底图从此固定 —— 地图后来发布新版本不影响既有谜题（要换底图只能新建谜题）。
 */
export async function createPuzzle(input: CreatePuzzleInput): Promise<PuzzleDetail> {
  // 创建时选版本要**过滤软删**：已删版本不能作为新谜题的底图（可见性）。
  const version = await versionRepo.getVersion(input.mapId, input.mapVersionNo);
  if (!version) {
    throw AppError.validation('所选地图版本不存在，请选择一个已发布的地图版本');
  }

  const canvas = absorbLegacyMapDraft(version.data) as MapDraft;
  const gridSize = canvas?.gridSize ?? 0;
  if (gridSize <= 0) {
    throw AppError.validation('所选地图版本没有可用的画布');
  }

  const description = input.description ?? '';
  const data: PuzzleDraft = {
    version: PUZZLE_JSON_VERSION,
    map: {
      mapId: input.mapId,
      versionNo: input.mapVersionNo,
      mapName: version.name ?? '',
      data: canvas,
    },
    name: input.name,
    description,
    linkageColors: inheritedLinkageColors(version.data),
    characterSlots: Array.from({ length: gridSize }, () => null),
    // v0.6.3 §3: 新建谜题从「自动」列数开始，作者之后在「基本信息」里定。
    rosterCols: null,
  };

  // v0.8.0 §7.1：谜题的主题**由底图决定**，所以这里没有「选主题」的余地 ——
  // 读那一行地图的 `theme_id`，界面上那个选择器只是把结论显示出来。
  const mapRow = await mapRepo.findById(input.mapId);
  if (!mapRow) {
    throw AppError.validation('所选地图版本不存在，请选择一个已发布的地图版本');
  }
  const themeId = Number(mapRow.theme_id);

  // v0.8.7 §4：**不再把主题的禁止符号拷进草稿** —— 谜题不配就跟随主题，由读取侧
  // （游戏页、谜题抽屉）按「谜题 → 主题 → ×」解析。拷一份会让「主题换图」永远停在
  // 建题那一天，也正是「每建一题都要配一次」的来源。

  // v0.8.5 §7：编码同主题内不重。schema 只守形状，重复要拿着主题去查。
  await assertCodeFree(themeId, input.code);

  const row = await puzzleRepo.createPuzzle({
    themeId,
    name: input.name,
    code: input.code,
    description,
    data,
  });
  return toDetail(row);
}

/** 源版本的调色板，没有就用默认的一对。 */
function inheritedLinkageColors(raw: unknown): PuzzleDraft['linkageColors'] {
  const legacy = readLegacyLinkageColors(raw);
  if (legacy.length > 0) return legacy.map((entry) => ({ ...entry }));
  return DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry }));
}

export async function savePuzzle(
  id: number,
  input: SavePuzzleDraftInput,
): Promise<PuzzleDetail> {
  const row = await findWritable(id);
  const stored = rowDraft(row);
  if (!stored) {
    throw AppError.validation('谜题的底图画布不可读，请重新创建谜题');
  }

  // 底图快照与版本戳是服务端的：默认用存量覆盖客户端送来的那份；
  // 只有显式带了**不同**的 `mapSource` 才换成那份已发布版本的画布（v0.7.3 §3.4）。
  const data: PuzzleDraft = {
    ...input.data,
    version: PUZZLE_JSON_VERSION,
    map: await resolveMapSnapshot(stored.map, input.mapSource),
  };

  await assertKnownCharacters(data);
  assertReferenceIssues(data);
  // v0.8.0 §8 护栏 1：名册与画布上的引用必须与本谜题同主题。
  await themeService.assertThemeScope(
    Number(row.theme_id),
    themeService.puzzleDraftRefs(data),
  );

  const saved = await puzzleRepo.savePuzzleDraft(id, input.updatedAt ?? null, data);
  if (saved === undefined) {
    throw AppError.notFound('谜题不存在');
  }
  if (saved === null) {
    throw new AppError(ErrorCode.DRAFT_CONFLICT, '草稿已被其他会话修改，请刷新后重试');
  }
  return toDetail(saved);
}

/** 名册里的角色必须都存在 —— 与 `mapService` 同一条护栏。 */
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
 * 跨表那半：`asset` / `region` 目标必须在**谜题自己的画布**上。前端的检查不算
 * 数 —— 导入的 JSON 能绕过它，所以每次写入前服务端重跑一遍。
 */
function assertReferenceIssues(data: PuzzleDraft): void {
  const issues = validatePuzzleReferences(data, {
    cells: data.map.data.cells ?? {},
    regions: data.map.data.regions ?? [],
  });
  if (issues.length > 0) {
    throw AppError.validation('联动引用校验未通过', issues.map((issue) => issue.message));
  }
}

export async function updatePuzzle(id: number, input: UpdatePuzzleInput): Promise<PuzzleDetail> {
  const current = await findWritable(id);
  /**
   * v0.8.5 §7：改编码前查一次重。相同值直接放过 —— 查重看不见「自己」，同血统的
   * 草稿行与版本行本来就都带着这个编码。
   */
  if (input.code !== undefined && input.code !== current.code) {
    await assertCodeFree(Number(current.theme_id), input.code);
  }
  const updated = await puzzleRepo.updatePuzzle(id, input);
  if (!updated) {
    throw AppError.notFound('谜题不存在');
  }
  return toDetail(updated);
}

/**
 * `DELETE /api/puzzles/:id` 对两种行分流（同地图）：草稿行**硬删**，版本行
 * **软删**（另有专属端点，这里兜住「拿版本行 id 直接调通用删除」）。
 */
export async function deletePuzzle(id: number): Promise<void> {
  const row = await requireRow(id);
  if (row.version !== 'draft') {
    await deleteVersion(id, Number(row.version));
    return;
  }
  const deleted = await puzzleRepo.deletePuzzle(id);
  if (!deleted) {
    throw AppError.notFound('谜题不存在');
  }
}

export async function duplicatePuzzle(id: number): Promise<PuzzleDetail> {
  const source = await findWritable(id);
  const name = await uniqueCopyName(source.name);
  // v0.8.5 §7：副本是另一条谜题，编码要重新占一个 —— 原样复制会让两条谜题在部署
  // 时抢同一个路径。
  const code = await freeCode(Number(source.theme_id), source.code ?? null);
  const created = await puzzleRepo.duplicatePuzzle(id, name, code);
  if (!created) {
    throw AppError.notFound('谜题不存在');
  }
  return toDetail(created);
}

/**
 * 封面是二进制、创建 / 改名是 JSON，所以单独一条 multipart 路由（同地图）。
 * 建行之后才能上传 —— 新建弹窗里的封面因此是「创建成功后自动传」。
 */
export async function uploadCover(id: number, buffer: Buffer): Promise<PuzzleDetail> {
  await findWritable(id);
  const image = await processPuzzleCover(id, buffer);
  const row = await puzzleRepo.updateCoverPath(id, image.relativePath);
  if (!row) {
    throw AppError.notFound('谜题不存在');
  }
  return toDetail(row);
}

export async function removeCover(id: number): Promise<PuzzleDetail> {
  await findWritable(id);
  const row = await puzzleRepo.updateCoverPath(id, null);
  if (!row) {
    throw AppError.notFound('谜题不存在');
  }
  return toDetail(row);
}

/**
 * v0.8.6 §4：禁止符号图上传（multipart）。
 *
 * 三点与封面不同：
 *
 * 1. **只写文件、不写库** —— `path` 住在草稿 JSON 里，由作者随保存请求带回来。
 * 2. 所以**版本行也允许**（`requireRow`，不是 `findWritable`）：编辑器 `?v=` 的
 *    fork 态拿到的就是版本行 id，上传发生在保存草稿之前；写文件不碰冻结快照。
 * 3. 回执是 `{ path, url }` 而不是整条谜题 —— 行本来就没变。
 */
export async function uploadForbiddenSymbol(
  id: number,
  buffer: Buffer,
): Promise<{ path: string; url: string }> {
  await requireRow(id);
  const image = await processForbiddenSymbolImage({ kind: 'puzzle', id }, buffer);
  return { path: image.relativePath, url: buildFileUrl(image.relativePath) };
}

/**
 * 发布校验（§5.5，阻断式）：名册至少 1 位参与者（否则部署出去也没法玩）、
 * 角色 id 都存在、联动引用对自带画布合法。
 */
export async function validatePuzzle(draft: PuzzleDraft): Promise<PublishViolation[]> {
  const violations: PublishViolation[] = [];

  const ids = new Set<number>();
  for (const slot of draft.characterSlots) {
    if (slot) ids.add(slot.characterId);
  }
  if (ids.size === 0) {
    violations.push({ rule: 'roster_empty', message: '至少需要 1 位参与者才能发布' });
  }
  if (ids.size > 0) {
    const existing = await characterRepo.existingCharacterIds([...ids]);
    for (const id of ids) {
      if (!existing.has(id)) {
        violations.push({ rule: 'character_reference', message: `角色 #${id} 不存在` });
      }
    }
  }

  const issues = validatePuzzleReferences(draft, {
    cells: draft.map.data.cells ?? {},
    regions: draft.map.data.regions ?? [],
  });
  for (const issue of issues) {
    violations.push({ rule: 'linkage_reference', message: issue.message });
  }

  return violations;
}

/**
 * 发布 = 在 `puzzles` 里 INSERT 一条版本行（§5.2），草稿行不动。号来自整个
 * 血统的最大值（含软删行），可由用户指定（填空洞号），撞号直接 400。
 */
export async function publishPuzzle(id: number, versionNo?: number): Promise<PuzzleEntrySummary> {
  const row = await findWritable(id);
  const draft = rowDraft(row);
  if (!draft) {
    throw AppError.validation('谜题的底图画布不可读，请重新创建谜题');
  }

  const violations = await validatePuzzle(draft);
  if (violations.length > 0) {
    throw new AppError(ErrorCode.PUBLISH_VALIDATION_FAILED, '发布校验未通过', violations);
  }

  const rootId = Number(row.root_id);
  const target = versionNo ?? (await puzzleVersionRepo.nextVersionNo(rootId));
  if (await puzzleVersionRepo.versionNoTaken(rootId, target)) {
    throw AppError.validation(`版本号 v${target} 已存在于该谜题血统中，请换一个`);
  }

  const created = await puzzleVersionRepo.createVersion({ owner: row, versionNo: target, data: draft });
  const withLineage = await puzzleRepo.findById(Number(created.id));
  return puzzleRepo.toPuzzleEntry(withLineage ?? created);
}

/** 血统内的版本历史（活行，版本号倒序）。 */
export async function listVersions(id: number): Promise<PuzzleEntrySummary[]> {
  const owner = await requireRow(id);
  const rows = await puzzleVersionRepo.listVersionRows(Number(owner.root_id));
  return rows.map((row) => puzzleRepo.toPuzzleEntry(row));
}

export async function getVersion(id: number, versionNo: number): Promise<PuzzleDetail> {
  const row = await puzzleVersionRepo.getVersion(id, versionNo);
  if (!row) {
    throw AppError.notFound('版本不存在');
  }
  return toDetail(row);
}

/**
 * 「编辑此版本」= fork 出一条新草稿行（§5.5）。
 *
 * v0.7.2 §3.3：编辑器不再「点一下就 fork」，而是 `?v=` 进编辑器、**保存时**才
 * 带着当前草稿来这里落行。`data` 缺省 = 用版本快照（版本历史面板老行为）。
 *
 * 护栏与 `savePuzzle` 同一套，只是基准画布取**版本自己的** `map` —— 客户端送来
 * 的副本可以被改，服务端只用它的谜题侧字段，底图永远以版本行里的那份为准。
 *
 * fork 源不过滤软删：软删版本也能开新草稿（过滤只管可见性）。
 */
export async function forkVersion(
  id: number,
  versionNo: number,
  data?: PuzzleDraft,
  mapSource?: PuzzleMapSource,
): Promise<PuzzleDetail> {
  const owner = await puzzleRepo.findByIdIncludingDeleted(id);
  if (!owner) {
    throw AppError.notFound('谜题不存在');
  }
  const target = await puzzleVersionRepo.getVersion(id, versionNo, { includeDeleted: true });
  if (!target) {
    throw AppError.notFound('版本不存在');
  }

  let next: PuzzleDraft | undefined;
  if (data) {
    const source = rowDraft(target);
    if (!source) {
      throw AppError.validation('版本的底图画布不可读，无法编辑');
    }
    // `mapSource` 只在带 `data` 时才有意义 —— 不带 `data` 的 fork 就是「照
    // 快照复制一份」，没有可以挂新底图的草稿。
    next = {
      ...data,
      version: PUZZLE_JSON_VERSION,
      map: await resolveMapSnapshot(source.map, mapSource),
    };
    await assertKnownCharacters(next);
    assertReferenceIssues(next);
  }

  /**
   * fork 出来的行名：作者在「基本信息」里改过名就用他的，否则用
   * `{版本名} (自 v{n})` —— 血统里多份草稿才分得清。
   */
  const authored = data?.name?.trim();
  const name =
    authored && authored !== target.name
      ? authored
      : await uniqueName(`${target.name} (自 v${versionNo})`);
  const created = await puzzleVersionRepo.forkVersion(id, versionNo, name, next);
  if (!created) {
    throw AppError.notFound('版本不存在');
  }
  return toDetail(created);
}

/**
 * 删版本 = 软删。挂着**未取消部署**的游戏时拒绝 —— 删了会让已在线的
 * `/play/{slug}` 指向一份不存在的谜题。
 */
export async function deleteVersion(id: number, versionNo: number): Promise<void> {
  const row = await puzzleVersionRepo.getVersion(id, versionNo);
  if (!row) {
    throw AppError.notFound('版本不存在');
  }
  const game = await gameRepo.getGameByPuzzle(Number(row.id));
  if (game) {
    throw AppError.validation('该版本已部署为游戏，请先取消部署');
  }
  await puzzleVersionRepo.deleteVersion(id, versionNo);
}
