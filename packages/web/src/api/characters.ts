import type { Character, CharacterUsage } from '@murdoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface ListCharactersParams {
  keyword?: string;
  isActive?: boolean;
}

export interface CreateCharacterPayload {
  code: string;
  name: string;
  description?: string | null;
  meta?: Record<string, unknown>;
}

export interface UpdateCharacterPayload {
  name?: string;
  description?: string | null;
  meta?: Record<string, unknown>;
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
  remove(id: number): Promise<null> {
    return apiDelete<null>(`/characters/${id}`);
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
