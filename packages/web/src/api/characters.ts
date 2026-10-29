import type { Character, CharacterGender, CharacterUsage } from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface ListCharactersParams {
  keyword?: string;
  isActive?: boolean;
  /** v0.8.0 §19：按主题编码筛。 */
  themeCode?: string;
}

export interface CreateCharacterPayload {
  code: string;
  name: string;
  /** v0.8.0 §19：这个角色属于哪个主题。**必填**，用编码。 */
  themeCode: string;
  /** FEAT-501 */
  gender?: CharacterGender;
  description?: string | null;
  /** v0.5.1 FEAT-L02: colour-block colour; `null` = image mode. */
  bgColor?: string | null;
  /** v0.7.13: default 主题色 for the roster slot; `null` = no default. */
  color?: string | null;
  /** v0.7.13: default 编号 for the roster slot; `null` = no default. */
  displayName?: string | null;
  /** v0.5.3 FEAT-N06: `true` creates the character already enabled. */
  isActive?: boolean;
}

export interface UpdateCharacterPayload {
  name?: string;
  gender?: CharacterGender;
  description?: string | null;
  /** v0.5.1 FEAT-L02: `null` drops back to the image mode. */
  bgColor?: string | null;
  /** v0.7.13: `null` drops the participant 主题色 default. */
  color?: string | null;
  /** v0.7.13: `null` drops the 编号 default back to the sequence number. */
  displayName?: string | null;
  isActive?: boolean;
}

export const charactersApi = {
  list(params: ListCharactersParams = {}): Promise<Character[]> {
    return apiGet<Character[]>('/characters', { params });
  },
  detail(id: number): Promise<Character> {
    return apiGet<Character>(`/characters/${id}`);
  },
  create(payload: CreateCharacterPayload): Promise<Character> {
    return apiPost<Character>('/characters', payload);
  },
  update(id: number, payload: UpdateCharacterPayload): Promise<Character> {
    return apiPatch<Character>(`/characters/${id}`, payload);
  },
  remove(id: number, options: { hard?: boolean; clearReferences?: boolean } = {}): Promise<null> {
    return apiDelete<null>(`/characters/${id}`, {
      params: { hard: options.hard ?? false, clearReferences: options.clearReferences ?? false },
    });
  },
  enable(id: number): Promise<Character> {
    return apiPost<Character>(`/characters/${id}/enable`, {});
  },
  disable(id: number): Promise<Character> {
    return apiPost<Character>(`/characters/${id}/disable`, {});
  },
  usages(id: number): Promise<CharacterUsage[]> {
    return apiGet<CharacterUsage[]>(`/characters/${id}/usages`);
  },
  uploadAvatar(id: number, file: File): Promise<Character> {
    const form = new FormData();
    form.append('file', file);
    return apiPost<Character>(`/characters/${id}/avatar`, form);
  },
  deleteAvatar(id: number): Promise<Character> {
    return apiDelete<Character>(`/characters/${id}/avatar`);
  },
};
