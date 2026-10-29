import {
  GAME_DIFFICULTY_SLUGS,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_MIN_LENGTH,
  GAME_SLUG_PATTERN,
  GAME_SLUG_PREFIX,
  GAME_SLUG_RESERVED,
} from './constants';

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
 * §4.3: `puzzle-` + slugified name. Q13: a name that slugifies to nothing
 * returns `''` rather than inventing something.
 *
 * v0.7.1 §7.6.1: the deploy dialog edits the **middle** only (the `puzzle-`
 * prefix is read-only text around the input), so the pieces are composed by
 * {@link composeSlug}. This stays the one derivation used by the dialog default,
 * 「重新生成」 and the server's fallback.
 *
 * v0.8.1：**难度不再进路径**。路径是给持链接的人的承诺，改个难度不该把地址改掉
 * —— 难度是这关的属性，不是它的地址。老路径（带 `-hard` 这类后缀）仍然有效，
 * {@link splitSlug} 反解时会把它剥掉。
 */
export function buildDefaultSlug(input: { name: string }): string {
  const middle = slugify(input.name);
  if (middle.length === 0) return '';
  return composeSlug(middle);
}

/**
 * v0.7.1 §7.6.1: `puzzle-{middle}`（v0.8.1 起没有难度后缀）。The middle is
 * slugified and stripped of edge dashes (a trailing `-` while typing would
 * otherwise produce `puzzle-x-`), and the whole thing is truncated to the
 * column width.
 */
export function composeSlug(middle: string): string {
  const body = slugify(middle).replace(/^-+|-+$/g, '');
  const parts = [GAME_SLUG_PREFIX, body].filter((part) => part.length > 0);
  return truncateSlug(parts.join('-'));
}

/**
 * v0.7.1 §7.6.1: the inverse for the deploy dialog's prefill — an already
 * published slug back to the editable middle.
 *
 * v0.8.1：剥掉前缀之后，再把**任何**已知难度后缀剥掉 —— 存量路径是带
 * `-hard` 这类后缀发布的，回填中段时应当把后缀留给「剥掉」而不是当成名字
 * 的一部分，否则重新部署会把后缀写死进新路径。
 */
export function splitSlug(slug: string): string {
  let middle = slug;
  const prefix = `${GAME_SLUG_PREFIX}-`;
  if (middle.startsWith(prefix)) middle = middle.slice(prefix.length);
  for (const suffix of Object.values(GAME_DIFFICULTY_SLUGS)) {
    const tail = `-${suffix}`;
    if (tail.length > 1 && middle.endsWith(tail)) {
      middle = middle.slice(0, middle.length - tail.length);
      break;
    }
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
