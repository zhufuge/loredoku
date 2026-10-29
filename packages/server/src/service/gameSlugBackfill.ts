import { GAME_SLUG_MAX_LENGTH, GAME_SLUG_PREFIX, buildDefaultSlug } from '@loredoku/shared';
import type { GameDifficulty } from '@loredoku/shared';

/**
 * v0.4.1 OPT-W04 (docs/v0.4.1.md §4.5): the data half of the `games.slug`
 * migration, pure so it unit-tests without a database. A deploy refuses a path
 * another map owns (Q12), but the migration has no author to ask — every row must
 * end up non-empty and unique, so collisions take `-2`, `-3`, …
 */

export interface SlugBackfillRow {
  id: string | number;
  name: string;
  difficulty: GameDifficulty;
}

/**
 * Reserves `root`, or the first free `root-{n}` (`n >= 2`). The suffix is carved
 * **out of** the 80-char budget — appending past it would truncate straight back
 * to `root` and loop forever.
 */
export function uniqueSlugFor(root: string, taken: ReadonlySet<string>): string {
  if (!taken.has(root)) return root;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const tail = `-${suffix}`;
    const base = root.slice(0, GAME_SLUG_MAX_LENGTH - tail.length).replace(/-+$/g, '');
    const candidate = `${base.length > 0 ? base : GAME_SLUG_PREFIX}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
  /* istanbul ignore next — 10k maps sharing one name is beyond the product. */
  throw new Error('无法为存量游戏生成唯一访问路径');
}

/**
 * Walks rows in migration order (id ascending) and returns each one's path.
 * Deterministic: the first row keeps the plain derived path, later ones suffix.
 */
export function backfillGameSlugs(rows: SlugBackfillRow[]): Map<string | number, string> {
  const taken = new Set<string>();
  const result = new Map<string | number, string>();
  for (const row of rows) {
    const derived = buildDefaultSlug({ name: row.name });
    // Q13: a name with no ASCII alphanumerics derives nothing, and the
    // migration cannot ask an author — fall back to the row id so the column
    // never ends up NULL.
    const root = derived.length > 0 ? derived : `game-${Number(row.id)}`;
    const slug = uniqueSlugFor(root, taken);
    taken.add(slug);
    result.set(row.id, slug);
  }
  return result;
}
