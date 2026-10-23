import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, REGION_BORDER_WIDTH_MAX, REGION_BORDER_WIDTH_MIN } from '@loredoku/shared';
import type { MapStyle, RegionStyle, RegionStyleOverride } from '@loredoku/shared';
import { regionStyleEquals, regionStyleOverride, resolveRegionStyle } from './regionStyle';

/**
 * v0.7.0 (docs/v0.7.0.md §4) — the region style merge. The map-level block is
 * the default; a region records only the differences.
 */

/** A map style whose region defaults differ from the shipped ones. */
function baseStyle(): MapStyle {
  return {
    ...DEFAULT_MAP_STYLE,
    regionOutline: { width: 8, color: '#111111' },
    regionHighlight: { width: 5, color: '#3B82F6' },
    regionLabel: { ...DEFAULT_MAP_STYLE.regionLabel, fontSize: 20, hoverFontSize: 24 },
  };
}

describe('resolveRegionStyle', () => {
  it('falls back to the map-level defaults with no override', () => {
    const base = baseStyle();
    const resolved = resolveRegionStyle(base);
    expect(resolved.outline).toEqual({ width: 8, color: '#111111' });
    expect(resolved.highlight).toEqual({ width: 5, color: '#3B82F6' });
    expect(resolved.label.fontSize).toBe(20);
    expect(resolved.label.hoverFontSize).toBe(24);
    expect(resolved.label.color).toBe(DEFAULT_MAP_STYLE.regionLabel.color);
  });

  it('lets the region override win, field by field', () => {
    const resolved = resolveRegionStyle(baseStyle(), {
      outline: { width: 4 },
      label: { color: '#FF0000', hoverStrokeWidth: 2 },
    });
    expect(resolved.outline).toEqual({ width: 4, color: '#111111' });
    expect(resolved.highlight).toEqual({ width: 5, color: '#3B82F6' });
    expect(resolved.label.color).toBe('#FF0000');
    expect(resolved.label.hoverStrokeWidth).toBe(2);
    // Untouched label fields still come from the map defaults.
    expect(resolved.label.fontSize).toBe(20);
  });

  it('clamps out-of-range numbers and drops malformed colours', () => {
    const resolved = resolveRegionStyle(baseStyle(), {
      outline: { width: 99, color: 'red' },
      highlight: { width: 0 },
      label: { fontSize: 999, strokeWidth: 99, strokeColor: '#zzzzzz' },
    });
    expect(resolved.outline.width).toBe(REGION_BORDER_WIDTH_MAX);
    expect(resolved.outline.color).toBe('#111111');
    expect(resolved.highlight.width).toBe(1);
    expect(resolved.label.fontSize).toBe(48);
    expect(resolved.label.strokeWidth).toBe(12);
    expect(resolved.label.strokeColor).toBe(DEFAULT_MAP_STYLE.regionLabel.strokeColor);
  });

  it('keeps the outline inside its own 1 ~ 12 range', () => {
    // v0.7.4：下限 4 → 1，细到 1px 的轮廓也允许。
    expect(resolveRegionStyle(baseStyle(), { outline: { width: 0 } }).outline.width).toBe(
      REGION_BORDER_WIDTH_MIN,
    );
    expect(resolveRegionStyle(baseStyle(), { outline: { width: 4.4 } }).outline.width).toBe(4);
  });

  it('never renders a hovered label smaller than the idle one', () => {
    // The region grows its own label past the map-level hover size.
    const resolved = resolveRegionStyle(baseStyle(), { label: { fontSize: 40 } });
    expect(resolved.label.fontSize).toBe(40);
    expect(resolved.label.hoverFontSize).toBe(40);
  });

  it('resolves the label typeface: map default, then the region override', () => {
    expect(resolveRegionStyle(baseStyle()).label.fontFamily).toBe(
      DEFAULT_MAP_STYLE.regionLabel.fontFamily,
    );
    expect(
      resolveRegionStyle(baseStyle(), { label: { fontFamily: 'serif' } }).label.fontFamily,
    ).toBe('serif');
    // 本构建没带的字体名照原样留着 —— 渲染时按回退链找，不能悄悄换成地图级。
    expect(
      resolveRegionStyle(baseStyle(), { label: { fontFamily: 'WenKai' } }).label.fontFamily,
    ).toBe('WenKai');
    // 拼不进 CSS 的名字（手改的 JSON）回落到**地图级**的值，而不是出厂默认。
    expect(
      resolveRegionStyle(baseStyle(), {
        label: { fontFamily: 'a;b' as never },
      }).label.fontFamily,
    ).toBe(DEFAULT_MAP_STYLE.regionLabel.fontFamily);
  });

  it('tolerates a null override', () => {
    expect(regionStyleEquals(resolveRegionStyle(baseStyle(), null), resolveRegionStyle(baseStyle()))).toBe(
      true,
    );
  });
});

describe('regionStyleOverride', () => {
  it('records nothing when everything equals the map defaults', () => {
    const base = baseStyle();
    expect(regionStyleOverride(resolveRegionStyle(base), base)).toBeUndefined();
  });

  it('records only the differing fields', () => {
    const base = baseStyle();
    const resolved = resolveRegionStyle(base, {
      outline: { width: 6 },
      label: { hoverColor: '#00FF00' },
    });
    expect(regionStyleOverride(resolved, base)).toEqual({
      outline: { width: 6 },
      label: { hoverColor: '#00FF00' },
    });
  });

  it('records the typeface only when the region differs from the map default', () => {
    const base = baseStyle();
    expect(
      regionStyleOverride(resolveRegionStyle(base, { label: { fontFamily: 'mono' } }), base)
        ?.label?.fontFamily,
    ).toBe('mono');
    expect(
      regionStyleOverride(
        resolveRegionStyle(base, {
          label: { fontFamily: base.regionLabel.fontFamily },
        }),
        base,
      ),
    ).toBeUndefined();
  });

  it('round-trips: override → resolve → override', () => {
    const base = baseStyle();
    const override: RegionStyleOverride = {
      outline: { width: 10, color: '#123456' },
      highlight: { color: '#0B7E74' },
      // 22 stays under the map-level hover size (24), so the "never smaller"
      // rule does not lift it and the round trip is exact.
      label: { fontSize: 22, strokeWidth: 3, hoverStrokeWidth: 1 },
    };
    const resolved: RegionStyle = resolveRegionStyle(base, override);
    expect(regionStyleOverride(resolved, base)).toEqual(override);
  });
});
