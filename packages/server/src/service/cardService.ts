import type {
  Card,
  CardTriggerInput,
  CardUsage,
  CreateCardInput,
  ListCardsQuery,
  UpdateCardInput,
} from '@murdoku/shared';
import * as repo from '../repository/cardRepository';
import { AppError } from '../utils/AppError';
import { processCardImage } from '../utils/image';

export async function listCards(query: ListCardsQuery): Promise<Card[]> {
  return repo.listCards(query);
}

export async function getCard(id: number): Promise<Card> {
  const card = await repo.getCard(id);
  if (!card) {
    throw AppError.notFound('卡片不存在');
  }
  return card;
}

export async function createCard(input: CreateCardInput): Promise<Card> {
  const existing = await repo.findByCode(input.code);
  if (existing) {
    throw AppError.conflict('业务 ID 已存在');
  }
  const id = await repo.create(input);
  return getCard(id);
}

export async function updateCard(id: number, input: UpdateCardInput): Promise<Card> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw AppError.notFound('卡片不存在');
  }
  await repo.update(id, input);
  return getCard(id);
}

export async function deleteCard(id: number, clearReferences: boolean): Promise<void> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw AppError.notFound('卡片不存在');
  }
  await repo.softDelete(id, clearReferences);
}

export async function replaceTriggers(id: number, triggers: CardTriggerInput[]): Promise<Card> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw AppError.notFound('卡片不存在');
  }
  await repo.replaceTriggers(id, triggers);
  return getCard(id);
}

export async function uploadImage(id: number, buffer: Buffer): Promise<Card> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw AppError.notFound('卡片不存在');
  }
  const processed = await processCardImage(id, buffer);
  await repo.setImage(id, {
    path: processed.relativePath,
    mime: processed.mime,
    size: processed.size,
    width: processed.width,
    height: processed.height,
  });
  return getCard(id);
}

export async function deleteImage(id: number): Promise<Card> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw AppError.notFound('卡片不存在');
  }
  await repo.clearImage(id);
  return getCard(id);
}

export async function getUsages(id: number): Promise<CardUsage[]> {
  const existing = await repo.findById(id);
  if (!existing) {
    throw AppError.notFound('卡片不存在');
  }
  return repo.getUsages(id);
}
