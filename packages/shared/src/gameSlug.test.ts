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
  normalizeSlugInput,
  slugError,
  slugify,
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
