import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, type DraftRegion, type MapStyle } from '@loredoku/shared';
import { MapRegionOutlineLayer } from './MapRegionLayers';

/**
 * 区域轮廓线贴着画布边界时必须**整条**画出来。
 *
 * 描边以轮廓线为中心，落在 `x = 0` / `total` 上的边有一半在 SVG 视口外；
 * `<svg>` 默认 `overflow: hidden` 会把那一半裁掉，贴边的边只剩半条宽，看起来
 * 像多出来的一圈细线（画布外框一直用 `overflow: visible` 规避同一问题）。
 */

const STYLE: MapStyle = DEFAULT_MAP_STYLE;
const CELL = 10;

function region(cells: Array<[number, number]>): DraftRegion {
  return { id: 'rg_test', name: '区域', cells };
}

describe('MapRegionOutlineLayer — 贴边描边不被 SVG 视口裁掉', () => {
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

  function render(regions: DraftRegion[], gridSize = 4): SVGSVGElement {
    act(() => {
      root.render(
        <MapRegionOutlineLayer
          regions={regions}
          gridSize={gridSize}
          cellSize={CELL}
          style={STYLE}
        />,
      );
    });
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('outline svg not found');
    return svg;
  }

  it('lets the stroke bleed past the svg viewport', () => {
    const svg = render([region([[0, 0]])]);
    expect(svg.style.overflow).toBe('visible');
    expect(svg.getAttribute('overflow')).not.toBe('hidden');
  });

  it('draws the four edges of a corner cell, boundary edges included', () => {
    const svg = render([region([[0, 0]])]);
    const lines = [...svg.querySelectorAll('line')];
    expect(lines).toHaveLength(4);
    // Two edges sit on the board boundary — the ones whose half-width used to
    // be clipped away.
    const onBoundary = lines.filter((line) => {
      const xs = [Number(line.getAttribute('x1')), Number(line.getAttribute('x2'))];
      const ys = [Number(line.getAttribute('y1')), Number(line.getAttribute('y2'))];
      return xs.every((x) => x === 0) || ys.every((y) => y === 0);
    });
    expect(onBoundary).toHaveLength(2);
  });
});
