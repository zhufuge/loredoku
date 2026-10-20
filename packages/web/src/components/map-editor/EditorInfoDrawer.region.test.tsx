import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftRegion, MapStyle } from '@loredoku/shared';
import { EditorInfoDrawer } from './EditorInfoDrawer';
import { resolveMapStyle } from '@/lib/mapStyle';
import type { RegionInput } from '@/stores/editorStore';

/**
 * v0.7.0 (docs/v0.7.0.md §5): the region branch of the info drawer **is** the
 * region editor now — the old 「编辑」dialog (颜色 / 边界线宽 / 填充透明度) is
 * gone and the three style groups took its place.
 *
 * Two contracts matter here and neither is visible in the lib tests:
 * 1. the form seeds itself from the **map-level defaults**, so a region with no
 *    override shows the 「地图基本信息」 values;
 * 2. 保存 hands the **resolved** values to the store, which derives the minimal
 *    override — a field left at the default must not reach the region record.
 */

// React 18 的 act 需要这个开关，否则每次由 effect 触发的更新都会打印一条警告。
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setValue(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
}

/** Mirrors what a browser does: type, then leave the field. */
function typeInto(element: HTMLInputElement | null, value: string): void {
  if (!element) throw new Error('input not found');
  setValue(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

describe('EditorInfoDrawer — 区域信息框（v0.7.0）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const style: MapStyle = resolveMapStyle(undefined);
  /** 没有 override —— 每个字段都应回落到地图级缺省值。 */
  const plainRegion: DraftRegion = {
    id: 'forest',
    name: '森林区',
    cells: [
      [0, 0],
      [1, 0],
    ],
  };
  /** 只覆盖了轮廓线宽 —— 其余字段仍是缺省值。 */
  const styledRegion: DraftRegion = {
    ...plainRegion,
    id: 'cave',
    name: '洞穴区',
    style: { outline: { width: 8 } },
  };

  const onSubmitRegion = vi.fn();
  const onDeleteRegion = vi.fn();
  const onLocateRegion = vi.fn();
  const onRegionDirtyChange = vi.fn();

  function render(region: DraftRegion, readOnly = false): void {
    act(() => {
      root.render(
        <EditorInfoDrawer
          open
          onClose={vi.fn()}
          onOpen={vi.fn()}
          selection={{ type: 'region', regionId: region.id }}
          cells={new Map()}
          regions={[region]}
          assetsById={new Map()}
          style={style}
          onClearCell={vi.fn()}
          onClearItem={vi.fn()}
          onSubmitRegion={onSubmitRegion}
          onDeleteRegion={onDeleteRegion}
          onLocateRegion={onLocateRegion}
          onRegionDirtyChange={onRegionDirtyChange}
          readOnly={readOnly}
        />,
      );
    });
  }

  const input = (id: string): HTMLInputElement =>
    container.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
  const buttons = (): HTMLButtonElement[] =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button'));

  beforeEach(() => {
    onSubmitRegion.mockClear();
    onDeleteRegion.mockClear();
    onLocateRegion.mockClear();
    onRegionDirtyChange.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('seeds every field from the map-level defaults', () => {
    render(plainRegion);
    expect(input('region-info-name').value).toBe('森林区');
    expect(input('region-info-id').value).toBe('forest');
    expect(input('region-info-outline-width').value).toBe(String(style.regionOutline.width));
    expect(input('region-info-outline-color').value).toBe(style.regionOutline.color);
    expect(input('region-info-highlight-width').value).toBe(String(style.regionHighlight.width));
    expect(input('region-info-label-font-size').value).toBe(String(style.regionLabel.fontSize));
    expect(input('region-info-label-hover-stroke-width').value).toBe(
      String(style.regionLabel.hoverStrokeWidth),
    );
  });

  it('shows the region own override where it has one', () => {
    render(styledRegion);
    expect(input('region-info-outline-width').value).toBe('8');
    // 没有覆盖的字段依旧是缺省值。
    expect(input('region-info-label-font-size').value).toBe(String(style.regionLabel.fontSize));
  });

  it('保存 stays disabled until something changes', () => {
    render(plainRegion);
    const save = buttons().find((button) => button.textContent === '保存');
    expect(save?.disabled).toBe(true);
    expect(onRegionDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('保存 submits the resolved style — the store derives the override', () => {
    render(plainRegion);
    act(() => typeInto(input('region-info-outline-width'), '9'));
    act(() => typeInto(input('region-info-label-color'), '#123456'));
    const save = buttons().find((button) => button.textContent === '保存');
    expect(save?.disabled).toBe(false);
    expect(onRegionDirtyChange).toHaveBeenLastCalledWith(true);
    act(() => save?.click());
    expect(onSubmitRegion).toHaveBeenCalledTimes(1);
    const [regionId, submitted] = onSubmitRegion.mock.calls[0] as [string, RegionInput];
    expect(regionId).toBe('forest');
    expect(submitted.name).toBe('森林区');
    expect(submitted.cells).toEqual(plainRegion.cells);
    expect(submitted.style?.outline.width).toBe(9);
    expect(submitted.style?.label.color).toBe('#123456');
    // 未改动的字段仍以缺省值提交 —— 由 store 决定记不记。
    expect(submitted.style?.outline.color).toBe(style.regionOutline.color);
  });

  it('rejects an empty name and a duplicated id', () => {
    render(plainRegion);
    act(() => typeInto(input('region-info-name'), '  '));
    act(() => {
      buttons()
        .find((button) => button.textContent === '保存')
        ?.click();
    });
    expect(onSubmitRegion).not.toHaveBeenCalled();
    expect(container.textContent).toContain('请填写区域名称');

    act(() => typeInto(input('region-info-name'), '新名字'));
    // `forest` 已存在于 regions 里（就是当前区域自己），换成已存在的写法应被拒。
    act(() => typeInto(input('region-info-id'), 'forest '));
    act(() => {
      buttons()
        .find((button) => button.textContent === '保存')
        ?.click();
    });
    expect(onSubmitRegion).toHaveBeenCalledTimes(1);
  });

  it('re-seeds from the committed region after a save', () => {
    render(plainRegion);
    act(() => typeInto(input('region-info-outline-width'), '9'));
    act(() => {
      buttons()
        .find((button) => button.textContent === '保存')
        ?.click();
    });
    expect(onSubmitRegion).toHaveBeenCalledTimes(1);
    // 父组件把提交结果写回 store 后重新渲染：表单回到干净状态。
    const committed: DraftRegion = { ...plainRegion, style: { outline: { width: 9 } } };
    act(() => {
      root.render(
        <EditorInfoDrawer
          open
          onClose={vi.fn()}
          onOpen={vi.fn()}
          selection={{ type: 'region', regionId: committed.id }}
          cells={new Map()}
          regions={[committed]}
          assetsById={new Map()}
          style={style}
          onClearCell={vi.fn()}
          onClearItem={vi.fn()}
          onSubmitRegion={onSubmitRegion}
          onDeleteRegion={onDeleteRegion}
          onLocateRegion={onLocateRegion}
          onRegionDirtyChange={onRegionDirtyChange}
        />,
      );
    });
    expect(
      buttons()
        .find((button) => button.textContent === '保存')
        ?.disabled,
    ).toBe(true);
    expect(onRegionDirtyChange).toHaveBeenLastCalledWith(false);
    expect(input('region-info-outline-width').value).toBe('9');
  });

  it('a cell edit does not drop the style draft in progress', () => {
    render(plainRegion);
    act(() => typeInto(input('region-info-outline-width'), '9'));
    expect(onRegionDirtyChange).toHaveBeenLastCalledWith(true);
    // 同一区域又抹了几格（shift+click 进选区）：style / name / id 都没变，
    // 表单不该被重播种——正在填的线宽得留着。
    const grown: DraftRegion = { ...plainRegion, cells: [...plainRegion.cells, [2, 0]] };
    render(grown);
    expect(input('region-info-outline-width').value).toBe('9');
    expect(onRegionDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('定位 / 删除 keep working from the same box', () => {
    render(plainRegion);
    act(() => {
      buttons()
        .find((button) => button.textContent === '定位')
        ?.click();
    });
    expect(onLocateRegion).toHaveBeenCalledTimes(1);
    act(() => {
      buttons()
        .find((button) => button.textContent === '删除')
        ?.click();
    });
    expect(onDeleteRegion).toHaveBeenCalledTimes(1);
  });

  it('SPEC-K06: read-only mode shows a summary and no inputs', () => {
    render(styledRegion, true);
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.textContent).toContain('洞穴区');
    // 摘要读的是**解析后**的值：覆盖 8，不是地图级缺省。
    expect(container.textContent).toContain('8');
    // 只有抽屉自己的关闭按钮，没有 保存 / 定位 / 删除。
    for (const label of ['保存', '定位', '删除']) {
      expect(
        buttons().some((button) => button.textContent === label),
        label,
      ).toBe(false);
    }
  });
});
