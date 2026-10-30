import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MapGameSummary } from '@loredoku/shared';
import { GameCard } from './GameCard';

/**
 * 纸背光（v0.7.10 §10）：卡片封面上的光斑跟着指针走。
 *
 * jsdom 不排版、也不算渐变，所以能钉住的只有四件事：两层光都在且叠放顺序对、
 * 坐标落在**封面自己的**坐标系里（不是页面坐标、不是卡片坐标）、纯装饰层不进
 * 无障碍树也不吃指针、以及这场动效没有碰坏「整张卡就是一个按钮」这条既有契约。
 */

const GAME: MapGameSummary = {
  id: 7,
  puzzleId: 3,
  themeCode: 'default',
  puzzleName: '雾港',
  puzzleVersionNo: 2,
  name: '雾港之夜',
  slug: 'foggy-harbour',
  coverUrl: '/covers/foggy-harbour.png',
  difficulty: 'hard',
  sortWeight: 0,
  gridSize: 9,
  participantCount: 6,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('GameCard — 纸背光（v0.7.10 §10）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(game: MapGameSummary = GAME): void {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<GameCard game={game} />} />
            <Route path="/play/:slug" element={<p>游戏房间</p>} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  const cover = (): HTMLElement =>
    container.querySelector<HTMLElement>('[data-testid="game-cover"]') as HTMLElement;

  /** 把封面摆到页面 (100, 50)，尺寸 300×300 —— 与四列网格里的实际尺寸同量级。 */
  function placeCover(): void {
    cover().getBoundingClientRect = () =>
      ({
        left: 100,
        top: 50,
        width: 300,
        height: 300,
        right: 400,
        bottom: 350,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  function movePointerTo(clientX: number, clientY: number): void {
    act(() => {
      cover().dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX, clientY }),
      );
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

  it('把指针位置换算出封面内部的坐标', () => {
    render();
    placeCover();
    movePointerTo(130, 70);
    expect(cover().style.getPropertyValue('--glow-x')).toBe('30px');
    expect(cover().style.getPropertyValue('--glow-y')).toBe('20px');

    // 第二笔：光斑是连续的，新坐标直接覆盖旧值，不留累加。
    movePointerTo(250, 200);
    expect(cover().style.getPropertyValue('--glow-x')).toBe('150px');
    expect(cover().style.getPropertyValue('--glow-y')).toBe('150px');
  });

  it('没有封面图时也能跟——占位首字是同一张卡', () => {
    render({ ...GAME, coverUrl: null });
    placeCover();
    movePointerTo(120, 60);
    expect(cover().style.getPropertyValue('--glow-x')).toBe('20px');
    expect(cover().style.getPropertyValue('--glow-y')).toBe('10px');
    // 占位态渲染首字，而不是留一块空白。
    expect(cover().textContent).toContain('雾');
  });

  it('两层光都在，且暗角压在热斑底下', () => {
    render();
    const layers = container.querySelectorAll('[data-testid="game-glow"]');
    expect(layers).toHaveLength(2);
    // 顺序即叠放顺序；暗角压的是封面本身，必须最先画 —— 画在热斑上面会把热斑弄脏。
    expect([...layers].map((el) => el.className)).toEqual([
      expect.stringContaining('paper-shade'),
      expect.stringContaining('paper-core'),
    ]);
    for (const layer of layers) {
      expect(layer.getAttribute('aria-hidden')).toBe('true');
      // 光斑不能拦截指针，否则卡片就没法点了。
      expect(layer.className).toContain('pointer-events-none');
    }
  });

  it('难度徽章的底色是一个完整的颜色函数，不是裸三元组', () => {
    // v0.7.13 回归：`index.css` 里 `--difficulty-*-bg` 存的是 HSL 三元组
    // （与 `--background` 等同约定），内联 style 必须自己补 `hsl()`，否则
    // `background-color: 26 62% 91%` 是非法值、整条被浏览器丢弃 —— 徽章会
    // 只剩文字。这条断言看着像在抄常量，其实钉的是「常量要能被当成完整声明用」。
    render();
    const badge = container.querySelector('span[style]') as HTMLElement;
    expect(badge.style.backgroundColor).toBe('hsl(var(--difficulty-hard-bg))');
    expect(badge.style.color).toBe('hsl(var(--difficulty-hard-fg))');
  });

  it('封面推进，卡片不动（v0.7.13 定稿的那一半动作）', () => {
    // 两个几何动作里只留封面这一个：卡片抬起会让指针划过边缘时「往上抬 + 往外
    // 胀」同时发生，读成抖。这条用例钉住的是**组合**，不是单个类名 —— 有人日后
    // 把 `hover:-translate-y-1` 加回来会红。
    render();
    const card = container.querySelector('[role="button"]') as HTMLElement;
    const img = cover().querySelector('img') as HTMLElement;
    expect(img.className).toContain('group-hover:scale-[1.1]');
    expect(card.className).not.toContain('-translate-y');
  });

  it('收回的取景框半径盖得住最远的那个角（v0.7.13 §10.11）', () => {
    // 遮罩收缩的起点必须正好在封面之外：给小了，静止悬停时最远那个角会落进
    // 羽化区、暗角被打薄；给大了，收回前半段在封面外空转。取值依赖指针到
    // 四角的距离，所以由组件算、CSS 只缩不放。jsdom 不算渐变，这里钉的是
    // 那个**不变量**：不透明部分的半径 ≥ 指针到最远角的距离。
    render();
    placeCover();

    const spots: Array<[number, number]> = [
      [130, 70], // 靠左上
      [250, 200], // 正中
      [395, 345], // 贴着右下角
    ];

    for (const [clientX, clientY] of spots) {
      movePointerTo(clientX, clientY);
      const x = clientX - 100;
      const y = clientY - 50;
      const reach = parseFloat(cover().style.getPropertyValue('--glow-reach'));
      const feather = parseFloat(cover().style.getPropertyValue('--glow-feather'));
      const farthest = Math.hypot(Math.max(x, 300 - x), Math.max(y, 300 - y));

      expect(reach - feather).toBeGreaterThanOrEqual(farthest);
      // 羽化按卡片尺寸封顶，小卡片上不会软成一团雾。
      expect(feather).toBeLessThanOrEqual(72);
    }
  });

  it('按 Enter 仍然进入游戏（动效没有改掉整卡是按钮这条契约）', () => {
    render();
    const card = container.querySelector('[role="button"]') as HTMLElement;
    act(() => {
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(container.textContent).toContain('游戏房间');
  });
});
