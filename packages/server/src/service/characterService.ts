import type {
  Character,
  CharacterUsage,
  CreateCharacterInput,
  ListCharactersQuery,
  UpdateCharacterInput,
} from '@loredoku/shared';
import * as repo from '../repository/characterRepository';
import * as themeService from './themeService';
import { AppError } from '../utils/AppError';
import { processAvatarImage } from '../utils/image';

export async function listCharacters(query: ListCharactersQuery): Promise<Character[]> {
  const { themeCode, ...rest } = query;
  return repo.listCharacters({ ...rest, themeId: await themeService.filterThemeId(themeCode) });
}

export async function getCharacter(id: number): Promise<Character> {
  const character = await repo.getCharacter(id);
  if (!character) {
    throw AppError.notFound('角色不存在');
  }
  return character;
}

export async function createCharacter(input: CreateCharacterInput): Promise<Character> {
  // v0.8.0：`code` 只在主题内唯一，查重带主题。§19：主题必填且用编码。
  const themeId = await themeService.requireThemeId(input.themeCode);
  if (await repo.findByCode(input.code, themeId)) {
    throw AppError.conflict('角色编码已存在');
  }
  const id = await repo.create({
    themeId,
    code: input.code,
    name: input.name,
    gender: input.gender,
    description: input.description ?? null,
    // v0.5.1 FEAT-L02: colour-block colour (`null` = image mode).
    bgColor: input.bgColor ?? null,
    // v0.7.13: 参与者默认值（`null` = 没有默认，加入时照旧走缺省）。
    color: input.color ?? null,
    displayName: input.displayName ?? null,
    // v0.5.3 FEAT-N06: 带外观创建 → 直接启用。
    isActive: input.isActive,
  });
  return getCharacter(id);
}

export async function updateCharacter(
  id: number,
  input: UpdateCharacterInput,
): Promise<Character> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('角色不存在');
  }
  await repo.update(id, input);
  return getCharacter(id);
}

export async function deleteCharacter(id: number): Promise<void> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('角色不存在');
  }
  await repo.softDelete(id);
}

export async function setCharacterActive(id: number, isActive: boolean): Promise<Character> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('角色不存在');
  }
  await repo.setActive(id, isActive);
  return getCharacter(id);
}

export async function hardDeleteCharacter(id: number, clearReferences: boolean): Promise<void> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('角色不存在');
  }
  await repo.hardDelete(id, clearReferences);
}

export async function uploadAvatar(id: number, buffer: Buffer): Promise<Character> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('角色不存在');
  }
  const processed = await processAvatarImage(id, buffer);
  await repo.setAvatar(id, processed.relativePath);
  return getCharacter(id);
}

export async function deleteAvatar(id: number): Promise<Character> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('角色不存在');
  }
  await repo.clearAvatar(id);
  return getCharacter(id);
}

export async function getUsages(id: number): Promise<CharacterUsage[]> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('角色不存在');
  }
  return repo.getUsages(id);
}
