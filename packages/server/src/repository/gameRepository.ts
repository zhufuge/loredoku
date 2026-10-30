import { db } from '../db/knex';
import { MAP_JSON_VERSION, absorbLegacyPuzzleDraft, puzzleGridSize } from '@loredoku/shared';
import type {
  GameDifficulty,
  MapGameDetail,
  MapGameRow,
  MapGameSummary,
  PuzzleDraft,
} from '@loredoku/shared';
import { buildFileUrl } from '../utils/paths';

/**
 * `games` 仓储（v0.7.1 §7.2 / §7.3）。
 *
 * 一行 = 一个**已部署**的游戏，只指向一个谜题**版本行**（`puzzle_id`：
 * `puzzle_id` 全域唯一 ⇒ 一个版本行 ⇄ 一个 game 行；不同版本各有一个游戏、各有
 * 一个 slug，可以同时在线）。画布与名册都从谜题行读 —— 没有 `snapshot` 拷贝，
 * 冻结性由「版本行只读」保证。
 *
 * 取消部署 = **假删**（`deleted_at`）：行保留、列表与详情一律过滤、slug 随
 * 部分唯一索引释放，可以再用同一路径重新部署。
 */

/** 列表 / 详情共用的 join 结果：game 行 + 它挂着的谜题行。 */
export interface GameRowWithPuzzle extends MapGameRow {
  /**
   * v0.8.0 §19：`games` 不存主题，这个字段顺着 `puzzles.theme_id` 查出来的是**编码**
   * —— 接口只认编码，`theme_id` 停在仓储层。
   */
  puzzle_theme_code: string;
  puzzle_name: string;
  puzzle_version: string;
  puzzle_data: unknown;
}

const GAME_SELECT = [
  'g.*',
  // 主键上的标量子查询，与地图列表同一套写法（§19）。
  db.raw('(SELECT t.code FROM themes t WHERE t.id = pz.theme_id) as puzzle_theme_code'),
  'pz.name as puzzle_name',
  'pz.version as puzzle_version',
  'pz.data as puzzle_data',
] as const;

/** 只服务活行：取消部署的 game 在列表、详情、slug 解析里全部「不存在」。 */
function liveQuery() {
  return db('games as g')
    .join('puzzles as pz', 'pz.id', 'g.puzzle_id')
    .whereNull('g.deleted_at');
}

export async function listGames(): Promise<MapGameSummary[]> {
  const rows = (await liveQuery()
    .select(...GAME_SELECT)
    .orderBy([
      // v0.8.3：作者填的顺序优先，同权重按访问路径 —— 一个确定的兜底。
      // 原来这里是 `created_at desc`（「最近部署的在前」），它只回答「刚做了什么」，
      // 不回答「玩家该先玩哪一关」；而真正在排序的那件事，此前只能靠改 slug 做。
      { column: 'g.sort_weight', order: 'asc' },
      { column: 'g.slug', order: 'asc' },
    ])) as GameRowWithPuzzle[];
  return rows.map(toSummary);
}

export async function getGameRow(id: number): Promise<GameRowWithPuzzle | undefined> {
  return liveQuery().where('g.id', id).select(...GAME_SELECT).first() as Promise<
    GameRowWithPuzzle | undefined
  >;
}

/** OPT-W04: 游戏页按访问路径寻址，不按 id。 */
export async function getGameRowBySlug(slug: string): Promise<GameRowWithPuzzle | undefined> {
  return liveQuery().where('g.slug', slug).select(...GAME_SELECT).first() as Promise<
    GameRowWithPuzzle | undefined
  >;
}

/**
 * v0.8.0（docs/v0.8.0.md §11.1）：资源包的取材 —— 某个主题下**已上线**的游戏。
 *
 * `games` 自己不存 `theme_id`（§3.1：主题只挂在四个内容表上），所以走
 * `join puzzles.theme_id`。排序与列表同一条规矩（v0.8.3）：`sort_weight` 升序、
 * 同权重按 `slug` —— 包里那一份和界面上那一份顺序一致，作者排好的先后在包外层
 * 也成立（有合辑时调用方仍按合辑的 `sort_order` 重排）。
 */
export async function listGameRowsByTheme(themeId: number): Promise<GameRowWithPuzzle[]> {
  return (await liveQuery()
    .where('pz.theme_id', themeId)
    .select(...GAME_SELECT)
    .orderBy([
      { column: 'g.sort_weight', order: 'asc' },
      { column: 'g.slug', order: 'asc' },
    ])) as GameRowWithPuzzle[];
}

/** OPT-W04 §4.4: 这条路径现在归谁 —— 别的谜题版本就是冲突。 */
export async function findGameBySlug(slug: string): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('games').where({ slug }).whereNull('deleted_at').first();
}

/** 一个版本行 ⇄ 一个 game 行：部署覆盖与「有部署时禁删版本」都查这个。 */
export async function getGameByPuzzle(puzzleId: number): Promise<MapGameRow | undefined> {
  return db<MapGameRow>('games').where({ puzzle_id: puzzleId }).whereNull('deleted_at').first();
}

export interface UpsertGameData {
  /** 部署单元 —— 必须是谜题的**版本行**（草稿行在 service 层就被拒）。 */
  puzzleId: number;
  name: string;
  /** OPT-W04: 已由 service 校验过格式与占用。 */
  slug: string;
  /**
   * OPT-W03 §3: 新封面路径（`null` = 没换）。`clearCover` 为真时显式清除；
   * 两者都没有就沿用上一行的封面 —— 重新部署不该悄悄丢掉作者上传的图。
   */
  coverPath: string | null;
  clearCover: boolean;
  /** v0.8.3：`gameService` 已按主题分级校验过，这里只负责写。 */
  difficulty: string;
  /**
   * v0.8.3：展示顺序。`undefined` = 这次没提 —— 沿用上一行的值（重新部署不该
   * 把作者排好的顺序清零）；都没有就落 `0`。
   *
   * 注意这个值必须在这里兜住：`upsertGame` 是 delete-then-insert，行换新 id，
   * 数据库默认值救不了「重新部署后被排到最后」。
   */
  sortWeight?: number;
  /**
   * v0.7.11：这条 slug 原本归另一条部署所有，作者选择了**覆盖**。
   *
   * 覆盖 = 把对方假删（`deleted_at`），部分唯一索引随即释放 —— 与「取消部署」
   * 同一种退场方式，只是由一次部署顺带完成。硬删会让对方连审计记录都不剩。
   */
  replaceGameId?: number | null;
}

/**
 * 同一版本行再次部署 = **覆盖**（delete-then-insert，行换新 id）；取消部署后
 * 再部署是新增行（旧行已假删，`puzzle_id` 唯一约束不拦）。
 *
 * v0.7.11：`replaceGameId` 在场时先让出那条被占用的部署（假删），再把新行插进去。
 */
export async function upsertGame(data: UpsertGameData): Promise<MapGameSummary> {
  const id = await db.transaction(async (trx) => {
    if (data.replaceGameId != null) {
      await trx('games')
        .where({ id: data.replaceGameId })
        .whereNull('deleted_at')
        .update({ deleted_at: trx.fn.now() });
    }

    const previous = (await trx<MapGameRow>('games')
      .where({ puzzle_id: data.puzzleId })
      .first()) as MapGameRow | undefined;

    const coverPath = data.clearCover ? null : data.coverPath ?? previous?.cover_path ?? null;
    const sortWeight = data.sortWeight ?? previous?.sort_weight ?? 0;

    await trx('games').where({ puzzle_id: data.puzzleId }).del();
    const [row] = (await trx<MapGameRow>('games')
      .insert({
        puzzle_id: data.puzzleId,
        name: data.name,
        slug: data.slug,
        cover_path: coverPath,
        difficulty: data.difficulty,
        sort_weight: sortWeight,
      })
      .returning('id')) as Array<{ id: string | number }>;
    return Number(row!.id);
  });

  const created = await getGameRow(id);
  if (!created) throw new Error('游戏部署后读取失败');
  return toSummary(created);
}

export async function updateGameCover(
  id: number,
  path: string,
): Promise<GameRowWithPuzzle | undefined> {
  await db('games')
    .where({ id })
    .whereNull('deleted_at')
    .update({ cover_path: path, updated_at: db.fn.now() });
  return getGameRow(id);
}

/**
 * v0.8.5：部署页就地改展示顺序。
 *
 * 只写 `sort_weight` 一列 —— 这是「排序」这件事最小的一次写，走部署端点重发
 * 整份负载会把 `name` / `slug` / `difficulty` 一起带回去，任何一个字段在弹窗
 * 里过时都会顺手把别的改掉。
 *
 * 返回更新后的摘要（`undefined` = 没有这条活行），调用方据此刷新列表。
 */
export async function updateGameSortWeight(
  id: number,
  sortWeight: number,
): Promise<MapGameSummary | undefined> {
  const affected = await db('games')
    .where({ id })
    .whereNull('deleted_at')
    .update({ sort_weight: sortWeight, updated_at: db.fn.now() });
  if (affected === 0) return undefined;
  const row = await getGameRow(id);
  return row ? toSummary(row) : undefined;
}

/** 取消部署 = 假删。行还在（审计 / 同一 slug 可复用），只是不再出现。 */
export async function cancelGame(id: number): Promise<boolean> {
  const affected = await db('games')
    .where({ id })
    .whereNull('deleted_at')
    .update({ deleted_at: db.fn.now() });
  return affected > 0;
}

function puzzleDraftOf(row: GameRowWithPuzzle): PuzzleDraft | null {
  return absorbLegacyPuzzleDraft(row.puzzle_data);
}

/** 名册里非空槽位的数量 —— 游戏卡片上的「n 位参与者」。 */
function participantCount(draft: PuzzleDraft | null): number {
  if (!draft) return 0;
  return draft.characterSlots.filter((slot) => slot !== null).length;
}

export function toSummary(row: GameRowWithPuzzle): MapGameSummary {
  const draft = puzzleDraftOf(row);
  return {
    id: Number(row.id),
    puzzleId: Number(row.puzzle_id),
    themeCode: row.puzzle_theme_code,
    puzzleName: row.puzzle_name,
    // 游戏只挂在版本行上，`'draft'` 不可能出现（`Number()` 在这里是安全的，
    // 但版本号从 `versionToNo` 的语义来 —— 这里直接取，仍留个 0 兜底）。
    puzzleVersionNo: row.puzzle_version === 'draft' ? 0 : Number(row.puzzle_version),
    name: row.name,
    slug: row.slug,
    coverUrl: row.cover_path ? buildFileUrl(row.cover_path) : null,
    difficulty: row.difficulty,
    sortWeight: Number(row.sort_weight ?? 0),
    gridSize: draft ? puzzleGridSize(draft) : 0,
    participantCount: participantCount(draft),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** 详情直接给画布 + 谜题（游戏页从这两块渲染，不再有快照）。 */
export function toDetail(row: GameRowWithPuzzle): MapGameDetail {
  const puzzle = puzzleDraftOf(row);
  return {
    ...toSummary(row),
    map: puzzle?.map.data ?? {
      version: MAP_JSON_VERSION,
      gridSize: 0,
      cells: {},
      regions: [],
    },
    puzzle,
  };
}
