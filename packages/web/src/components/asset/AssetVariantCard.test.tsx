import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, AssetVariant } from '@loredoku/shared';

/**
 * v0.7.13 fix —— 资源形态卡也有同一个毛病，修法一致（见
 * `CharacterDetailForm.test.tsx` 的说明）：上传图片会触发重取，若表单跟着
 * `updatedAt` 重置，纯色形态会被按回色块，刚传的图看不见。
 */

const { uploadMutate } = vi.hoisted(() => ({ uploadMutate: vi.fn() }));

vi.mock('@/hooks/useAssets', () => ({
  useUpdateAssetVariant: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUploadAssetVariantImage: () => ({ mutate: uploadMutate, isPending: false }),
  useDeleteAssetVariantImage: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AssetVariantCard } from './AssetVariantCard';

function variant(overrides: Partial<AssetVariant> = {}): AssetVariant {
  return {
    id: 11,
    assetId: 1,
    name: '默认',
    sortOrder: 0,
    fitMode: 'cover',
    imagePath: null,
    imageUrl: null,
    imageThumbUrl: null,
    bgColor: '#CCCCCC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function asset(value: AssetVariant): Asset {
  return {
    id: 1,
    code: 'chest',
    name: '宝箱',
    type: 'item',
    blocking: false,
    isActive: true,
    variants: [value],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('AssetVariantCard — 外观模式（v0.7.13 fix）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    uploadMutate.mockReset();
    uploadMutate.mockImplementation((_vars: unknown, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(value: AssetVariant): void {
    act(() => {
      root.render(
        <AssetVariantCard
          asset={asset(value)}
          variant={value}
          canDelete
          onRequestDelete={vi.fn()}
        />,
      );
    });
  }

  function mode(): string | null {
    return (
      container
        .querySelector('[role="radio"][aria-checked="true"][data-appearance-mode]')
        ?.getAttribute('data-appearance-mode') ?? null
    );
  }

  it('stays on the image after a colour variant uploads one', () => {
    render(variant());
    expect(mode()).toBe('color');

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-appearance-mode="image"]')?.click();
    });
    expect(mode()).toBe('image');

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'a.png', { type: 'image/png' })],
      configurable: true,
    });
    act(() => {
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(uploadMutate).toHaveBeenCalledTimes(1);

    // 重取回来的形态：图有了、updatedAt 变了，bgColor 仍在（还没保存）。
    render(
      variant({
        imageUrl: '/uploads/chest.png',
        imageThumbUrl: '/uploads/chest_t.png',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    );

    expect(mode()).toBe('image');
  });

  it('still resets when another variant is opened', () => {
    render(variant());
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-appearance-mode="image"]')?.click();
    });
    render(variant({ id: 12, name: '打开', bgColor: '#EEEEEE' }));

    expect(mode()).toBe('color');
  });
});
