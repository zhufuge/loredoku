import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@loredoku/shared';
import { api } from './helpers';
import { webDistRoot } from '../src/utils/paths';

/**
 * v0.5.6: the server hosts packages/web/dist so `npm start` alone serves the
 * whole app. These cases need a build — without one the fallback stands down
 * and every path answers the JSON 404 (which is the dev-mode behaviour).
 */
const built = existsSync(resolve(webDistRoot, 'index.html'));

describe.skipIf(!built)('前端 build 产物托管', () => {
  it('GET / answers index.html', async () => {
    const res = await api.get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<div id="root">');
  });

  it('index.html is always revalidated', async () => {
    const res = await api.get('/index.html');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('deep links fall back to index.html for the client router', async () => {
    const res = await api.get('/play/some-game-slug');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<div id="root">');
  });

  it('hashed assets answer with an immutable long cache', async () => {
    const assets = readdirSync(resolve(webDistRoot, 'assets')).filter((name) =>
      name.endsWith('.js'),
    );
    expect(assets.length).toBeGreaterThan(0);
    const res = await api.get(`/assets/${assets[0]}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('a missing asset 404s as JSON instead of falling back to HTML', async () => {
    const res = await api.get('/assets/definitely-not-hashed-1234.js');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('an unmatched /api path keeps its JSON 404', async () => {
    const res = await api.get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('a POST to an unknown path does not fall back to HTML', async () => {
    const res = await api.post('/play/some-game-slug');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });
});
