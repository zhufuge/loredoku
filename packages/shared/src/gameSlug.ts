import {
  GAME_DIFFICULTY_SLUGS,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_MIN_LENGTH,
  GAME_SLUG_PATTERN,
  GAME_SLUG_PREFIX,
} from './constants';
import type { GameDifficulty } from './types/domain';

/**
 * OPT-W04 (docs/v0.4.1.md §4): the game's access path.
 *
 * A game is reachable at `/games/{slug}` instead of `/games/{id}`, so the URL
 * reads like the map it belongs to. The default slug is derived from the game
 * name plus the difficulty tier; the author may overwrite it, in which case the
 * server stores whatever they typed (after validation).
 *
 * Pure functions only — the server validates and stores, the web dialog
 * previews, and both share these rules verbatim.
 */

/**
 * §4.3: lowercase → separators become `-` → drop everything outside
 * `[a-z0-9-]` → collapse runs of `-` → trim leading / trailing `-`.
 *
 * A name with no ASCII alphanumerics at all (all Chinese, all symbols) yields
 * an empty string; callers **must** treat that as "the author has to type one"
 * (see `slugError`, and docs/v0.4.1.md §14 Q13).
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
 * §4.3: `puzzle-` + slugified name + `-` + slugified difficulty.
 *
 * Q13: when the name slugifies to nothing there is no path to derive — the
 * function returns `''` rather than inventing `puzzle-medium`, and the callers
 * turn that into "please type one" (the dialog blocks submit, the server
 * rejects the deploy).
 */
export function buildDefaultSlug(input: { name: string; difficulty: GameDifficulty }): string {
  const name = slugify(input.name);
  if (name.length === 0) return '';
  const difficulty = GAME_DIFFICULTY_SLUGS[input.difficulty];
  const parts = [GAME_SLUG_PREFIX, name, difficulty].filter((part) => part.length > 0);
  return truncateSlug(parts.join('-'));
}

/**
 * §4.4: the author-visible reason a slug cannot be used, or `null` when it is
 * fine. The message is user-facing — the deploy dialog and the server both
 * surface it as-is.
 */
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
 * §4.4: strips the characters a URL can never carry, so typing while the field
 * is being edited never leaves it in an unsubmittable state. Uppercase is
 * folded, spaces and underscores become `-`, and runs collapse — but a trailing
 * `-` is kept while typing so `puzzle-`-style input stays possible.
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
