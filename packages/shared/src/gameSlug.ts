import {
  GAME_DIFFICULTY_SLUGS,
  GAME_SLUG_MAX_LENGTH,
  GAME_SLUG_MIN_LENGTH,
  GAME_SLUG_PATTERN,
  GAME_SLUG_PREFIX,
  GAME_SLUG_RESERVED,
} from './constants';

/** OPT-W04 (docs/v0.4.1.md §4): `/play/{slug}` instead of `/play/{id}`; pure functions shared by the server (validates) and the dialog (previews) — the author may overwrite the derived default. */

/** §4.3: lowercase → separators to `-` → drop outside `[a-z0-9-]` → collapse runs → trim edges. A name with no ASCII alphanumerics yields `''`, which callers **must** treat as "the author has to type one" (Q13). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s_./\\|+]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** §4.3 (Q13): `puzzle-` + slugified name; a name that slugifies to nothing returns `''` rather than inventing something. **难度不进路径** —— 路径是给持链接者的承诺；存量带 `-hard` 类后缀的路径仍有效，由 {@link splitSlug} 剥掉。 */
export function buildDefaultSlug(input: { name: string }): string {
  const middle = slugify(input.name);
  if (middle.length === 0) return '';
  return composeSlug(middle);
}

/** v0.7.1 §7.6.1: `puzzle-{middle}`（v0.8.1 起没有难度后缀）。The middle is slugified and stripped of edge dashes (a trailing `-` while typing would otherwise produce `puzzle-x-`), and the whole thing is truncated to the column width. */
export function composeSlug(middle: string): string {
  const body = slugify(middle).replace(/^-+|-+$/g, '');
  const parts = [GAME_SLUG_PREFIX, body].filter((part) => part.length > 0);
  return truncateSlug(parts.join('-'));
}

/** v0.7.1 §7.6.1: the inverse for the deploy dialog's prefill — an already published slug back to the editable middle. 剥掉前缀之后，再把**任何**已知难度后缀剥掉 —— 存量路径是带 `-hard` 这类后缀发布的，回填中段时应当把后缀留给「剥掉」而不是当成名字的一部分，否则重新部署会把后缀写死进新路径。 */
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

/** v0.8.5 §3.2：给**展示**用的短路径 —— 只剥掉 `puzzle-` 前缀（难度后缀留给 {@link splitSlug}），**地址本身不变**。 */
export function stripSlugPrefix(slug: string): string {
  const prefix = `${GAME_SLUG_PREFIX}-`;
  return slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
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
  /** v0.8.0（docs/v0.8.0.md §9）：`theme` 是 `/play/theme/:slug` 的第一段，被路由占了。 `GAME_SLUG_PATTERN` 只认字符集，不会拦它，所以必须在这里显式拒 —— 否则某个作者把自己那关命名成 `theme`，两条路由就撞在一起。 */
  if (GAME_SLUG_RESERVED.includes(slug)) {
    return `「${slug}」是保留路径，请换一个`;
  }
  return null;
}

/** §4.4: strips what a URL can never carry, so typing never leaves the field unsubmittable. A trailing `-` is kept while typing so `puzzle-` stays possible. */
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
