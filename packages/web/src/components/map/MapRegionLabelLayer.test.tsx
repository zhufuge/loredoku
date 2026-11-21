import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, type DraftRegion, type MapStyle } from '@loredoku/shared';
import { MapRegionLabelLayer } from './MapOverlayLayers';

/** 区域标签的位置偏移，单位是**格的百分比**（100 = 一格）—— 开关标尺改 `cellSize` 时标签不漂。 */

const CELL = 40;

/** 百分比 → 这一层里的像素。`100%` = 一格。 */
function pct(percent: number): number {
  return (percent / 100) * CELL;
}

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

  it('配了偏移：在锚点上按 x / y 平移（按格的百分比）', () => {
    render([region({ style: { label: { offset: { x: 25, y: -50 } } } })]);
    // 25% / -50% 在 40px 的格子上是 10px / -20px。
    expect(labelBox()).toEqual({ left: 60 + pct(25), top: 118 + pct(-50) });
  });

  it('偏移只作用于自己那块区域 —— 逐个独立配置', () => {
    render([
      region({ id: 'rg_a', cells: [[0, 0]], labelCell: [0, 0] }),
      region({
        id: 'rg_b',
        cells: [[3, 3]],
        labelCell: [3, 3],
        style: { label: { offset: { x: 20, y: 20 } } },
      }),
    ]);

    const boxes = Array.from(document.querySelectorAll<HTMLElement>('.region-label')).map((node) => ({
      left: parseFloat(node.style.left),
      top: parseFloat(node.style.top),
    }));
    // 第一块没有偏移；第二块在自己锚点（140 / 158）上偏了 20% / 20%（= 8px）。
    expect(boxes).toEqual([
      { left: 20, top: 38 },
      { left: 140 + pct(20), top: 158 + pct(20) },
    ]);
  });

  it('只给一轴时另一轴不偏', () => {
    render([region({ style: { label: { offset: { y: 25 } } } })]);
    expect(labelBox()).toEqual({ left: 60, top: 118 + pct(25) });
  });

  it('格子变大变小时，偏移量在格子上的占比不变（v0.10.7 修开关标尺漂移）', () => {
    /* 修前偏移是裸像素，同一份草稿在两种 `cellSize` 下占的格子比例不同；现在单位就是格子。 */
    const regionWithOffset = region({ style: { label: { offset: { x: 125 } } } });

    act(() => {
      root.render(<MapRegionLabelLayer regions={[regionWithOffset]} cellSize={120} style={DEFAULT_MAP_STYLE} />);
    });
    const wide = parseFloat(document.querySelector<HTMLElement>('.region-label')!.style.left);

    act(() => {
      root.render(<MapRegionLabelLayer regions={[regionWithOffset]} cellSize={60} style={DEFAULT_MAP_STYLE} />);
    });
    const narrow = parseFloat(document.querySelector<HTMLElement>('.region-label')!.style.left);

    // 锚点是 `centerX = 1.5` 个格子（cells 只有 [1,2]），偏移量在两种 `cellSize`
    // 下除以各自的格子宽度后必须相等。
    expect((wide - 1.5 * 120) / 120).toBeCloseTo(1.25);
    expect((narrow - 1.5 * 60) / 60).toBeCloseTo(1.25);
  });

  it('底部行两格：标签落在两格接缝上，不再右偏半格（v0.10.7）', () => {
    /* 按锚点格格心是 180，但本行跨 x 120–200，真中点是 160 —— 这里钉的是后者。 */
    render([
      region({
        cells: [
          [3, 4],
          [4, 4],
        ],
        labelCell: [4, 4],
      }),
    ]);
    expect(labelBox()).toEqual({ left: 160, top: 198 });
  });

  it('底部行三格：中点仍是原来那个「中间格 + 半格」（v0.10.7 不改奇数行）', () => {
    render([
      region({
        cells: [
          [0, 4],
          [1, 4],
          [2, 4],
        ],
        labelCell: [1, 4],
      }),
    ]);
    expect(labelBox()?.left).toBe(60);
  });
});

describe('区域标签吃掉按下（v0.10.7）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(props: { onSelect?: (id: string) => void }): void {
    act(() => {
      root.render(
        <MapRegionLabelLayer
          regions={[region()]}
          cellSize={CELL}
          style={DEFAULT_MAP_STYLE}
          onSelect={props.onSelect}
        />,
      );
    });
  }

  /** 监听必须挂 `document.body`：React 合成事件监听也在根容器那层，同节点测不出「有没有继续往外冒」。 */
  function pointerDownBubbled(): boolean {
    let bubbled = false;
    const stop = (): void => {
      bubbled = true;
    };
    document.body.addEventListener('pointerdown', stop);
    act(() => {
      document
        .querySelector<HTMLElement>('.region-label')
        ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    });
    document.body.removeEventListener('pointerdown', stop);
    return bubbled;
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

  it('地图编辑（传了 onSelect）里按下被拦下，不会连底板一起选中', () => {
    render({ onSelect: () => {} });
    expect(pointerDownBubbled()).toBe(false);
  });

  it('游戏页 / 谜题预览（没传 onSelect）里按下照常冒泡，仍按底下那一格落点', () => {
    render({});
    expect(pointerDownBubbled()).toBe(true);
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

  it('点击区域标签回调 onSelect 传出区域 id（click 不被冒泡阻止）', () => {
    const ids: string[] = [];
    render([region()], (id) => ids.push(id));
    act(() => {
      document.querySelector<HTMLElement>('.region-label')?.click();
    });
    expect(ids).toEqual(['rg_a']);
  });
});

describe('区域标签的点击按页面分流（v0.10.8）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(onSelect?: (id: string) => void): void {
    act(() => {
      root.render(
        <MapRegionLabelLayer
          regions={[region()]}
          cellSize={CELL}
          style={DEFAULT_MAP_STYLE}
          onSelect={onSelect}
        />,
      );
    });
  }

  /** 同上：只有挂 `document.body` 才测得出 `click` 有没有继续往外冒。 */
  function clickBubbled(): boolean {
    let bubbled = false;
    const stop = (): void => {
      bubbled = true;
    };
    document.body.addEventListener('click', stop);
    act(() => {
      document.querySelector<HTMLElement>('.region-label')?.click();
    });
    document.body.removeEventListener('click', stop);
    return bubbled;
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

  it('没传 onSelect（谜题编辑 / 游戏 / 预览）时 click 照常冒泡，等于点底下那一格', () => {
    render();
    expect(clickBubbled()).toBe(true);
  });

  it('传了 onSelect（地图编辑）时 click 被拦下，只选区域', () => {
    render(() => {});
    expect(clickBubbled()).toBe(false);
  });
});

/** 断言「悬停」与「联动高亮」两种触发等价，不钉颜色值 —— 将来改配色不必改用例。 */
describe('区域标签跟着联动高亮一起亮（v0.11.4）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(props: {
    regions?: DraftRegion[];
    hoveredRegionId?: string | null;
    highlightedRegionIds?: readonly string[];
  }): void {
    act(() => {
      root.render(
        <MapRegionLabelLayer
          regions={props.regions ?? [region()]}
          cellSize={CELL}
          style={DEFAULT_MAP_STYLE}
          hoveredRegionId={props.hoveredRegionId ?? null}
          highlightedRegionIds={props.highlightedRegionIds}
        />,
      );
    });
  }

  function looks(): string[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.region-label')).map(
      (node) => node.getAttribute('style') ?? '',
    );
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

  it('被联动高亮命中时，标题与「鼠标停在它上面」一模一样', () => {
    render({});
    const plain = looks()[0];

    render({ hoveredRegionId: 'rg_a' });
    const hovered = looks()[0];
    expect(hovered).not.toBe(plain);

    render({ highlightedRegionIds: ['rg_a'] });
    expect(looks()[0]).toBe(hovered);
  });

  it('只亮清单里的那块区域，没命中的保持原样', () => {
    const regions = [
      region({ id: 'rg_a', cells: [[0, 0]], labelCell: [0, 0] }),
      region({ id: 'rg_b', cells: [[3, 3]], labelCell: [3, 3] }),
    ];
    render({ regions });
    const plain = looks();

    render({ regions, highlightedRegionIds: ['rg_b'] });
    const lit = looks();
    expect(lit[0]).toBe(plain[0]);
    expect(lit[1]).not.toBe(plain[1]);
  });
});
