import { matchRoutes, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from './router';

/**
 * v0.11.6：游戏列表从「全站一页」改成「一个主题一页」。
 *
 * 这一层只钉**地址表**：哪条路径落在哪个路由上、参数是什么。页面内部的行为在
 * `src/pages/GamesPage.test.tsx` 里钉 —— 两边合起来才说明「点进来看到的是什么」。
 * 页面都是懒加载的（`LazyPage`），所以这里比对路由而不是组件本身。
 *
 * 特别要守住的是 `/play` 与 `/:themeCode/play` 的先后：静态段永远压过动态段，
 * 但两条都带 `play` 之后，`/:themeCode` 那条布局路由不能再把它们抢走。
 */
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
