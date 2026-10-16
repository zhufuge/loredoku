import { describe, expect, it } from 'vitest';

/**
 * v0.5.3 FEAT-N02 / FEAT-N03 (docs/v0.5.3.md §2): the `LOREDOKU` mark on the
 * console header, the games home and the game page.
 *
 * Rendering `AppShell` / `GamesPage` / `GamePage` would drag in the router and
 * TanStack Query, so (like `ProjectCards.test.ts`) the durable contract —
 * which surfaces use the asset — is asserted on the source.
 */

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

function read(glob: Record<string, string>, key: string): string {
  return stripComments((glob[key] ?? '').replace(/\r\n/g, '\n'));
}

const here = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const pages = import.meta.glob('../../pages/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const brandLogo = read(here, './BrandLogo.tsx');
const appShell = read(here, './AppShell.tsx');
const gamesPage = read(pages, '../../pages/GamesPage.tsx');
const gamePage = read(pages, '../../pages/GamePage.tsx');

describe('BrandLogo（FEAT-N02 / FEAT-N03）', () => {
  it('renders the asset from src/assets', () => {
    expect(brandLogo).toContain("from '@/assets/LOREDOKU-logo.svg'");
    expect(brandLogo).toContain('data-testid="brand-logo"');
    // Sized by height alone: the mark is a ~6:1 wordmark.
    expect(brandLogo).toContain('style={{ height }}');
  });

  it('the console header shows 「图标 · 格物」', () => {
    expect(appShell).toContain("from '@/components/layout/BrandLogo'");
    expect(appShell).toContain('<BrandLogo height={20} withWordmark />');
    expect(brandLogo).toContain('· 格物');
    // The generic grid icon it replaced is gone.
    expect(appShell).not.toContain('LayoutGrid');
  });

  it('the games home and the game page carry the mark too', () => {
    expect(gamesPage).toContain('<BrandLogo height={22} />');
    expect(gamePage).toContain('<BrandLogo height={16} />');
  });
});
