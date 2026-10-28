import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Character } from '@loredoku/shared';
import { CharacterThumbnail } from './CharacterThumbnail';

/**
 * v0.5.1 FEAT-L02 / SPEC-L03 — a character with `bgColor` renders as a **solid
 * colour block** in **both** shapes:
 *
 * - `circle` (character list, drawer): a round block with a 1px border;
 * - `plain` (participant panel / drawer): a bare block, the parent clips it.
 */

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 1,
    code: 'block',
    name: '色块人',
    gender: 'male',
    description: null,
    avatarPath: null,
    avatarUrl: null,
    avatarThumbUrl: null,
    bgColor: null,
    color: null,
    displayName: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CharacterThumbnail — 纯色块（v0.5.1 FEAT-L02 / SPEC-L03）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(value: Character, shape?: 'circle' | 'plain'): void {
    act(() => {
      root.render(<CharacterThumbnail character={value} className="h-10 w-10" shape={shape} />);
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('paints a round block in the default circle shape', () => {
    render(character({ bgColor: '#123456' }));
    const block = container.querySelector<HTMLDivElement>('[data-color-block]');
    expect(block?.dataset.colorBlock).toBe('#123456');
    expect(block?.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(block?.className).toContain('rounded-full');
    expect(block?.className).toContain('border');
  });

  it('paints a bare block in the plain shape', () => {
    render(character({ bgColor: '#ABCDEF' }), 'plain');
    const block = container.querySelector<HTMLDivElement>('[data-color-block]');
    expect(block?.dataset.colorBlock).toBe('#ABCDEF');
    expect(block?.className).not.toContain('rounded-full');
  });

  it('lets the block win over an uploaded avatar', () => {
    render(character({ bgColor: '#FFFFFF', avatarUrl: '/a.png', avatarThumbUrl: '/a.png' }));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector<HTMLDivElement>('[data-color-block]')?.dataset.colorBlock).toBe(
      '#FFFFFF',
    );
  });

  it('still renders an <img> for a plain avatar character', () => {
    render(character({ avatarUrl: '/c.png', avatarThumbUrl: '/c.png' }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/c.png');
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });

  it('still shows the name initial when there is neither', () => {
    render(character(), 'plain');
    expect(container.textContent).toContain('色');
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });
});
