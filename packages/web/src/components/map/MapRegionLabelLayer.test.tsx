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
 *
 * v0.10.7：偏移量以 `BASE_CELL`（120px）为基准，渲染时乘 `cellSize / 120`。
 * 40px 的格子比例是 1/3，所以填 12px 实际挪 4px —— 这样开关标尺（`cellSize` 会变）
 * 时偏移量在格子上的占比恒定，标签不会漂。
 */

const CELL = 40;
/** 40 / 120 —— 这一层所有偏移量都要乘它。 */
const S = CELL / 120;

/** 偏移量按当前格子折算后的像素，测试里直接写这个比手算 1/3 清楚。 */
function at(basePx: number): number {
  return basePx * S;
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

  it('配了偏移：在锚点上按 x / y 平移（按基准格子折算）', () => {
    render([region({ style: { label: { offset: { x: 12, y: -20 } } } })]);
    // 12px / -20px 是 120px 基准格子上的数，40px 的格子乘 1/3。
    expect(labelBox()).toEqual({ left: 60 + at(12), top: 118 + at(-20) });
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
    // 第一块没有偏移；第二块在自己锚点（140 / 158）上偏了 8 / 8（折算后）。
    expect(boxes).toEqual([
      { left: 20, top: 38 },
      { left: 140 + at(8), top: 158 + at(8) },
    ]);
  });

  it('只给一轴时另一轴不偏', () => {
    render([region({ style: { label: { offset: { y: 10 } } } })]);
    expect(labelBox()).toEqual({ left: 60, top: 118 + at(10) });
  });

  it('格子变大变小时，偏移量在格子上的占比不变（v0.10.7 修开关标尺漂移）', () => {
    /*
     * 开关标尺会重算 `cellSize`。修之前偏移是裸像素，同一份草稿在两种 `cellSize`
     * 下占的格子比例不同 —— 实测 17155 的「穿廊」填 200：标尺开 1.695 格、关掉
     * 1.869 格。现在按 `cellSize / BASE_CELL` 缩放，两种 `cellSize` 下都是 200/120 格。
     */
    const regionWithOffset = region({ style: { label: { offset: { x: 200 } } } });

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
    expect((wide - 1.5 * 120) / 120).toBeCloseTo(200 / 120);
    expect((narrow - 1.5 * 60) / 60).toBeCloseTo(200 / 120);
  });

  it('底部行两格：标签落在两格接缝上，不再右偏半格（v0.10.7）', () => {
    /*
     * 17155 的「穿廊」：底部行是 [3,4] 与 [4,4]，`labelCell` 被算成 [4,4]。
     * 按「锚点格的格心」是 `(4 + 0.5) × 40 = 180`，但这一行跨 x 120–200，
     * 真正的中点是 160 —— 这里钉的就是后者。
     */
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

  /**
   * 从标签发起一次 `pointerdown`，看它有没有冒泡到 React 根之外。
   *
   * 监听必须挂在 `document.body` 上，不能挂在这个测试自己的根容器上 ——
   * React 把合成事件的监听器也挂在根容器那一层，同一节点上的原生监听器照样
   * 会触发（`stopPropagation()` 只截断后续节点）。真正代表「画布容器收到没有」
   * 的是「有没有继续往外冒」。
   */
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
