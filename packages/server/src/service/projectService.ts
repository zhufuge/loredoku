import type {
  CreateProjectInput,
  ListProjectsQuery,
  Project,
  ProjectDetail,
  UpdateProjectInput,
} from '@loredoku/shared';
import * as repo from '../repository/projectRepository';
import { AppError } from '../utils/AppError';

export async function listProjects(
  query: ListProjectsQuery & { page: number; pageSize: number },
): Promise<{ list: ProjectDetail[]; total: number }> {
  return repo.listProjects(query);
}

export async function getProjectDetail(id: number): Promise<ProjectDetail> {
  const row = await repo.findById(id);
  if (!row) {
    throw AppError.notFound('项目不存在');
  }
  const counts = await repo.getProjectCounts(id);
  return { ...repo.toProject(row), ...counts };
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (await repo.existsByName(input.name)) {
    throw AppError.conflict('项目名称已存在');
  }
  return repo.createProject({
    name: input.name,
    description: input.description ?? null,
    gridSize: input.gridSize,
  });
}

export async function updateProject(id: number, input: UpdateProjectInput): Promise<Project> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw AppError.notFound('项目不存在');
  }
  if (input.name && input.name !== existing.name && (await repo.existsByName(input.name, id))) {
    throw AppError.conflict('项目名称已存在');
  }
  const updated = await repo.updateProject(id, input);
  if (!updated) {
    throw AppError.notFound('项目不存在');
  }
  return updated;
}

export async function deleteProject(id: number): Promise<void> {
  const deleted = await repo.deleteProject(id);
  if (!deleted) {
    throw AppError.notFound('项目不存在');
  }
}

export async function duplicateProject(id: number): Promise<Project> {
  const source = await repo.findById(id);
  if (!source) {
    throw AppError.notFound('项目不存在');
  }
  const name = await uniqueCopyName(source.name);
  const created = await repo.duplicateProject(id, name);
  if (!created) {
    throw AppError.notFound('项目不存在');
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
