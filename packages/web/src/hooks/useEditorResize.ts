import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import type { DraftRegion, Item } from '@loredoku/shared';
import type { CellMap } from '@/lib/highlight';
import type { useUpdateGridSize } from '@/hooks/useMap';

/**
 * the map editor's 调整画布尺寸 flow, lifted out of `EditorPage`.
 *
 * The dialog previews exactly what the resize would remove (out-of-bounds
 * items and partially clipped regions) before it is confirmed, and a dirty
 * canvas is persisted first so the server re-seeds from the current draft.
 */
export interface EditorResizeSpec {
  id: number;
  gridSize: number;
  cells: CellMap;
  regions: DraftRegion[];
  itemsById: Map<number, Item>;
  dirty: boolean;
  saving: boolean;
  /** FIX-F01's single writer — a dirty canvas is saved before the resize. */
  persist: () => Promise<boolean>;
  resizeMutation: ReturnType<typeof useUpdateGridSize>;
}

export interface EditorResizeFlow {
  resizeOpen: boolean;
  setResizeOpen: (open: boolean) => void;
  resizeValue: number;
  setResizeValue: Dispatch<SetStateAction<number>>;
  /** True while either the save or the resize request is in flight. */
  resizePending: boolean;
  /** What the pending size would remove, as human-readable lines. */
  resizeImpact: { items: string[]; regions: string[] };
  confirmResize: () => void;
}

export function useEditorResize(spec: EditorResizeSpec): EditorResizeFlow {
  const { id, gridSize, cells, regions, itemsById, dirty, saving, persist, resizeMutation } = spec;
  const [resizeOpen, setResizeOpen] = useState(false);
  const [resizeValue, setResizeValue] = useState(gridSize);

  useEffect(() => {
    if (resizeOpen) setResizeValue(gridSize);
  }, [resizeOpen, gridSize]);

  const resizePending = saving || resizeMutation.isPending;

  const resizeImpact = useMemo(() => {
    if (!resizeOpen) {
      return { items: [] as string[], regions: [] as string[] };
    }
    const size = resizeValue;
    const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < size && y < size;
    const items: string[] = [];
    const seenObjects = new Set<string>();
    for (const [key, cell] of cells.entries()) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      if (cell.background && !inBounds(x, y)) {
        const item = itemsById.get(cell.background.itemId);
        items.push(`物品「${item?.name ?? `#${cell.background.itemId}`}」位于 C${x + 1},R${y + 1}`);
      }
      if (
        cell.object &&
        !(inBounds(x, y) && x + cell.object.w <= size && y + cell.object.h <= size)
      ) {
        if (!seenObjects.has(key)) {
          seenObjects.add(key);
          const item = itemsById.get(cell.object.itemId);
          items.push(
            `物品「${item?.name ?? `#${cell.object.itemId}`}」(${cell.object.w}×${cell.object.h}) 位于 C${x + 1},R${y + 1}`,
          );
        }
      }
    }
    const outOfBounds: string[] = [];
    for (const region of regions) {
      const count = region.cells.filter(([x, y]) => !inBounds(x, y)).length;
      if (count > 0) outOfBounds.push(`区域「${region.name}」部分格子越界（${count} 格）`);
    }
    return { items, regions: outOfBounds };
  }, [resizeOpen, resizeValue, cells, regions, itemsById]);

  const confirmResize = (): void => {
    const size = resizeValue;
    if (size === gridSize) {
      setResizeOpen(false);
      return;
    }
    void (async () => {
      try {
        if (dirty) await persist();
        const result = await resizeMutation.mutateAsync({ id, gridSize: size });
        const { background, object, regions: removedRegions } = result.removed;
        if (background + object + removedRegions > 0) {
          toast.message('画布已调整', {
            description: `已移除越界内容：背景 ${background}、物体 ${object}、区域 ${removedRegions}`,
          });
        } else {
          toast.success('画布已调整');
        }
        setResizeOpen(false);
      } catch {
        /* errors surfaced via mutation toasts; keep dialog open */
      }
    })();
  };

  return {
    resizeOpen,
    setResizeOpen,
    resizeValue,
    setResizeValue,
    resizePending,
    resizeImpact,
    confirmResize,
  };
}
