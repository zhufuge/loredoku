import {
  ErrorCode,
  absorbLegacyPuzzleDraft,
  buildDefaultSlug,
  defaultDifficultyLevel,
  gameDeploySchema,
  gameWeightUpdateSchema,
  resolveDifficultyTiers,
  slugError,
} from '@loredoku/shared';
import type { GameSlugConflict, MapGameDetail, MapGameSummary } from '@loredoku/shared';
import * as puzzleRepo from '../repository/puzzleRepository';
import * as gameRepo from '../repository/gameRepository';
import * as themeRepo from '../repository/themeRepository';
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
  /** 路径被别的谜题版本占着时，覆盖它（把占位那条假删）。 */
  overwriteSlug?: boolean;
  difficulty?: MapGameSummary['difficulty'];
  /** v0.8.3：展示顺序（升序）。缺省 = 沿用上一行，都没有就 0。 */
  sortWeight?: number;
}

/** 部署 = 已发布版本行变游戏；草稿行在这里 400，同版本重部署 = 覆盖（`overwriteSlug` 时假删占位）（v0.7.1 §7.1）。 */
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
  const { slug, replaceGameId } = await resolveSlug(
    puzzleId,
    body.slug,
    name,
    body.overwriteSlug === true,
    puzzle.code ?? null,
  );

  const difficulty = await resolveDifficulty(Number(puzzle.theme_id), body.difficulty);

  return gameRepo.upsertGame({
    puzzleId,
    name,
    slug,
    coverPath: null,
    clearCover: body.clearCover === true,
    difficulty,
    sortWeight: body.sortWeight,
    replaceGameId,
  });
}

/** 空就推导、填了就校验再查占用；全中文名推不出时不发明，抛带 {@link GameSlugConflict} 的错给覆盖弹窗。 */
async function resolveSlug(
  puzzleId: number,
  rawSlug: string | undefined,
  name: string,
  overwriteSlug: boolean,
  code: string | null,
): Promise<{ slug: string; replaceGameId: number | null }> {
  const typed = (rawSlug ?? '').trim();
  if (rawSlug !== undefined && typed.length === 0) {
    throw AppError.validation('访问路径必填');
  }

  /**
   * 难度不进路径；兜底**先看谜题编码**（它本来就是路径形状），没有编码才退回名称（v0.8.5 §7.4）。
   */
  const slug =
    typed.length > 0 ? typed.toLowerCase() : buildDefaultSlug({ name: code ?? name });

  const problem = slugError(slug);
  if (problem) {
    // 全中文名推不出任何东西 —— 明说，而不是丢一个格式错误。
    if (typed.length === 0) {
      throw AppError.validation('无法根据名称生成访问路径，请手动填写（仅限小写字母、数字与连字符）');
    }
    throw AppError.validation(problem);
  }

  const owner = await gameRepo.findGameBySlug(slug);
  // 同一版本行自己占着这条路径是正常情况（覆盖部署），不是冲突。
  if (!owner || Number(owner.puzzle_id) === puzzleId) {
    return { slug, replaceGameId: null };
  }

  if (!overwriteSlug) {
    const ownerName = await gameRepo.getGameRow(Number(owner.id));
    throw AppError.validation(`访问路径「${slug}」已被占用，请更换`, {
      kind: 'slug-taken',
      slug,
      name: ownerName?.name ?? slug,
      puzzleName: ownerName?.puzzle_name ?? '',
    } satisfies GameSlugConflict);
  }

  return { slug, replaceGameId: Number(owner.id) };
}

/** 档位必须是本主题的一档（schema 只看 1…99）；没提难度补主题默认档，不能写死 3，否则两档主题部署不了。 */
async function resolveDifficulty(themeId: number, requested: number | undefined): Promise<number> {
  const theme = await themeRepo.findById(themeId);
  if (!theme) {
    throw AppError.validation('谜题所属的主题不存在，无法部署');
  }
  const tiers = resolveDifficultyTiers(theme.data.difficultyLevels);
  if (requested === undefined) {
    return defaultDifficultyLevel(tiers);
  }
  if (!tiers.some((tier) => tier.level === requested)) {
    const names = tiers.map((tier) => `第 ${tier.level} 档「${tier.label}」`).join('、');
    throw AppError.validation(`「第 ${requested} 档」不是这个主题的难度分级（可用：${names}）`);
  }
  return requested;
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

/** 只认 `sortWeight`（区间 ±999）：这条端点是排序，不是编辑部署；越界 400 而非静默。 */
export async function updateGameSortWeight(
  id: number,
  input: unknown,
): Promise<MapGameSummary> {
  const body = parseOrThrow(gameWeightUpdateSchema, input);
  const updated = await gameRepo.updateGameSortWeight(id, body.sortWeight);
  if (!updated) {
    throw AppError.notFound('游戏不存在');
  }
  return updated;
}

/** 取消部署 = 假删（§7.4）：链接立刻 404，但行还在、slug 释放，同路径重部署即复活。 */
export async function cancelGame(id: number): Promise<void> {
  const cancelled = await gameRepo.cancelGame(id);
  if (!cancelled) {
    throw AppError.notFound('游戏不存在');
  }
}
