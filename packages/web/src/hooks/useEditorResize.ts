import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import type { DraftRegion, Asset } from '@loredoku/shared';
import type { CellMap } from '@/lib/highlight';
import type { useUpdateGridSize } from '@/hooks/useMapCanvas';

/** 地图编辑器的「调整画布尺寸」流程：确认前列出这次 resize 会删掉什么（越界物品 / 被裁区域）；dirty 画布先落盘，服务端才从当前草稿重算。 */
export interface EditorResizeSpec {
  id: number;
  gridSize: number;
  cells: CellMap;
  regions: DraftRegion[];
  assetsById: Map<number, Asset>;
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
  const { id, gridSize, cells, regions, assetsById, dirty, saving, persist, resizeMutation } = spec;
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
        const item = assetsById.get(cell.background.assetId);
        items.push(`物品「${item?.name ?? `#${cell.background.assetId}`}」位于 C${x + 1},R${y + 1}`);
      }
      // 背景修饰层恒占 1 格，越界时会被 resize 接口裁掉，提前报个数。
      if (cell.decoration && !inBounds(x, y)) {
        const item = assetsById.get(cell.decoration.assetId);
        items.push(`物品「${item?.name ?? `#${cell.decoration.assetId}`}」位于 C${x + 1},R${y + 1}`);
      }
      if (
        cell.item &&
        !(inBounds(x, y) && x + cell.item.w <= size && y + cell.item.h <= size)
      ) {
        if (!seenObjects.has(key)) {
          seenObjects.add(key);
          const item = assetsById.get(cell.item.assetId);
          items.push(
            `物品「${item?.name ?? `#${cell.item.assetId}`}」(${cell.item.w}×${cell.item.h}) 位于 C${x + 1},R${y + 1}`,
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
  }, [resizeOpen, resizeValue, cells, regions, assetsById]);

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
        const { background, item, decoration, regions: removedRegions } = result.removed;
        if (background + item + decoration + removedRegions > 0) {
          toast.message('画布已调整', {
            description: `已移除越界内容：背景 ${background}、背景修饰 ${decoration}、物品 ${item}、区域 ${removedRegions}`,
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
