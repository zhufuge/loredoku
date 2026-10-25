import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, AssetVariant, DraftCell, MapStyle } from '@loredoku/shared';
import { EditorInfoDrawer } from './EditorInfoDrawer';
import { resolveMapStyle } from '@/lib/mapStyle';

/**
 * v0.7.5 (docs/v0.7.5.md §6): 已放置物品的展示变换在**格子信息框**里配。
 *
 * 三条约定：
 * 1. 控件显示的是解析后的值（缺省 100% / 0 / 0），提交的是补丁，store 负责夹边界；
 * 2. 停在脚位里的**任意一格**都能编辑到锚点上的那个物品（2×2 的中间那格也是合法选中）；
 * 3. 只读环境（谜题编辑器）不给控件，只在有变换时显示一行摘要。
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setValue(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
}

function typeInto(element: HTMLInputElement | null, value: string): void {
  if (!element) throw new Error('input not found');
  setValue(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

function variant(id: number, overrides: Partial<AssetVariant> = {}): AssetVariant {
  return {
    id,
    assetId: id,
    name: `形态${id}`,
    sortOrder: 0,
    fitMode: 'cover',
    imagePath: null,
    imageUrl: null,
    imageThumbUrl: null,
    bgColor: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const tree: Asset = {
  id: 5,
  code: 'tree',
  name: '古树',
  type: 'item',
  blocking: true,
  isActive: true,
  variants: [variant(50, { assetId: 5, bgColor: '#336633' })],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const assetsById = new Map<number, Asset>([[5, tree]]);
const style: MapStyle = resolveMapStyle(undefined);

describe('EditorInfoDrawer — 物品展示变换（v0.7.5）', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onItemTransform = vi.fn();

  function render(options: {
    cells: Map<string, DraftCell>;
    x: number;
    y: number;
    readOnly?: boolean;
  }): void {
    act(() => {
      root.render(
        <EditorInfoDrawer
          open
          onClose={vi.fn()}
          onOpen={vi.fn()}
          selection={{ type: 'cell', x: options.x, y: options.y }}
          cells={options.cells}
          regions={[]}
          assetsById={assetsById}
          style={style}
          onClearCell={vi.fn()}
          onClearItem={vi.fn()}
          onItemTransform={onItemTransform}
          onSubmitRegion={vi.fn()}
          onDeleteRegion={vi.fn()}
          readOnly={options.readOnly}
        />,
      );
    });
  }

  const input = (id: string): HTMLInputElement | null =>
    container.querySelector<HTMLInputElement>(`#${id}`);
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (item) => item.textContent === label,
    );

  /** 1×1 物品，带 150% 与 (0.25, -1) 的变换。 */
  const transformed = (): Map<string, DraftCell> =>
    new Map([
      [
        '1,1',
        { item: { assetId: 5, w: 1, h: 1, scale: 1.5, offsetX: 0.25, offsetY: -1 } },
      ],
    ]);

  beforeEach(() => {
    onItemTransform.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the resolved transform with the defaults filled in', () => {
    render({ cells: new Map([['0,0', { item: { assetId: 5, w: 1, h: 1 } }]]), x: 0, y: 0 });
    expect(input('cell-item-scale')?.value).toBe('100');
    expect(input('cell-item-offset-x')?.value).toBe('0');
    expect(input('cell-item-offset-y')?.value).toBe('0');
    // 恒等变换时不显示「复位」——没东西可复位。
    expect(button('复位')).toBeUndefined();
  });

  it('submits a patch in transformed units', () => {
    render({ cells: transformed(), x: 1, y: 1 });
    expect(input('cell-item-scale')?.value).toBe('150');
    typeInto(input('cell-item-scale'), '200');
    expect(onItemTransform).toHaveBeenLastCalledWith(1, 1, { scale: 2 });
    typeInto(input('cell-item-offset-x'), '-0.5');
    expect(onItemTransform).toHaveBeenLastCalledWith(1, 1, { offsetX: -0.5 });
  });

  it('resets back to identity', () => {
    render({ cells: transformed(), x: 1, y: 1 });
    act(() => button('复位')?.click());
    expect(onItemTransform).toHaveBeenCalledWith(1, 1, { scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('edits the anchor item even when the selected cell is a footprint placeholder', () => {
    // 2×2 物品：只有锚点带 item，其余三格是空占位。
    const cells: Map<string, DraftCell> = new Map([
      ['0,0', { item: { assetId: 5, w: 2, h: 2, scale: 2 } }],
      ['1,0', {}],
      ['0,1', {}],
      ['1,1', {}],
    ]);
    render({ cells, x: 1, y: 1 });
    expect(container.textContent).toContain('古树');
    expect(input('cell-item-scale')?.value).toBe('200');
    typeInto(input('cell-item-scale'), '100');
    // 仍然把补丁交给当前格 —— store 会自己解析到 (0,0) 的锚点。
    expect(onItemTransform).toHaveBeenLastCalledWith(1, 1, { scale: 1 });
  });

  it('shows a read-only summary instead of controls', () => {
    render({ cells: transformed(), x: 1, y: 1, readOnly: true });
    expect(input('cell-item-scale')).toBeNull();
    expect(container.textContent).toContain('展示 150%');
    expect(container.textContent).toContain('0.25');
  });
});
