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

/** Raised when `POST /api/maps/:id/cover` arrives without a file part. */
export function coverRequired(): AppError {
  return AppError.validation('请选择封面图片');
}

/**
 * FEAT-K09 (docs/v0.5.0.md §7.1): the list is the **union of work entries and
 * version entries**, so a `MapDetail[]` is no longer the right shape.
 */
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

/**
 * 合并后版本行也是合法的 `maps` 行，改名 / 描
 * 述 / 封面这些「条目级」写操作必须把版本行拦下来 —— 版本是冻结快照。
 */
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

/**
 * **名称可以重复**。一个血统里「草稿 + 发布过的一堆版本」本来同名，用户凭
 * 版本号与更新时间区分；创建 / 改名都不查重，DB 侧也没有唯一约束。
 */
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

/**
 * `DELETE /api/maps/:id` 对两种行分流（设计 §5.1）：草稿行**硬删**（不牵连
 * 版本），版本行**软删**（界面消失、数据保留、号仍占 MAX）。版本删除另有专属
 * 端点，这里兜住「拿着版本行 id 直接调通用删除」的情况。
 */
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
  const name = await uniqueCopyName(source.name);
  const created = await repo.duplicateMap(id, name);
  if (!created) {
    throw AppError.notFound('地图不存在');
  }
  return created;
}

/**
 * 复制 / fork 的取名兜底：`{base} 副本`、`{base} 副本 2`… 直到不撞名。
 * fork 也走它（以「{name} (自 v{n})」为 base），故导出复用。
 */
export async function uniqueCopyName(baseName: string): Promise<string> {
  let candidate = `${baseName} 副本`;
  let index = 2;
  while (await repo.existsByName(candidate)) {
    candidate = `${baseName} 副本 ${index}`;
    index += 1;
  }
  return candidate;
}

/**
 * `base` 本身不撞名就用它，撞了再走 {@link uniqueCopyName} 的副本序列。
 * fork 的命名（「{name} (自 v{n})」）—— 血统内多草稿时第二次
 * fork 同一版本才需要加副本。
 */
export async function uniqueName(baseName: string): Promise<string> {
  if (!(await repo.existsByName(baseName))) return baseName;
  return uniqueCopyName(baseName);
}

/**
 * FEAT-H03 §3.2(c) (docs/v0.4.2.md §3): the cover is a binary file while create /
 * update are JSON, so it travels in its own multipart request. Both routes
 * return the refreshed detail, so the card repaints straight from the response.
 */
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
