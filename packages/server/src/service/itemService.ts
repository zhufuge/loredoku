import type {
  CreateItemInput,
  Item,
  ItemUsage,
  ListItemsQuery,
  UpdateItemInput,
} from '@loredoku/shared';
import * as repo from '../repository/itemRepository';
import { AppError } from '../utils/AppError';
import { processCardImage } from '../utils/image';

export async function listItems(query: ListItemsQuery): Promise<Item[]> {
  return repo.listItems(query);
}

export async function getItem(id: number): Promise<Item> {
  const item = await repo.getItem(id);
  if (!item) {
    throw AppError.notFound('物品不存在');
  }
  return item;
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  if (await repo.findByCode(input.code)) {
    throw AppError.conflict('业务 ID 已存在');
  }
  const id = await repo.create(input);
  return getItem(id);
}

export async function updateItem(id: number, input: UpdateItemInput): Promise<Item> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('物品不存在');
  }
  await repo.update(id, input);
  return getItem(id);
}

export async function deleteItem(id: number, clearReferences: boolean): Promise<void> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('物品不存在');
  }
  await repo.softDelete(id, clearReferences);
}

export async function setItemActive(id: number, isActive: boolean): Promise<Item> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('物品不存在');
  }
  await repo.setActive(id, isActive);
  return getItem(id);
}

export async function hardDeleteItem(id: number, clearReferences: boolean): Promise<void> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('物品不存在');
  }
  await repo.hardDelete(id, clearReferences);
}

export async function uploadImage(id: number, buffer: Buffer): Promise<Item> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('物品不存在');
  }
  const processed = await processCardImage(id, buffer);
  await repo.setImage(id, {
    path: processed.relativePath,
    mime: processed.mime,
    size: processed.size,
    width: processed.width,
    height: processed.height,
  });
  return getItem(id);
}

export async function deleteImage(id: number): Promise<Item> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('物品不存在');
  }
  await repo.clearImage(id);
  return getItem(id);
}

export async function getUsages(id: number): Promise<ItemUsage[]> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('物品不存在');
  }
  return repo.getUsages(id);
}
