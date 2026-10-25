import type { Character, CharacterGender, CharacterUsage } from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface ListCharactersParams {
  keyword?: string;
  isActive?: boolean;
}

export interface CreateCharacterPayload {
  code: string;
  name: string;
  /** FEAT-501 */
  gender?: CharacterGender;
  description?: string | null;
  /** v0.5.1 FEAT-L02: colour-block colour; `null` = image mode. */
  bgColor?: string | null;
  /** v0.5.3 FEAT-N06: `true` creates the character already enabled. */
  isActive?: boolean;
}

export interface UpdateCharacterPayload {
  name?: string;
  gender?: CharacterGender;
  description?: string | null;
  /** v0.5.1 FEAT-L02: `null` drops back to the image mode. */
  bgColor?: string | null;
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
