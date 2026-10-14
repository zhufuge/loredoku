import type { Item, ItemCategory, ItemTriggerInput, ItemUsage } from '@murdoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

export interface ListItemsParams {
  keyword?: string;
  isActive?: boolean;
  category?: ItemCategory;
}

export interface CreateItemPayload {
  code: string;
  name: string;
  category?: ItemCategory;
  widthCells?: number;
  heightCells?: number;
  canStand?: boolean;
  meta?: Record<string, unknown>;
  triggers?: ItemTriggerInput[];
}

export interface UpdateItemPayload {
  name?: string;
  category?: ItemCategory;
  widthCells?: number;
  heightCells?: number;
  canStand?: boolean;
  meta?: Record<string, unknown>;
  isActive?: boolean;
}

export const itemsApi = {
  list(params: ListItemsParams = {}): Promise<Item[]> {
    return apiGet<Item[]>('/items', { params });
  },
  detail(id: number): Promise<Item> {
    return apiGet<Item>(`/items/${id}`);
  },
  create(payload: CreateItemPayload): Promise<Item> {
    return apiPost<Item>('/items', payload);
  },
  update(id: number, payload: UpdateItemPayload): Promise<Item> {
    return apiPatch<Item>(`/items/${id}`, payload);
  },
  remove(id: number, clearReferences: boolean): Promise<null> {
    return apiDelete<null>(`/items/${id}`, { params: { clearReferences } });
  },
  usages(id: number): Promise<ItemUsage[]> {
    return apiGet<ItemUsage[]>(`/items/${id}/usages`);
  },
  replaceTriggers(id: number, triggers: ItemTriggerInput[]): Promise<Item> {
    return apiPut<Item>(`/items/${id}/triggers`, triggers);
  },
  uploadImage(id: number, file: File): Promise<Item> {
    const form = new FormData();
    form.append('file', file);
    return apiPost<Item>(`/items/${id}/image`, form);
  },
  deleteImage(id: number): Promise<Item> {
    return apiDelete<Item>(`/items/${id}/image`);
  },
};
