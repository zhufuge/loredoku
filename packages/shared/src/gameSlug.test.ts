import { describe, expect, it } from 'vitest';
import {
  GAME_DIFFICULTY_LEVELS,
  GAME_DIFFICULTY_SLUGS,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_MIN_LENGTH,
  GAME_SLUG_PREFIX,
} from './constants';
import {
  buildDefaultSlug,
  composeSlug,
  normalizeSlugInput,
  slugError,
  slugify,
  splitSlug,
  truncateSlug,
} from './gameSlug';

/**
 * OPT-W04 (docs/v0.4.1.md §4 / §12.6): the access path is a pure-function
 * concern, so the whole rule table is pinned here — the server validates with
 * these and the dialog previews with these.
 */

describe('slugify (OPT-W04 §4.3)', () => {
  it('lowercases and turns separators into a single hyphen', () => {
    expect(slugify('Flower Garden')).toBe('flower-garden');
    expect(slugify('Fireside\tBeach')).toBe('fireside-beach');
    expect(slugify('a_b.c/d\\e|f+g')).toBe('a-b-c-d-e-f-g');
  });

  it('drops everything outside [a-z0-9-]', () => {
    expect(slugify('古堡 Castle!')).toBe('castle');
    expect(slugify('Café #1')).toBe('caf-1');
  });

  it('collapses runs of hyphens and trims the edges', () => {
    expect(slugify('  Fireside  Beach  ')).toBe('fireside-beach');
    expect(slugify('a---b')).toBe('a-b');
    expect(slugify('---')).toBe('');
  });

  it('returns an empty string when nothing ASCII-survives', () => {
    expect(slugify('神秘古堡')).toBe('');
    expect(slugify('！？…')).toBe('');
    expect(slugify('')).toBe('');
  });

  it('is idempotent', () => {
    for (const input of ['Flower Garden', '  古堡 Castle!  ', 'a---b', '神秘古堡']) {
      expect(slugify(slugify(input))).toBe(slugify(input));
    }
  });
});

describe('buildDefaultSlug (OPT-W04 §4.3)', () => {
  it('builds puzzle-{name}-{difficulty} for the two documented examples', () => {
    expect(buildDefaultSlug({ name: 'Flower Garden', difficulty: 'veryEasy' })).toBe(
      'puzzle-flower-garden-very-easy',
    );
    expect(buildDefaultSlug({ name: 'Fireside Beach', difficulty: 'medium' })).toBe(
      'puzzle-fireside-beach-medium',
    );
  });

  it('covers all five difficulty tiers', () => {
    expect(GAME_DIFFICULTY_LEVELS.map((tier) => GAME_DIFFICULTY_SLUGS[tier])).toEqual([
      'very-easy',
      'easy',
      'medium',
      'hard',
      'expert',
    ]);
    for (const tier of GAME_DIFFICULTY_LEVELS) {
      expect(buildDefaultSlug({ name: 'Flower Garden', difficulty: tier })).toBe(
        `${GAME_SLUG_PREFIX}-flower-garden-${GAME_DIFFICULTY_SLUGS[tier]}`,
      );
    }
  });

  it('returns "" when the name has no usable characters (Q13)', () => {
    // Nothing to derive — the author must type a path; "puzzle-medium" would be
    // an invented path, which Q13 forbids.
    expect(buildDefaultSlug({ name: '神秘古堡', difficulty: 'easy' })).toBe('');
    expect(buildDefaultSlug({ name: '城堡', difficulty: 'expert' })).toBe('');
    expect(buildDefaultSlug({ name: '！？…', difficulty: 'medium' })).toBe('');
  });

  it('keeps a partially-ASCII name (the ASCII part still derives a path)', () => {
    expect(buildDefaultSlug({ name: '古堡 Castle!', difficulty: 'hard' })).toBe('puzzle-castle-hard');
  });

  it('truncates a very long name without leaving a trailing hyphen', () => {
    const slug = buildDefaultSlug({ name: 'x'.repeat(200), difficulty: 'medium' });
    expect(slug.length).toBeLessThanOrEqual(GAME_SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('slugError (OPT-W04 §4.4)', () => {
  it('accepts a well-formed slug', () => {
    expect(slugError('puzzle-flower-garden-very-easy')).toBeNull();
    expect(slugError('abc')).toBeNull();
    expect(slugError('a'.repeat(GAME_SLUG_MAX_LENGTH))).toBeNull();
  });

  it('rejects an empty slug (Q13: the author has to type one)', () => {
    expect(slugError('')).toBe('请填写访问路径');
  });

  it('rejects uppercase and characters outside the set', () => {
    expect(slugError('Puzzle-Flower')).toBe('访问路径只能包含小写字母、数字和连字符（-）');
    expect(slugError('flower_garden')).toBe('访问路径只能包含小写字母、数字和连字符（-）');
    expect(slugError('flower garden')).toBe('访问路径只能包含小写字母、数字和连字符（-）');
    expect(slugError('古堡')).toBe('访问路径只能包含小写字母、数字和连字符（-）');
  });

  it('rejects a leading or trailing hyphen', () => {
    expect(slugError('-flower')).toBe('访问路径不能以连字符开头或结尾');
    expect(slugError('flower-')).toBe('访问路径不能以连字符开头或结尾');
  });

  it('rejects a slug shorter than the minimum', () => {
    expect(GAME_SLUG_MIN_LENGTH).toBe(3);
    expect(slugError('ab')).toBe(`访问路径至少 ${GAME_SLUG_MIN_LENGTH} 个字符`);
  });

  it('rejects a slug longer than the maximum', () => {
    expect(slugError('a'.repeat(GAME_SLUG_MAX_LENGTH + 1))).toBe(
      `访问路径最多 ${GAME_SLUG_MAX_LENGTH} 个字符`,
    );
  });
});

describe('normalizeSlugInput (OPT-W04 §4.4)', () => {
  it('folds case and separators while typing', () => {
    expect(normalizeSlugInput('Puzzle Flower')).toBe('puzzle-flower');
    expect(normalizeSlugInput('a_b')).toBe('a-b');
    expect(normalizeSlugInput('a!!!b')).toBe('a-b');
  });

  it('keeps a trailing hyphen so puzzle- style input stays possible', () => {
    expect(normalizeSlugInput('puzzle-')).toBe('puzzle-');
  });

  it('caps the length at the column width', () => {
    expect(normalizeSlugInput('x'.repeat(GAME_SLUG_MAX_LENGTH + 50))).toHaveLength(
      GAME_SLUG_MAX_LENGTH,
    );
  });
});

describe('truncateSlug (OPT-W04 §4.3)', () => {
  it('passes a short slug through untouched', () => {
    expect(truncateSlug('puzzle-easy')).toBe('puzzle-easy');
  });

  it('trims a trailing hyphen left behind by the cut', () => {
    const trimmed = truncateSlug(`${'x'.repeat(GAME_SLUG_MAX_LENGTH - 1)}-more`);
    expect(trimmed).toHaveLength(GAME_SLUG_MAX_LENGTH - 1);
    expect(trimmed.endsWith('-')).toBe(false);
  });
});

/**
 * v0.7.1 §7.6.1: the deploy dialog edits only the **middle** — `puzzle-` and the
 * difficulty suffix are read-only text around the input, composed on save and
 * split back on prefill.
 */
describe('composeSlug (v0.7.1 §7.6.1)', () => {
  it('wraps the middle with the fixed prefix and the difficulty segment', () => {
    expect(composeSlug('flower-garden', 'medium')).toBe('puzzle-flower-garden-medium');
    expect(composeSlug('flower-garden', 'veryEasy')).toBe('puzzle-flower-garden-very-easy');
  });

  it('slugifies the middle so an author cannot type an illegal character', () => {
    expect(composeSlug('Flower Garden!', 'hard')).toBe('puzzle-flower-garden-hard');
    expect(composeSlug('古堡 Castle', 'easy')).toBe('puzzle-castle-easy');
  });

  it('eats leading / trailing hyphens so the join never doubles them', () => {
    expect(composeSlug('-castle-', 'medium')).toBe('puzzle-castle-medium');
    expect(composeSlug('a--b', 'medium')).toBe('puzzle-a-b-medium');
  });

  it('keeps the result inside the column width without a trailing hyphen', () => {
    const slug = composeSlug('x'.repeat(GAME_SLUG_MAX_LENGTH + 20), 'expert');
    expect(slug.length).toBeLessThanOrEqual(GAME_SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('agrees with buildDefaultSlug for a plain name', () => {
    for (const difficulty of GAME_DIFFICULTY_LEVELS) {
      expect(buildDefaultSlug({ name: 'Flower Garden', difficulty })).toBe(
        composeSlug(slugify('Flower Garden'), difficulty),
      );
    }
  });
});

describe('splitSlug (v0.7.1 §7.6.1)', () => {
  it('round-trips a composed slug back to its middle', () => {
    const middle = 'flower-garden-2019';
    expect(splitSlug(composeSlug(middle, 'hard'), 'hard')).toBe(middle);
  });

  it('strips only the prefix when the suffix belongs to another difficulty', () => {
    // The author switched the difficulty: the stored path still ends in the old
    // segment, which is not part of the middle.
    expect(splitSlug('puzzle-flower-garden-medium', 'hard')).toBe('flower-garden-medium');
  });

  it('leaves a path without the prefix alone', () => {
    expect(splitSlug('castle-hard', 'hard')).toBe('castle');
    expect(splitSlug('flower-garden', 'hard')).toBe('flower-garden');
  });
});
