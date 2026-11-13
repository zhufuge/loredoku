import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, type DraftRegion, type MapStyle } from '@loredoku/shared';
import { MapRegionLabelLayer } from './MapOverlayLayers';

/**
 * v0.9.6：区域标签的**位置偏移**（每块区域独立配置）。
 *
 * 这一层钉的是**几何行为**：同一块区域、同一个 `labelCell`，配上不同的偏移，标签
 * 落在不同的像素上。之所以不是「外观断言」—— 偏移的全部意义就是位置，位置错了这
 * 个功能就没有别的可验证的东西。
 *
 * 常量（格子 40px）是这一层自己的输入，不依赖真实排版：`labelCell = [1, 2]` 在
 * 40px 的格子上，标签锚点是 `x = (1 + 0.5) * 40 = 60`、`y = (2 + 1) * 40 - 2 = 118`。
 */

const CELL = 40;

function region(overrides: Partial<DraftRegion> = {}): DraftRegion {
  return {
    id: 'rg_a',
    name: '回廊',
    cells: [[1, 2]],
    labelCell: [1, 2],
    ...overrides,
  };
}

/** 读取标签按钮的 `left` / `top`（内联样式，字符串像素）。 */
function labelBox(): { left: number; top: number } | null {
  const node = document.querySelector<HTMLElement>('.region-label');
  if (!node) return null;
  return { left: parseFloat(node.style.left), top: parseFloat(node.style.top) };
}

describe('区域标签位置偏移（v0.9.6）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(regions: DraftRegion[], style: MapStyle = DEFAULT_MAP_STYLE): void {
    act(() => {
      root.render(<MapRegionLabelLayer regions={regions} cellSize={CELL} style={style} />);
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('没配偏移：标签停在「格子上沿居中」的锚点上', () => {
    render([region()]);
    expect(labelBox()).toEqual({ left: 60, top: 118 });
  });

  it('配了偏移：在锚点上按 x / y 平移', () => {
    render([region({ style: { label: { offset: { x: 12, y: -20 } } } })]);
    expect(labelBox()).toEqual({ left: 72, top: 98 });
  });

  it('偏移只作用于自己那块区域 —— 逐个独立配置', () => {
    render([
      region({ id: 'rg_a', cells: [[0, 0]], labelCell: [0, 0] }),
      region({
        id: 'rg_b',
        cells: [[3, 3]],
        labelCell: [3, 3],
        style: { label: { offset: { x: 8, y: 8 } } },
      }),
    ]);

    const boxes = Array.from(document.querySelectorAll<HTMLElement>('.region-label')).map((node) => ({
      left: parseFloat(node.style.left),
      top: parseFloat(node.style.top),
    }));
    // 第一块没有偏移；第二块在自己锚点（140 / 158）上偏了 8 / 8。
    expect(boxes).toEqual([
      { left: 20, top: 38 },
      { left: 148, top: 166 },
    ]);
  });

  it('只给一轴时另一轴不偏', () => {
    render([region({ style: { label: { offset: { y: 10 } } } })]);
    expect(labelBox()).toEqual({ left: 60, top: 128 });
  });
});

describe('区域标签点击（v0.10.7）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(regions: DraftRegion[], onSelect: (id: string) => void): void {
    act(() => {
      root.render(
        <MapRegionLabelLayer regions={regions} cellSize={CELL} style={DEFAULT_MAP_STYLE} onSelect={onSelect} />,
      );
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('点击区域标签回调 onSelect 传出区域 id', () => {
    const ids: string[] = [];
    render([region()], (id) => ids.push(id));
    act(() => {
      document.querySelector<HTMLElement>('.region-label')?.click();
    });
    expect(ids).toEqual(['rg_a']);
  });
});
