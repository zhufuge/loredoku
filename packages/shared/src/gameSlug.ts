import {
  GAME_DIFFICULTY_SLUGS,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_MIN_LENGTH,
  GAME_SLUG_PATTERN,
  GAME_SLUG_PREFIX,
  GAME_SLUG_RESERVED,
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
 *
 * v0.7.1 §7.6.1: the deploy dialog edits the **middle** only (prefix `puzzle-`
 * and the difficulty suffix are read-only text around the input), so the three
 * pieces are composed by {@link composeSlug}. This stays the one derivation used
 * by the dialog default, 「重新生成」 and the server's fallback.
 */
export function buildDefaultSlug(input: { name: string; difficulty: GameDifficulty }): string {
  const middle = slugify(input.name);
  if (middle.length === 0) return '';
  return composeSlug(middle, input.difficulty);
}

/**
 * v0.7.1 §7.6.1: `puzzle-{middle}-{difficulty}`. The middle is slugified and
 * stripped of edge dashes (a trailing `-` while typing would otherwise produce
 * `puzzle-x--hard`), and the whole thing is truncated to the column width.
 */
export function composeSlug(middle: string, difficulty: GameDifficulty): string {
  const body = slugify(middle).replace(/^-+|-+$/g, '');
  const suffix = GAME_DIFFICULTY_SLUGS[difficulty];
  const parts = [GAME_SLUG_PREFIX, body, suffix].filter((part) => part.length > 0);
  return truncateSlug(parts.join('-'));
}

/**
 * v0.7.1 §7.6.1: the inverse for the deploy dialog's prefill — an already
 * published slug back to the editable middle.
 *
 * Strips the prefix and the **current** difficulty suffix when both are present;
 * a slug that does not end with that suffix (a legacy path, or one whose
 * difficulty the author is about to change) keeps everything after the prefix,
 * which is the closest truthful answer.
 */
export function splitSlug(slug: string, difficulty: GameDifficulty): string {
  let middle = slug;
  const prefix = `${GAME_SLUG_PREFIX}-`;
  if (middle.startsWith(prefix)) middle = middle.slice(prefix.length);
  const suffix = `-${GAME_DIFFICULTY_SLUGS[difficulty]}`;
  if (suffix.length > 1 && middle.endsWith(suffix)) {
    middle = middle.slice(0, middle.length - suffix.length);
  }
  return middle;
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
  /**
   * v0.8.0（docs/v0.8.0.md §9）：`theme` 是 `/play/theme/:slug` 的第一段，被路由占了。
   * `GAME_SLUG_PATTERN` 只认字符集，不会拦它，所以必须在这里显式拒 ——
   * 否则某个作者把自己那关命名成 `theme`，两条路由就撞在一起。
   */
  if (GAME_SLUG_RESERVED.includes(slug)) {
    return `「${slug}」是保留路径，请换一个`;
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
