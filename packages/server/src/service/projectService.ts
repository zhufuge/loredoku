import type {
  CreateProjectInput,
  ListProjectsQuery,
  MapEntrySummary,
  Project,
  ProjectDetail,
  PublishedMapVersion,
  UpdateProjectInput,
} from '@loredoku/shared';
import * as repo from '../repository/projectRepository';
import { AppError } from '../utils/AppError';
import { processProjectCover } from '../utils/image';

/** Raised when `POST /api/projects/:id/cover` arrives without a file part. */
export function coverRequired(): AppError {
  return AppError.validation('请选择封面图片');
}

/**
 * FEAT-K09 (docs/v0.5.0.md §7.1): the list is the **union of work entries and
 * version entries**, so a `ProjectDetail[]` is no longer the right shape.
 */
export async function listMapEntries(
  query: ListProjectsQuery & { page: number; pageSize: number },
): Promise<{ list: MapEntrySummary[]; total: number }> {
  return repo.listMapEntries(query);
}

/** FEAT-K03 §2.4: every published map version, for the puzzle picker. */
export async function listPublishedVersions(): Promise<PublishedMapVersion[]> {
  return repo.listPublishedVersions();
}

export async function getProjectDetail(id: number): Promise<ProjectDetail> {
  const row = await repo.findById(id);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  const counts = await repo.getProjectCounts(id);
  return { ...repo.toProject(row), ...counts };
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (await repo.existsByName(input.name)) {
    throw AppError.conflict('地图名称已存在');
  }
  return repo.createProject({
    name: input.name,
    description: input.description ?? null,
  });
}

export async function updateProject(id: number, input: UpdateProjectInput): Promise<Project> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw AppError.notFound('地图不存在');
  }
  if (input.name && input.name !== existing.name && (await repo.existsByName(input.name, id))) {
    throw AppError.conflict('地图名称已存在');
  }
  const updated = await repo.updateProject(id, input);
  if (!updated) {
    throw AppError.notFound('地图不存在');
  }
  return updated;
}

export async function deleteProject(id: number): Promise<void> {
  const deleted = await repo.deleteProject(id);
  if (!deleted) {
    throw AppError.notFound('地图不存在');
  }
}

export async function duplicateProject(id: number): Promise<Project> {
  const source = await repo.findById(id);
  if (!source) {
    throw AppError.notFound('地图不存在');
  }
  const name = await uniqueCopyName(source.name);
  const created = await repo.duplicateProject(id, name);
  if (!created) {
    throw AppError.notFound('地图不存在');
  }
  return created;
}

async function uniqueCopyName(baseName: string): Promise<string> {
  let candidate = `${baseName} 副本`;
  let index = 2;
  while (await repo.existsByName(candidate)) {
    candidate = `${baseName} 副本 ${index}`;
    index += 1;
  }
  return candidate;
}

/**
 * FEAT-H03 §3.2(c) (docs/v0.4.2.md §3): the cover is a binary file while create /
 * update are JSON, so it travels in its own multipart request. Both routes
 * return the refreshed detail, so the card repaints straight from the response.
 */
export async function uploadCover(id: number, buffer: Buffer): Promise<ProjectDetail> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw AppError.notFound('地图不存在');
  }
  const image = await processProjectCover(id, buffer);
  const row = await repo.updateCoverPath(id, image.relativePath);
  if (!row) {
    throw AppError.notFound('地图不存在');
  }
  return getProjectDetail(id);
}

/** FEAT-H03 §3.2a: the explicit "remove" button — `cover_path` goes back to NULL. */
export async function removeCover(id: number): Promise<ProjectDetail> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw AppError.notFound('地图不存在');
  }
  await repo.updateCoverPath(id, null);
  return getProjectDetail(id);
}
