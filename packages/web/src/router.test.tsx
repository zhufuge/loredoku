import { matchRoutes, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from './router';

/** 这一层只钉地址表（页面行为在 `src/pages/GamesPage.test.tsx`）；`/play` 与 `/:themeCode/play` 的先后：静态段压过动态段，`/:themeCode` 布局路由不得抢走它们。 */
function leaf(path: string): { route: RouteObject; params: Record<string, string | undefined> } | undefined {
  const matches = matchRoutes(routes, path);
  const last = matches?.[matches.length - 1];
  return last ? { route: last.route, params: last.params as Record<string, string | undefined> } : undefined;
}

describe('router 的游戏列表路由（v0.11.6）', () => {
  it('/:code/play 是这个主题的关卡列表', () => {
    const matched = leaf('/hlm/play');

    expect(matched?.route.path).toBe('/:themeCode/play');
    expect(matched?.params.themeCode).toBe('hlm');
  });

  it('/:code/play/:slug 是这一关本身', () => {
    const matched = leaf('/hlm/play/puzzle-sishan');

    expect(matched?.route.path).toBe('/:themeCode/play/:slug');
    expect(matched?.params.themeCode).toBe('hlm');
    expect(matched?.params.slug).toBe('puzzle-sishan');
  });

  it('/play 仍是一条独立的路（挑主题的入口），不被 /:code 抢走', () => {
    const matched = leaf('/play');

    expect(matched?.route.path).toBe('/play');
    expect(matched?.params.themeCode).toBeUndefined();
  });

  it('/play/:slug 仍能直接打开一关', () => {
    const matched = leaf('/play/puzzle-sishan');

    expect(matched?.route.path).toBe('/play/:slug');
    expect(matched?.params.slug).toBe('puzzle-sishan');
    expect(matched?.params.themeCode).toBeUndefined();
  });

  it('带主题编码的工作空间地址没被新路由挤掉', () => {
    const matched = leaf('/hlm/overview');

    expect(matched?.route.path).toBe('overview');
    expect(matched?.params.themeCode).toBe('hlm');
  });
});
