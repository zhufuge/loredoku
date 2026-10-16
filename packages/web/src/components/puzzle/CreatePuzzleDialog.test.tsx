import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedMapVersion } from '@loredoku/shared';
import { CreatePuzzleDialog } from './CreatePuzzleDialog';

/**
 * FEAT-K03 (docs/v0.5.0.md §2.4): the 「新建谜题」 dialog.
 *
 * The picker must list **published** map versions and nothing else — that is
 * the whole requirement ("只能选已发布的地图，带版本"), so both the "no
 * published version at all" state and the "n×n is pinned" confirmation are
 * asserted here.
 *
 * Radix portals the panel to `document.body`, so every query goes through
 * `document` (same convention as `ThemeColorDialog.test.tsx`).
 */

const versionsRef: { data: PublishedMapVersion[]; isLoading: boolean } = {
  data: [],
  isLoading: false,
};
const createMutate = vi.fn();

vi.mock('@/hooks/useMaps', () => ({
  usePublishedVersions: () => versionsRef,
}));

vi.mock('@/hooks/usePuzzles', () => ({
  useCreatePuzzle: (onSuccess?: (id: number) => void) => ({
    mutate: (payload: unknown) => {
      createMutate(payload);
      onSuccess?.(1);
    },
    isPending: false,
  }),
}));

const published: PublishedMapVersion[] = [
  {
    projectId: 217,
    rootId: 217,
    versionNo: 3,
    mapName: '古堡之谜',
    gridSize: 6,
    publishedAt: '2026-10-01T09:30:00.000Z',
    notes: null,
  },
  {
    projectId: 219,
    rootId: 219,
    versionNo: 1,
    mapName: '午夜花园',
    gridSize: 8,
    publishedAt: '2026-10-02T09:30:00.000Z',
    notes: '首发',
  },
];

describe('CreatePuzzleDialog (FEAT-K03)', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(initialEntry = '/'): void {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <CreatePuzzleDialog open onOpenChange={() => {}} />
        </MemoryRouter>,
      );
    });
  }

  beforeEach(() => {
    createMutate.mockClear();
    versionsRef.data = published;
    versionsRef.isLoading = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const text = (): string => document.body.textContent ?? '';

  const field = (id: string): HTMLInputElement | HTMLTextAreaElement =>
    document.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;

  const setValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value',
    )?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const submit = (): HTMLButtonElement =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === '创建',
    ) as HTMLButtonElement;

  it('lists only the published map versions, each with its version badge', () => {
    render();
    expect(text()).toContain('古堡之谜');
    expect(text()).toContain('v3');
    expect(text()).toContain('午夜花园');
    expect(text()).toContain('v1');
  });

  it('SPEC-K07: picking a version pins the canvas size', () => {
    render();
    expect(text()).not.toContain('创建后不可修改');
    const option = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('古堡之谜'),
    )!;
    act(() => option.click());
    expect(text()).toContain('6×6');
    expect(text()).toContain('创建后不可修改');
  });

  it('the description is a field of the dialog ("新增描述字段")', () => {
    render();
    expect(field('create-puzzle-description')).not.toBeNull();
  });

  it('submitting without a version is refused', () => {
    render();
    act(() => setValue(field('create-puzzle-name'), '午夜花园'));
    expect(submit().disabled).toBe(true);
    act(() => submit().click());
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('submitting sends name / description / map reference', () => {
    render();
    act(() => setValue(field('create-puzzle-name'), '午夜花园'));
    act(() => setValue(field('create-puzzle-description'), '六人六格'));
    const option = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('古堡之谜'),
    )!;
    act(() => option.click());
    act(() => submit().click());
    expect(createMutate).toHaveBeenCalledWith({
      name: '午夜花园',
      description: '六人六格',
      mapProjectId: 217,
      mapVersionNo: 3,
    });
  });

  it('?new={projectId}:{versionNo} arrives with the version pre-picked', () => {
    render('/puzzles?new=217:3');
    expect(text()).toContain('6×6');
    expect(text()).toContain('创建后不可修改');
  });

  it('with no published version: disabled submit + a pointer at 地图', () => {
    versionsRef.data = [];
    render();
    expect(text()).toContain('还没有已发布的地图版本');
    expect(submit().disabled).toBe(true);
    const goToMaps = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('前往地图'),
    );
    expect(goToMaps).toBeDefined();
  });
});
