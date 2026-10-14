// Backward-compatible aliases. The "card" domain was renamed to "item" in v0.2
// (see docs/feature-0.2.md §FEAT-02). Prefer importing from './item'.
import {
  itemTriggerInputSchema,
  itemCodeSchema,
  createItemSchema,
  updateItemSchema,
  replaceItemTriggersSchema,
  listItemsQuerySchema,
} from './item';
import type {
  CreateItemInput,
  UpdateItemInput,
  ItemTriggerInput,
  ListItemsQuery,
} from './item';

export const cardTriggerInputSchema = itemTriggerInputSchema;
export const cardCodeSchema = itemCodeSchema;
export const createCardSchema = createItemSchema;
export const updateCardSchema = updateItemSchema;
export const replaceTriggersSchema = replaceItemTriggersSchema;
export const listCardsQuerySchema = listItemsQuerySchema;

export type CreateCardInput = CreateItemInput;
export type UpdateCardInput = UpdateItemInput;
export type CardTriggerInput = ItemTriggerInput;
export type ListCardsQuery = ListItemsQuery;
