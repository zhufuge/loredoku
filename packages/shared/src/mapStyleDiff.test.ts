import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE, type MapStyle } from './constants';
import { MAP_STYLE_DIFF_GROUPS, diffMapStyle } from './mapStyleDiff';

/**
 * v0.8.0 §16.8：差异弹窗只列**不同的项**。这个文件钉三件事：
 *
 * 1. 完全相同时返回空（弹窗据此把状态写成「与主题风格一致」）；
 * 2. 每一项差异都带分组与中文标签（作者看的不是字段路径）；
 * 3. 值按屏幕上的写法格式化（`1.5px` / `自适应`），而不是原始数字。
 */

function style(patch: (style: MapStyle) => MapStyle): MapStyle {
  return patch(structuredClone(DEFAULT_MAP_STYLE));
}

describe('diffMapStyle', () => {
  it('两张风格完全相同时没有差异', () => {
    expect(diffMapStyle(DEFAULT_MAP_STYLE, DEFAULT_MAP_STYLE)).toEqual([]);
  });

  it('主题还没设风格时返回空 —— 「差几项」那时是个无意义的问题', () => {
    expect(diffMapStyle(DEFAULT_MAP_STYLE, undefined)).toEqual([]);
    expect(diffMapStyle(undefined, DEFAULT_MAP_STYLE)).toEqual([]);
  });

  it('只列不同的项，并带上分组与中文标签', () => {
    const theme = style((current) => ({
      ...current,
      gridSeparator: { ...current.gridSeparator, width: 2 },
      regionLabel: { ...current.regionLabel, color: '#ff0000' },
    }));

    expect(diffMapStyle(DEFAULT_MAP_STYLE, theme)).toEqual([
      {
        group: '网格',
        key: 'gridSeparator.width',
        label: '网格分隔线线宽',
        mapValue: `${DEFAULT_MAP_STYLE.gridSeparator.width}px`,
        themeValue: '2px',
      },
      {
        group: '标签',
        key: 'regionLabel.color',
        label: '标签颜色',
        mapValue: DEFAULT_MAP_STYLE.regionLabel.color,
        themeValue: '#ff0000',
      },
    ]);
  });

  it('数字带 px、null 的方格大小写成「自适应」', () => {
    const theme = style((current) => ({ ...current, cellSize: 48 }));
    expect(diffMapStyle(DEFAULT_MAP_STYLE, theme)).toEqual([
      {
        group: '网格',
        key: 'cellSize',
        label: '方格大小',
        mapValue: '自适应',
        themeValue: '48px',
      },
    ]);
  });

  it('顺序固定：先网格、再边框、再标签、最后光标', () => {
    const theme = style((current) => ({
      ...current,
      operationCursorBox: { ...current.operationCursorBox, offset: 9 },
      ruler: { ...current.ruler, gap: 8 },
      canvasFrame: { ...current.canvasFrame, color: '#123456' },
      gridSeparator: { ...current.gridSeparator, color: '#654321' },
    }));

    const groups = diffMapStyle(DEFAULT_MAP_STYLE, theme).map((entry) => entry.group);
    expect(groups).toEqual(['网格', '边框', '标签', '光标']);
    // 只出现字段表里的组，且顺序与 `MAP_STYLE_DIFF_GROUPS` 一致。
    expect(groups).toEqual(MAP_STYLE_DIFF_GROUPS.filter((group) => groups.includes(group)));
  });

  it('值格式化不做隐式取整 —— 0.5px 的线宽要原样显示', () => {
    const theme = style((current) => ({
      ...current,
      regionHighlight: { ...current.regionHighlight, width: 0.5 },
    }));
    expect(diffMapStyle(DEFAULT_MAP_STYLE, theme)[0]?.themeValue).toBe('0.5px');
  });
});
