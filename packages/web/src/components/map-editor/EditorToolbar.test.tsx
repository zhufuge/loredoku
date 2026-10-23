import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorToolbar } from './EditorToolbar';

/**
 * v0.7.4 (docs/v0.7.4.md §3)：头部「预览」是**可选**动作 —— 地图编辑器传了才
 * 渲染，谜题编辑器与 fork 态都不传。
 */

describe('EditorToolbar — 预览按钮', () => {
  let container: HTMLDivElement;
  let root: Root;

  const noop = (): void => undefined;

  function render(props: { onPreview?: () => void } = {}): void {
    act(() => {
      root.render(
        <EditorToolbar
          mapName="午夜花园"
          dirty={false}
          saving={false}
          publishing={false}
          status="draft"
          currentVersionNo={1}
          mapInfoOpen={false}
          onBack={noop}
          onSave={noop}
          onOpenMapInfo={noop}
          onExport={noop}
          onImport={noop}
          {...props}
        />,
      );
    });
  }

  const previewButton = (): HTMLButtonElement | undefined =>
    [...container.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === '预览',
    ) as HTMLButtonElement | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('is not rendered when the host passes no handler', () => {
    render();
    expect(previewButton()).toBeUndefined();
  });

  it('runs the handler when clicked', () => {
    const onPreview = vi.fn();
    render({ onPreview });
    act(() => previewButton()?.click());
    expect(onPreview).toHaveBeenCalledTimes(1);
  });
});
