import { describe, expect, it } from 'vitest';
import { GAME_SLUG_MAX_LENGTH, GAME_SLUG_PATTERN, slugError } from '@loredoku/shared';
import { backfillGameSlugs, uniqueSlugFor } from '../src/service/gameSlugBackfill';

/**
 * v0.4.1 OPT-W04 §4.5 / §12.6: the backfill half of the `map_games.slug`
 * migration. The delivery bar (§13.4) is "存量行回填后无空值、无重复", so the two
 * properties this file pins are exactly those.
 */

describe('backfillGameSlugs (OPT-W04 §4.5)', () => {
  it('derives puzzle-{name}-{difficulty} for every existing row', () => {
    const slugs = backfillGameSlugs([
      { id: 1, name: 'Flower Garden', difficulty: 'veryEasy' },
      { id: 2, name: 'Fireside Beach', difficulty: 'medium' },
      { id: 3, name: '  Ancient Ruins  ', difficulty: 'hard' },
    ]);
    expect(slugs.get(1)).toBe('puzzle-flower-garden-very-easy');
    expect(slugs.get(2)).toBe('puzzle-fireside-beach-medium');
    expect(slugs.get(3)).toBe('puzzle-ancient-ruins-hard');
  });

  it('appends -2, -3 … to rows that derive the same path, in id order', () => {
    const slugs = backfillGameSlugs([
      { id: 10, name: 'Twin Map', difficulty: 'easy' },
      { id: 11, name: 'Twin Map', difficulty: 'easy' },
      { id: 12, name: 'Twin  Map!!', difficulty: 'easy' },
    ]);
    expect(slugs.get(10)).toBe('puzzle-twin-map-easy');
    expect(slugs.get(11)).toBe('puzzle-twin-map-easy-2');
    expect(slugs.get(12)).toBe('puzzle-twin-map-easy-3');
  });

  it('falls back to the row id when the name derives nothing (Q13)', () => {
    const slugs = backfillGameSlugs([
      { id: 41, name: '神秘古堡', difficulty: 'hard' },
      { id: 42, name: '！！！', difficulty: 'hard' },
    ]);
    expect(slugs.get(41)).toBe('game-41');
    expect(slugs.get(42)).toBe('game-42');
  });

  it('never leaves an empty value, and never repeats one', () => {
    const rows = [
      { id: 1, name: '神秘古堡', difficulty: 'hard' as const },
      { id: 2, name: 'Flower Garden', difficulty: 'veryEasy' as const },
      { id: 3, name: 'flower garden', difficulty: 'veryEasy' as const },
      { id: 4, name: '！？…', difficulty: 'medium' as const },
      { id: 5, name: 'x'.repeat(200), difficulty: 'expert' as const },
      { id: 6, name: 'x'.repeat(200), difficulty: 'expert' as const },
    ];
    const slugs = backfillGameSlugs(rows);
    const values = [...slugs.values()];

    expect(values).toHaveLength(rows.length);
    for (const value of values) {
      expect(value.length).toBeGreaterThanOrEqual(3);
      expect(value.length).toBeLessThanOrEqual(GAME_SLUG_MAX_LENGTH);
      expect(GAME_SLUG_PATTERN.test(value)).toBe(true);
      expect(slugError(value)).toBeNull();
    }
    expect(new Set(values).size).toBe(values.length);
    // The two ASCII-surviving names differ only in case → they must not collide.
    expect(slugs.get(2)).toBe('puzzle-flower-garden-very-easy');
    expect(slugs.get(3)).toBe('puzzle-flower-garden-very-easy-2');
  });
});

describe('uniqueSlugFor (OPT-W04 §4.5)', () => {
  it('keeps the root when it is free', () => {
    expect(uniqueSlugFor('puzzle-map-easy', new Set())).toBe('puzzle-map-easy');
  });

  it('skips past every taken variant', () => {
    const taken = new Set(['puzzle-map-easy', 'puzzle-map-easy-2', 'puzzle-map-easy-3']);
    expect(uniqueSlugFor('puzzle-map-easy', taken)).toBe('puzzle-map-easy-4');
  });

  it('carves the suffix out of the 80-character budget for a long root', () => {
    // Appending to a full-width root would be truncated straight back to the
    // root and loop forever; the suffix must be reserved first.
    const root = 'x'.repeat(GAME_SLUG_MAX_LENGTH);
    const first = uniqueSlugFor(root, new Set());
    expect(first).toBe(root);

    const second = uniqueSlugFor(root, new Set([first]));
    expect(second).not.toBe(first);
    expect(second.endsWith('-2')).toBe(true);
    expect(second.length).toBeLessThanOrEqual(GAME_SLUG_MAX_LENGTH);
    expect(slugError(second)).toBeNull();
  });

  it('terminates for many rows sharing one very long name', () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      id: index + 1,
      name: 'y'.repeat(300),
      difficulty: 'medium' as const,
    }));
    const values = [...backfillGameSlugs(rows).values()];
    expect(new Set(values).size).toBe(rows.length);
    for (const value of values) expect(slugError(value)).toBeNull();
  });
});
