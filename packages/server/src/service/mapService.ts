import type {
  CreateMapInput,
  ListMapsQuery,
  MapEntrySummary,
  MapEntry,
  MapDetail,
  PublishedMapVersion,
  UpdateMapInput,
} from '@loredoku/shared';
import * as repo from '../repository/mapRepository';
import * as versionRepo from '../repository/versionRepository';
import * as themeService from './themeService';
import { AppError } from '../utils/AppError';
import { processMapCover } from '../utils/image';
import { uniqueCopyName } from './uniqueName';

/** Raised when `POST /api/maps/:id/cover` arrives without a file part. */
export function coverRequired(): AppError {
  return AppError.validation('请选择封面图片');
}

/** 列表是工作条目与版本条目的并集，所以返回 `MapEntrySummary[]` 而不是 `MapDetail[]`（v0.5.0 §7.1）。 */
export async function listMapEntries(
  query: ListMapsQuery & { page: number; pageSize: number },
): Promise<{ list: MapEntrySummary[]; total: number }> {
  const { themeCode, ...rest } = query;
  return repo.listMapEntries({ ...rest, themeId: await themeService.filterThemeId(themeCode) });
}

/** FEAT-K03 §2.4: every published map version, for the puzzle picker. */
export async function listPublishedVersions(): Promise<PublishedMapVersion[]> {
  return repo.listPublishedVersions();
}

export async function getMapDetail(id: number): Promise<MapDetail> {
  const row = await repo.findById(id);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  const counts = await repo.getMapCounts(id);
  return { ...repo.toMapEntry(row), ...counts };
}

/** 版本行也是合法的 `maps` 行，改名 / 描述 / 封面这些条目级写操作必须把版本行拦下来 —— 版本是冻结快照。 */
async function findWritable(id: number): Promise<repo.MapRowWithLineage> {
  const row = await repo.findById(id);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  if (row.version !== 'draft') {
    throw AppError.validation('已发布的版本不可修改');
  }
  return row;
}

/** **名称可以重复**：一个血统里草稿与各版本本来就同名，创建 / 改名都不查重，DB 无唯一约束。 */
export async function createMap(input: CreateMapInput): Promise<MapEntry> {
  return repo.createMap({
    // v0.8.0：地图是边界的第二公民。§19：主题必填且用编码。
    themeId: await themeService.requireThemeId(input.themeCode),
    name: input.name,
    description: input.description ?? null,
  });
}

export async function updateMap(id: number, input: UpdateMapInput): Promise<MapEntry> {
  await findWritable(id);
  const updated = await repo.updateMap(id, input);
  if (!updated) {
    throw AppError.notFound('地图不存在');
  }
  return updated;
}

/** 设计 §5.1：草稿行**硬删**（不牵连版本）、版本行**软删**（界面消失、数据保留、号仍占 MAX）。 */
export async function deleteMap(id: number): Promise<void> {
  const row = await repo.findById(id);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  if (row.version !== 'draft') {
    const removed = await versionRepo.deleteVersion(id, Number(row.version));
    if (!removed) {
      throw AppError.notFound('地图不存在');
    }
    return;
  }
  const deleted = await repo.deleteMap(id);
  if (!deleted) {
    throw AppError.notFound('地图不存在');
  }
}

export async function duplicateMap(id: number): Promise<MapEntry> {
  const source = await findWritable(id);
  const name = await uniqueCopyName(source.name, repo.existsByName);
  const created = await repo.duplicateMap(id, name);
  if (!created) {
    throw AppError.notFound('地图不存在');
  }
  return created;
}

/** 封面是二进制而创建 / 更新是 JSON，故单独走 multipart；两个方向都返回刷新后的详情（v0.4.2 §3）。 */
export async function uploadCover(id: number, buffer: Buffer): Promise<MapDetail> {
  await findWritable(id);
  const image = await processMapCover(id, buffer);
  const row = await repo.updateCoverPath(id, image.relativePath);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  return getMapDetail(id);
}

/** FEAT-H03 §3.2a: the explicit "remove" button — `cover_path` goes back to NULL. */
export async function removeCover(id: number): Promise<MapDetail> {
  await findWritable(id);
  await repo.updateCoverPath(id, null);
  return getMapDetail(id);
}
