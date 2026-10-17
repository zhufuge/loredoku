import {
  GAME_DIFFICULTY_SLUGS,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_MIN_LENGTH,
  GAME_SLUG_PATTERN,
  GAME_SLUG_PREFIX,
} from './constants';
import type { GameDifficulty } from './types/domain';

/**
 * OPT-W04 (docs/v0.4.1.md §4): a game is reachable at `/play/{slug}` instead of
 * `/play/{id}`. The default is derived from name + difficulty; the author may
 * overwrite it and the server stores what they typed (after validation). Pure
 * functions only — the server validates, the dialog previews, both share these.
 */

/**
 * §4.3: lowercase → separators to `-` → drop outside `[a-z0-9-]` → collapse runs
 * → trim edges. A name with no ASCII alphanumerics yields `''`, which callers
 * **must** treat as "the author has to type one" (Q13).
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s_./\\|+]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * §4.3: `puzzle-` + slugified name + `-` + slugified difficulty. Q13: a name that
 * slugifies to nothing returns `''` rather than inventing `puzzle-medium`.
 */
export function buildDefaultSlug(input: { name: string; difficulty: GameDifficulty }): string {
  const name = slugify(input.name);
  if (name.length === 0) return '';
  const difficulty = GAME_DIFFICULTY_SLUGS[input.difficulty];
  const parts = [GAME_SLUG_PREFIX, name, difficulty].filter((part) => part.length > 0);
  return truncateSlug(parts.join('-'));
}

/** §4.4: the author-visible reason a slug is unusable, or `null`. User-facing verbatim. */
export function slugError(slug: string): string | null {
  if (slug.length === 0) return '请填写访问路径';
  if (!GAME_SLUG_PATTERN.test(slug)) {
    return '访问路径只能包含小写字母、数字和连字符（-）';
  }
  if (slug.startsWith('-') || slug.endsWith('-')) {
    return '访问路径不能以连字符开头或结尾';
  }
  if (slug.length < GAME_SLUG_MIN_LENGTH) {
    return `访问路径至少 ${GAME_SLUG_MIN_LENGTH} 个字符`;
  }
  if (slug.length > GAME_SLUG_MAX_LENGTH) {
    return `访问路径最多 ${GAME_SLUG_MAX_LENGTH} 个字符`;
  }
  return null;
}

/**
 * §4.4: strips what a URL can never carry, so typing never leaves the field
 * unsubmittable. A trailing `-` is kept while typing so `puzzle-` stays possible.
 */
export function normalizeSlugInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s_./\\|+]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, GAME_SLUG_MAX_LENGTH);
}

/** Keeps a derived slug inside the column width without leaving a trailing `-`. */
export function truncateSlug(slug: string): string {
  if (slug.length <= GAME_SLUG_MAX_LENGTH) return slug;
  return slug.slice(0, GAME_SLUG_MAX_LENGTH).replace(/-+$/g, '');
}
