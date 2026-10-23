import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BASE_CELL,
  DEFAULT_MAP_STYLE,
  fontFamilyStack,
  type DraftRegion,
  type MapStyle,
} from '@loredoku/shared';
import { MapRegionLabelLayer } from './MapOverlayLayers';

/**
 * v0.7.4 (docs/v0.7.4.md §2)：区域标签必须读**区域解析后**的样式。
 *
 * v0.7.0 把标签做成三级（地图级缺省 + 区域覆盖），但这一层一直只读地图级那一段
 * —— 区域自己设的字号 / 颜色 / 字族在画布上完全不生效。新加的 `fontFamily` 也
 * 只有走解析后的值才有意义，所以这两件事一起钉住。
 */

const STYLE: MapStyle = DEFAULT_MAP_STYLE;
/** `BASE_CELL` → `cellScale = 1`，字号断言可以直接比字面值。 */
const CELL = BASE_CELL;

const plain: DraftRegion = { id: 'rg_plain', name: '广场', cells: [[0, 0]] };
const custom: DraftRegion = {
  id: 'rg_custom',
  name: '密林',
  cells: [[1, 1]],
  style: { label: { fontFamily: 'serif', fontSize: 20, color: '#112233' } },
};

describe('MapRegionLabelLayer — 区域标签按区域解析样式', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(regions: DraftRegion[], hoveredRegionId: string | null = null): void {
    act(() => {
      root.render(
        <MapRegionLabelLayer
          regions={regions}
          cellSize={CELL}
          style={STYLE}
          hoveredRegionId={hoveredRegionId}
        />,
      );
    });
  }

  function labelOf(name: string): HTMLButtonElement {
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === name,
    );
    if (!button) throw new Error(`label for ${name} not found`);
    return button;
  }

  it('applies the label typeface as a font stack, per region', () => {
    render([plain, custom]);
    expect(labelOf('密林').style.fontFamily).toBe(fontFamilyStack('serif'));
    expect(labelOf('广场').style.fontFamily).toBe(fontFamilyStack('system'));
  });

  it('applies the region own font size and colour', () => {
    render([plain, custom]);
    expect(labelOf('密林').style.fontSize).toBe('20px');
    expect(labelOf('密林').style.color).toBe('rgb(17, 34, 51)');
    expect(labelOf('广场').style.fontSize).toBe(`${STYLE.regionLabel.fontSize}px`);
  });

  it('switches to the hover pair when the region is hovered', () => {
    render([custom], 'rg_custom');
    expect(labelOf('密林').style.fontSize).toBe(
      `${STYLE.regionLabel.hoverFontSize}px`,
    );
  });
});
