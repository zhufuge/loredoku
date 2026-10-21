import { ErrorCode, absorbLegacyPuzzleDraft, buildDefaultSlug, gameDeploySchema, slugError } from '@loredoku/shared';
import type { MapGameDetail, MapGameSummary } from '@loredoku/shared';
import * as puzzleRepo from '../repository/puzzleRepository';
import * as gameRepo from '../repository/gameRepository';
import { AppError } from '../utils/AppError';
import { parseOrThrow } from '../utils/validate';
import { processGameCover } from '../utils/image';

/** Raised when `POST /api/games/:id/cover` arrives without a file part. */
export function coverRequired(): AppError {
  return new AppError(ErrorCode.VALIDATION_FAILED, '请选择要上传的封面图片');
}

export interface DeployGameInput {
  name?: string;
  /** OPT-W04: 空 / 缺省 → 由名称 + 难度拼出来。 */
  slug?: string;
  /** OPT-W03 §3: 显式「移除已存封面」。 */
  clearCover?: boolean;
  difficulty?: MapGameSummary['difficulty'];
}

/**
 * 部署 = 把一个**已发布的谜题版本行**变成可玩的游戏（v0.7.1 §7.1）。
 *
 * 四层拦截的第三层就在下面第一段：草稿行直接 400。前三层（UI 不渲染按钮 /
 * 弹窗只收版本条目）是给人看的，这一层才是真正管用的 —— 草稿行不能部署意味着
 * 玩家永远碰不到「作者还在改」的内容，冻结性也就不需要 `snapshot` 拷贝。
 *
 * 再次部署**同一版本** = 覆盖那一行（`upsertGame` 的 delete-then-insert），
 * 不同版本各有一个游戏、各有一个访问路径，可以同时在线。
 */
export async function deployGame(puzzleId: number, input: DeployGameInput): Promise<MapGameSummary> {
  const body = parseOrThrow(gameDeploySchema, input);

  const puzzle = await puzzleRepo.findById(puzzleId);
  if (!puzzle) {
    throw AppError.notFound('谜题不存在');
  }
  if (puzzle.version === 'draft') {
    throw AppError.validation('只有已发布的谜题版本可以部署');
  }
  if (!absorbLegacyPuzzleDraft(puzzle.data)) {
    throw AppError.validation('谜题的底图画布不可读，无法部署');
  }

  // 名称默认用谜题名；显式传空串是错的（未填的输入框应当部署成谜题名）。
  const trimmed = (body.name ?? '').trim();
  if (body.name !== undefined && trimmed.length === 0) {
    throw AppError.validation('游戏名称必填');
  }
  const name = trimmed.length > 0 ? trimmed : puzzle.name;
  const slug = await resolveSlug(puzzleId, body.slug, name, body.difficulty);

  return gameRepo.upsertGame({
    puzzleId,
    name,
    slug,
    coverPath: null,
    clearCover: body.clearCover === true,
    difficulty: body.difficulty,
  });
}

/**
 * OPT-W04 §4.3 / §4.4: 空就推导、填了就校验，再确认没有别的谜题版本占着这条
 * 路径。Q13（v0.4.1）：名称 slug 化之后什么都不剩时**不发明**路径，让作者自己填。
 *
 * 路径由前端按「前缀 + 中段 + 难度后缀」拼好再提交（§7.6.1），这里只做最后
 * 一道格式与占用检查 —— 服务端不再二次加工。
 */
async function resolveSlug(
  puzzleId: number,
  rawSlug: string | undefined,
  name: string,
  difficulty: MapGameSummary['difficulty'],
): Promise<string> {
  const typed = (rawSlug ?? '').trim();
  if (rawSlug !== undefined && typed.length === 0) {
    throw AppError.validation('访问路径必填');
  }

  const slug = typed.length > 0 ? typed.toLowerCase() : buildDefaultSlug({ name, difficulty });

  const problem = slugError(slug);
  if (problem) {
    // 全中文名推不出任何东西 —— 明说，而不是丢一个格式错误。
    if (typed.length === 0) {
      throw AppError.validation('无法根据名称生成访问路径，请手动填写（仅限小写字母、数字与连字符）');
    }
    throw AppError.validation(problem);
  }

  const owner = await gameRepo.findGameBySlug(slug);
  if (owner && Number(owner.puzzle_id) !== puzzleId) {
    throw AppError.validation(`访问路径「${slug}」已被占用，请更换`);
  }
  return slug;
}

export async function listGames(): Promise<MapGameSummary[]> {
  return gameRepo.listGames();
}

export async function getGame(id: number): Promise<MapGameDetail> {
  const row = await gameRepo.getGameRow(id);
  if (!row) {
    throw AppError.notFound('游戏不存在');
  }
  return gameRepo.toDetail(row);
}

/** OPT-W04 §4.6: 游戏页按访问路径解析（下架的 game 一律 404）。 */
export async function getGameBySlug(slug: string): Promise<MapGameDetail> {
  const row = await gameRepo.getGameRowBySlug(slug);
  if (!row) {
    throw AppError.notFound('游戏不存在');
  }
  return gameRepo.toDetail(row);
}

export async function uploadGameCover(id: number, buffer: Buffer): Promise<MapGameSummary> {
  const existing = await gameRepo.getGameRow(id);
  if (!existing) {
    throw AppError.notFound('游戏不存在');
  }
  const image = await processGameCover(Number(existing.id), buffer);
  const row = await gameRepo.updateGameCover(id, image.relativePath);
  if (!row) {
    throw AppError.notFound('游戏不存在');
  }
  return gameRepo.toSummary(row);
}

/**
 * 取消部署 = 假删（§7.4）。玩家手里的链接立刻 404，但行还在、slug 被释放
 * —— 用同一个访问路径重新部署，链接复活。
 */
export async function cancelGame(id: number): Promise<void> {
  const cancelled = await gameRepo.cancelGame(id);
  if (!cancelled) {
    throw AppError.notFound('游戏不存在');
  }
}
