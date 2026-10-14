import type { Card, CardTriggerInput, CardUsage } from '@murdoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

export interface ListCardsParams {
  keyword?: string;
  isActive?: boolean;
}

export interface CreateCardPayload {
  code: string;
  name: string;
  meta?: Record<string, unknown>;
  triggers?: CardTriggerInput[];
}

export interface UpdateCardPayload {
  name?: string;
  meta?: Record<string, unknown>;
  isActive?: boolean;
}

export const cardsApi = {
  list(params: ListCardsParams = {}): Promise<Card[]> {
    return apiGet<Card[]>('/cards', { params });
  },
  detail(id: number): Promise<Card> {
    return apiGet<Card>(`/cards/${id}`);
  },
  create(payload: CreateCardPayload): Promise<Card> {
    return apiPost<Card>('/cards', payload);
  },
  update(id: number, payload: UpdateCardPayload): Promise<Card> {
    return apiPatch<Card>(`/cards/${id}`, payload);
  },
  remove(id: number, clearReferences: boolean): Promise<null> {
    return apiDelete<null>(`/cards/${id}`, { params: { clearReferences } });
  },
  usages(id: number): Promise<CardUsage[]> {
    return apiGet<CardUsage[]>(`/cards/${id}/usages`);
  },
  replaceTriggers(id: number, triggers: CardTriggerInput[]): Promise<Card> {
    return apiPut<Card>(`/cards/${id}/triggers`, triggers);
  },
  uploadImage(id: number, file: File): Promise<Card> {
    const form = new FormData();
    form.append('file', file);
    return apiPost<Card>(`/cards/${id}/image`, form);
  },
  deleteImage(id: number): Promise<Card> {
    return apiDelete<Card>(`/cards/${id}/image`);
  },
};
