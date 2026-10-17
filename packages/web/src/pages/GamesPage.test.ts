import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

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

const pageSource = readSource('pages/GamesPage.tsx');

const cardSource = readSource('components/game/GameCard.tsx');

const routerSource = readSource('router.tsx');

const shellSource = readSource('components/layout/AppShell.tsx');

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
    // FEAT-L04 (v0.5.1 §4): the whole `/games` path is gone; only `/play`.
    expect(shellSource).not.toContain('/games');
    expect(routerSource).not.toContain("path: '/games");
    expect(shellSource).not.toContain('Gamepad2');
    expect(shellSource).toContain("navigate('/play')");
  });

  it('carries its own full-page layout', () => {
    expect(pageSource).toContain('min-h-screen bg-background');
    expect(pageSource).toContain('mx-auto w-full max-w-7xl space-y-6 px-6 py-6');
  });

  it('renders a responsive card grid with 20px gutters', () => {
    // 2 columns by default, 3 from md, 4 from xl.
    expect(pageSource).toContain("grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4");
  });

  it('points its empty state back at the puzzles page', () => {
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

  it('leads with the brand (FEAT-O02)', () => {
    expect(pageSource).toContain('<BrandLogo height={22} withWordmark />');
  });

  it('offers a way back into the maker at /maps (FEAT-O03)', () => {
    expect(pageSource).toContain("navigate('/maps')");
  });
});
