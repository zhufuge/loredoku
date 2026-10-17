/**
 * v0.5.5 CLEAN-02 (docs/v0.5.5.md §3): the one place the web tests read source
 * text. Every source-level suite used to repeat an 8-line `import.meta.glob`
 * prelude, which is 32 copies of the same three decisions — raw import, eager
 * load, `\r\n` normalisation.
 *
 * Paths are written **relative to `src/`**, so a test that lives beside its
 * subject writes `readSource('pages/GamePage.tsx')` and a test that lives
 * elsewhere writes the same string. No more `./` vs `../` key drift.
 *
 * The glob must stay a **literal** (Vite expands it statically) and it is
 * deliberately rooted at `/src/`, so it works from any test's directory.
 */

const files = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * v0.5.7: the only file **outside** `src/` the tests read — `index.html` carries
 * the pre-React theme script, so its storage key and fallback rule must be
 * asserted against `lib/theme.ts`. Kept here for the same reason as the map
 * above: one place decides how source text is loaded.
 */
const htmlFiles = import.meta.glob('/index.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Every source path under `src/`, test files included. */
export function sourceKeys(): string[] {
  return Object.keys(files).map((key) => key.replace(/^\/src\//, ''));
}

/** Every source path under `src/` **excluding** the test files themselves. */
export function productionKeys(): string[] {
  return sourceKeys().filter((path) => !path.includes('.test.'));
}

/**
 * Raw source of `src/<path>`, newline-normalised. Returns `''` for a path that
 * does not exist, so a typo fails an assertion instead of throwing.
 */
export function readSource(path: string): string {
  return (files[`/src/${path}`] ?? '').replace(/\r\n/g, '\n');
}

/**
 * `packages/web/index.html`, newline-normalised. Returns `''` when the glob
 * misses, so a broken pattern fails an assertion instead of passing silently.
 */
export function readIndexHtml(): string {
  return (htmlFiles['/index.html'] ?? '').replace(/\r\n/g, '\n');
}

/**
 * `[path, source]` pairs for every `.tsx` file **directly** inside `src/<dir>/`
 * — the replacement for the per-directory `import.meta.glob('./*.tsx')` prelude.
 *
 * Test files are included on purpose: a few suites scan a whole component
 * directory for a leftover (`onDragStart`, `setPointerCapture`, …) and the
 * removed case must stay gone from the tests that used to pin it, too.
 */
export function tsxIn(dir: string): Array<[string, string]> {
  const prefix = `/src/${dir}/`;
  return Object.entries(files)
    .filter(([key]) => key.startsWith(prefix) && key.endsWith('.tsx') && !key.slice(prefix.length).includes('/'))
    .map(([key, value]) => [key.replace(/^\/src\//, ''), value.replace(/\r\n/g, '\n')]);
}

/**
 * Block comments and full-line `//` comments removed.
 *
 * Needed by every assertion of the form "this string is gone": the comment that
 * *explains* the removal would otherwise keep the string present.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

/** {@link readSource} with comments already stripped. */
export function codeOf(path: string): string {
  return stripComments(readSource(path));
}

/**
 * The slice of `haystack` between two markers — the way a source-level test
 * talks about *one function* of a big file. Throws when either marker is gone,
 * so a rename fails loudly instead of silently testing an empty string.
 */
export function segment(haystack: string, startMarker: string, endMarker: string): string {
  const start = haystack.indexOf(startMarker);
  const end = haystack.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(`segment not found (start="${startMarker}", end="${endMarker}")`);
  }
  return haystack.slice(start, end);
}
