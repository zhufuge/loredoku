// Backward-compatible aliases. The "card" domain was renamed to "item" in v0.2
// (see docs/feature-0.2.md §FEAT-02). Prefer importing from './item'.
import {
  itemCodeSchema,
  createItemSchema,
  updateItemSchema,
  listItemsQuerySchema,
} from './item';
import type { CreateItemInput, UpdateItemInput, ListItemsQuery } from './item';

export const cardCodeSchema = itemCodeSchema;
export const createCardSchema = createItemSchema;
export const updateCardSchema = updateItemSchema;
export const listCardsQuerySchema = listItemsQuerySchema;

export type CreateCardInput = CreateItemInput;
export type UpdateCardInput = UpdateItemInput;
export type ListCardsQuery = ListItemsQuery;
