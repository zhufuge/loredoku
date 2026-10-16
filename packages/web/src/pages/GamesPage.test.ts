import { describe, expect, it } from 'vitest';

/**
 * FEAT-G01 (docs/v0.4.0.md §4): the games home is its own page — card grid,
 * four facts per card, click-through to the game page.
 *
 * v0.4.0 验收补充：它是**独立顶层路由**，不在 `AppShell` 里——玩家看不到制作端
 * 的任何模块导航，只能通过链接进入。
 *
 * Source-level assertions (see `EditorPage.infoDrawer.test.ts` for the
 * rationale): the page needs a live query client to render, and what must be
 * protected is the wiring — which route, which data, which navigation.
 */

const pageSource =
  (import.meta.glob('./GamesPage.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./GamesPage.tsx'] ?? '';

const cardSource =
  (import.meta.glob('../components/game/GameCard.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../components/game/GameCard.tsx'] ?? '';

const routerSource =
  (import.meta.glob('../router.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../router.tsx'] ?? '';

const shellSource =
  (import.meta.glob('../components/layout/AppShell.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../components/layout/AppShell.tsx'] ?? '';

describe('GamesPage (FEAT-G01)', () => {
  it('is a top-level route outside the app shell', () => {
    expect(routerSource).toContain("import { GamesPage } from '@/pages/GamesPage'");
    expect(routerSource).toContain("path: '/play',");
    expect(routerSource).toContain('element: <GamesPage />');
    // It must not live inside the AppShell children array…
    const shellChildren = routerSource.slice(
      routerSource.indexOf('element: <AppShell />'),
      routerSource.indexOf("path: '/editor/:projectId'"),
    );
    expect(shellChildren).not.toContain('GamesPage');
    // …and the console navigation must not offer it.
    // FEAT-L04 (v0.5.1 §4): the whole `/games` path is gone; only `/play`.
    expect(shellSource).not.toContain('/games');
    expect(shellSource).not.toContain('/play');
    expect(routerSource).not.toContain("path: '/games");
    expect(shellSource).not.toContain('Gamepad2');
  });

  it('carries its own full-page layout', () => {
    expect(pageSource).toContain('min-h-screen bg-background');
    expect(pageSource).toContain('mx-auto w-full max-w-7xl space-y-6 px-6 py-6');
  });

  it('renders a responsive card grid with 20px gutters', () => {
    // 2 columns by default, 3 from md, 4 from xl.
    expect(pageSource).toContain("grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4");
  });

  it('shows an empty state that points back at the puzzles page', () => {
    // v0.5.0 SPEC-K11：作品模块已删，部署的源头变成谜题列表。
    expect(pageSource).toContain('还没有部署任何游戏');
    expect(pageSource).toContain('<Link to="/puzzles">前往谜题列表</Link>');
    expect(pageSource).not.toContain('/works');
  });

  it('cards carry the four required facts', () => {
    // Cover (with the map name initial as placeholder), name, difficulty, n×n.
    // v0.5.3 SPEC-N04: square, like the map card's.
    expect(cardSource).toContain('aspect-square');
    expect(cardSource).not.toContain('aspect-[16/10]');
    expect(cardSource).toContain('game.coverUrl ? (');
    expect(cardSource).toContain('game.name.trim().charAt(0)');
    expect(cardSource).toContain('GAME_DIFFICULTY_COLORS[game.difficulty]');
    expect(cardSource).toContain('GAME_DIFFICULTY_LABELS[game.difficulty]');
    expect(cardSource).toContain('{game.gridSize} × {game.gridSize}');
  });

  it('clicking a card opens the game page by access path', () => {
    // OPT-W04 (docs/v0.4.1.md §4.7): the URL carries the slug, not the id.
    // FEAT-L04 (v0.5.1 §4): the path is `/play`, not `/games`.
    expect(cardSource).toContain('navigate(`/play/${game.slug}`)');
    expect(cardSource).not.toContain('navigate(`/play/${game.id}`)');
    expect(cardSource).not.toContain('`/games/');
  });

  it('titles the browser tab after the page', () => {
    expect(pageSource).toContain("document.title = '游戏 · 格物'");
  });
});
