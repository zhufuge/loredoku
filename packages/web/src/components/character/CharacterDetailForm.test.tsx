import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '@loredoku/shared';
import {
  CHARACTER_DISPLAY_NAME_MAX,
  DEFAULT_THEME_COLOR,
  updateCharacterSchema,
} from '@loredoku/shared';

/**
 * v0.7.13 fix —— 纯色角色传完头像后，外观不能再跳回纯色块。
 *
 * 根因不在上传本身：上传成功会 `invalidate()` → 角色列表重取 → `updatedAt` 变 →
 * 那条「同步服务器值」的 effect 把 `appearanceMode` 按回
 * `character.bgColor ? 'color' : 'image'`。保存之前库里 `bgColor` 还在，于是刚
 * 传上去的图被一张色块盖掉，提示却已经说「头像已上传」。
 *
 * 这些用例都在**同一个记录**上换 props（`updatedAt` 变、`avatarUrl` 出现），
 * 模拟重取的时机；`id` 变了才算换角色。
 */

const { uploadMutate, updateMutate } = vi.hoisted(() => ({
  uploadMutate: vi.fn(),
  updateMutate: vi.fn(),
}));

vi.mock('@/hooks/useCharacters', () => ({
  useUpdateCharacter: () => ({ mutate: updateMutate, isPending: false }),
  useUploadCharacterAvatar: () => ({ mutate: uploadMutate, isPending: false }),
  useDeleteCharacterAvatar: () => ({ mutate: vi.fn(), isPending: false }),
  useSetCharacterActive: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { CharacterDetailForm } from './CharacterDetailForm';

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 1,
    code: 'hero',
    name: '勇者',
    gender: 'male',
    description: null,
    avatarPath: null,
    avatarUrl: null,
    avatarThumbUrl: null,
    bgColor: '#FF0000',
    color: null,
    displayName: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CharacterDetailForm — 外观模式（v0.7.13 fix）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // 上传返回成功：真实的 `mutate` 会在 onSuccess 里 invalidate，这里由下面的
    // rerender 承担「服务器回来了」这一步。
    uploadMutate.mockReset();
    uploadMutate.mockImplementation((_vars: unknown, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    updateMutate.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(value: Character): void {
    act(() => {
      root.render(<CharacterDetailForm character={value} onRequestDelete={vi.fn()} />);
    });
  }

  function mode(): string | null {
    return (
      container
        .querySelector('[role="radio"][aria-checked="true"][data-appearance-mode]')
        ?.getAttribute('data-appearance-mode') ?? null
    );
  }

  function pick(value: 'image' | 'color'): void {
    const button = container.querySelector<HTMLButtonElement>(`[data-appearance-mode="${value}"]`);
    act(() => button?.click());
  }

  function uploadAvatar(): void {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    act(() => {
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function typeName(value: string): void {
    const input = container.querySelector<HTMLInputElement>('input');
    // React 的 value tracker 会吞掉直接赋值，要走原型上的 setter。
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    act(() => {
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function clickSave(): void {
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === '保存',
    );
    act(() => button?.click());
  }

  it('stays on the image the user just uploaded', () => {
    render(character());
    expect(mode()).toBe('color');

    pick('image');
    expect(mode()).toBe('image');

    uploadAvatar();
    expect(uploadMutate).toHaveBeenCalledTimes(1);

    // 服务器回来：头像有了、updatedAt 变了，但 bgColor 还没被清（用户还没保存）。
    render(
      character({
        avatarUrl: '/uploads/hero.png',
        avatarThumbUrl: '/uploads/hero_t.png',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    );

    expect(mode()).toBe('image');
  });

  it('saves the colour away so the avatar is what the map draws', () => {
    render(character());
    pick('image');
    uploadAvatar();
    render(
      character({
        avatarUrl: '/uploads/hero.png',
        avatarThumbUrl: '/uploads/hero_t.png',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    );

    clickSave();

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0]?.[0]).toMatchObject({
      id: 1,
      payload: { bgColor: null },
    });
  });

  it('keeps unsaved edits when the record refreshes', () => {
    render(character());
    typeName('勇者二号');
    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('勇者二号');

    // 「停用 / 启用」「上传头像」都会让列表重取 —— 不该把没保存的改名冲掉。
    render(character({ updatedAt: '2026-01-02T00:00:00.000Z' }));

    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('勇者二号');
  });

  it('still resets when a different character is opened', () => {
    render(character());
    pick('image');
    render(character({ id: 2, name: '法师', bgColor: '#00FF00' }));

    expect(mode()).toBe('color');
    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('法师');
  });
});

/**
 * v0.7.13（docs/v0.7.13.md §11）—— 角色页上新增的两个默认值。
 *
 * 主题色**没有开关**：取色器常驻，白色就是「没指定」（§11.4）。所以这里验的
 * 不是控件开合，而是**白色的来龙去脉** —— 库里没值要显示白、选了白不落库、
 * 库里有值要读得出来。白色→`null` 的塌缩在 shared 的 schema 里，表单不重复
 * 实现，所以断言走一遍 `updateCharacterSchema.parse(payload)`，而不是只看
 * payload 的字面值。
 */
describe('CharacterDetailForm — 参与者默认值（v0.7.13 §11）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    updateMutate.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(value: Character): void {
    act(() => {
      root.render(<CharacterDetailForm character={value} onRequestDelete={vi.fn()} />);
    });
  }

  /**
   * 指定 aria-label：外观区在纯色块模式下还有**第二个**取色器（那是角色自己
   * 的长相 `bgColor`，不是参与者主题色），`input[type="color"]` 会先撞上它。
   */
  function colorInput(): HTMLInputElement | null {
    return container.querySelector<HTMLInputElement>(
      'input[type="color"][aria-label="默认主题色"]',
    );
  }

  /** 取色器旁边那个 hex 文本框。 */
  function hexInput(): HTMLInputElement | null {
    return container.querySelector<HTMLInputElement>('input[aria-label="默认主题色（hex）"]');
  }

  /** 原生取色器把值规范成小写，比较前统一大写。 */
  function colorValue(): string | undefined {
    return colorInput()?.value.toUpperCase();
  }

  function displayNameInput(): HTMLInputElement | null {
    return container.querySelector<HTMLInputElement>('[data-testid="default-display-name-input"]');
  }

  function setInput(input: HTMLInputElement | null, value: string): void {
    // React 的 value tracker 会吞掉直接赋值，要走原型上的 setter。
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    act(() => {
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** React 17 起 `onBlur` 走的是原生 `focusout`，直接派发 `blur` 不会被收到。 */
  function blur(input: HTMLInputElement | null): void {
    act(() => {
      input?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
  }

  function clickSave(): void {
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === '保存',
    );
    act(() => button?.click());
  }

  function savedPayload(): Record<string, unknown> {
    return updateMutate.mock.calls[0]?.[0]?.payload as Record<string, unknown>;
  }

  it('没配默认值时显示白色，取色器始终在', () => {
    render(character());
    expect(colorInput()).not.toBeNull();
    expect(colorValue()).toBe(DEFAULT_THEME_COLOR);
    expect(hexInput()?.value.toUpperCase()).toBe(DEFAULT_THEME_COLOR);
  });

  it('没配默认值时保存出去的 payload 过一遍 schema 变成 null', () => {
    render(character());
    clickSave();
    expect(savedPayload()).toMatchObject({ color: DEFAULT_THEME_COLOR, displayName: null });
    // 白色 = 没有默认：塌缩发生在 shared 的 schema 里，表单不重复实现。
    expect(updateCharacterSchema.parse(savedPayload()).color).toBeNull();
  });

  it('取色器选了别的颜色就照写', () => {
    render(character());
    setInput(colorInput(), '#aabbcc');
    clickSave();
    expect(savedPayload().color).toBe('#AABBCC');
    expect(updateCharacterSchema.parse(savedPayload()).color).toBe('#AABBCC');
  });

  it('改回白色就是清掉默认值', () => {
    render(character({ color: '#AABBCC' }));
    expect(colorValue()).toBe('#AABBCC');

    setInput(colorInput(), '#ffffff');
    clickSave();
    expect(updateCharacterSchema.parse(savedPayload()).color).toBeNull();
  });

  it('hex 文本框是草稿：非法中间态留在框里，失焦才回滚', () => {
    render(character({ color: '#AABBCC' }));
    setInput(hexInput(), '#ff0');
    // 打字过程中不提交 —— 也不该把框里的字冲掉，否则没法接着打。
    expect(hexInput()?.value).toBe('#ff0');
    expect(colorValue()).toBe('#AABBCC');

    blur(hexInput());
    expect(hexInput()?.value.toUpperCase()).toBe('#AABBCC');
  });

  it('hex 文本框失焦提交，并归一成大写', () => {
    render(character());
    setInput(hexInput(), '#aabbcc');
    blur(hexInput());
    expect(colorValue()).toBe('#AABBCC');

    clickSave();
    expect(savedPayload().color).toBe('#AABBCC');
  });

  it('库里有的默认值会被读出来', () => {
    render(character({ color: '#123456', displayName: '甲' }));
    expect(colorValue()).toBe('#123456');
    expect(hexInput()?.value.toUpperCase()).toBe('#123456');
    expect(displayNameInput()?.value).toBe('甲');
  });

  it('编号清空后保存为 null，不落一个空角标', () => {
    render(character({ displayName: '甲' }));
    setInput(displayNameInput(), '');
    clickSave();
    expect(savedPayload().displayName).toBeNull();
  });

  it('编号两端空格不进 payload', () => {
    render(character());
    setInput(displayNameInput(), '  乙  ');
    clickSave();
    expect(savedPayload().displayName).toBe('乙');
  });

  it('编号有 maxLength 兜着', () => {
    render(character());
    expect(displayNameInput()?.maxLength).toBe(CHARACTER_DISPLAY_NAME_MAX);
  });

  it('换了一个角色才重置这两个输入框', () => {
    render(character({ color: '#AABBCC', displayName: '甲' }));
    setInput(displayNameInput(), '丙');

    // 同一条记录的重取（别的按钮引发的）—— 不该冲掉没保存的输入。
    render(character({ color: '#AABBCC', displayName: '甲', updatedAt: '2026-02-01T00:00:00.000Z' }));
    expect(displayNameInput()?.value).toBe('丙');

    render(character({ id: 7, name: '法师', color: '#00FF00', displayName: '丁' }));
    expect(displayNameInput()?.value).toBe('丁');
    expect(colorValue()).toBe('#00FF00');
  });
});
