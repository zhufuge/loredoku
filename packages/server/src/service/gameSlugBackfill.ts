import { GAME_SLUG_MAX_LENGTH, GAME_SLUG_PREFIX, buildDefaultSlug } from '@loredoku/shared';
import type { GameDifficulty } from '@loredoku/shared';

/**
 * v0.4.1 OPT-W04 (docs/v0.4.1.md §4.5): the data half of the `map_games.slug`
 * migration, kept pure so it can be unit tested without a database.
 *
 * A deploy refuses a path another map already owns (Q12), but the migration has
 * no author to ask — it must leave **every** existing row with a non-empty,
 * unique path. So a derived collision is resolved by appending `-2`, `-3`, …
 * (the behaviour §4.5 documents for存量行 only).
 */

export interface SlugBackfillRow {
  id: string | number;
  name: string;
  difficulty: GameDifficulty;
}

/**
 * Reserves `root`, or the first `root-{n}` (`n >= 2`) that is still free.
 *
 * The suffix is carved **out of** the 80-character budget rather than appended
 * past it: appending alone would be truncated straight back to `root` for a
 * long name, and the caller would loop forever on an already-taken value.
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
 * Walks the rows in the order the migration read them (id ascending) and
 * returns the path each one should get. Deterministic: the first row keeps the
 * plain derived path, later ones take the suffixes.
 */
export function backfillGameSlugs(rows: SlugBackfillRow[]): Map<string | number, string> {
  const taken = new Set<string>();
  const result = new Map<string | number, string>();
  for (const row of rows) {
    const derived = buildDefaultSlug({ name: row.name, difficulty: row.difficulty });
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
