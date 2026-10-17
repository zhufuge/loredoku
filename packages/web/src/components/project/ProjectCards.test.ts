import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * FEAT-H03（docs/v0.4.2.md §3）+ OPT-H04（§4）+ v0.5.0 FEAT-K09（§7.1）。
 *
 * 一条目要么是**工作条目**要么是**版本条目**，徽标与操作随 `entry.kind` 分叉
 * （版本条目只读）。表单侧的新建走「先建后传」两步串行，失败时可重试。
 *
 * 渲染 `ProjectGridCard` 需要 TanStack Query 的 provider 与 router，因此沿用本仓
 * 惯用的源码断言语境（同 `EditorPage.infoDrawer.test.ts`）。
 */

/** Drop JSDoc blocks so the assertions below only look at the code. */
function read(path: string): string {
  return stripBlockComments(readSource(`components/project/${path.replace(/^\.\//, '')}`));
}

function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

const cardSource = read('./ProjectGridCard.tsx');
const rowSource = read('./ProjectListRow.tsx');
const formSource = read('./ProjectFormDialogs.tsx');

describe('ProjectGridCard (FEAT-H03 §3.2d + OPT-H04 §4.2b)', () => {
  it('leads with the cover and falls back to the name initial', () => {
    // v0.5.3 SPEC-N04: square — the board is `n × n`, so its cover is square
    // and a 16:10 frame only cut the top and bottom off.
    expect(cardSource).toContain('aspect-square');
    expect(cardSource).not.toContain('aspect-[16/10]');
    expect(cardSource).toContain('{entry.coverUrl ? (');
    expect(cardSource).toContain('alt={entry.name}');
    // 无封面 → 取名称首字（与游戏卡片同一套占位）。
    expect(cardSource).toContain('const initial = entry.name.trim().charAt(0)');
    expect(cardSource).toContain('{initial}');
  });

  it('shows n × n plus a relative update time (absolute on hover)', () => {
    expect(cardSource).toContain('{entry.gridSize} × {entry.gridSize}');
    expect(cardSource).toContain('title={formatDateTime(entry.updatedAt)}');
    expect(cardSource).toContain('formatRelativeTime(entry.updatedAt)');
  });

  it('collapses the description line when there is none', () => {
    expect(cardSource).toContain('{entry.description ? (');
  });

  it('wires the primary action to onOpen', () => {
    const firstButton = cardSource.slice(cardSource.indexOf('<Button size="sm"'));
    expect(firstButton).toContain('onClick={() => onOpen(entry)}');
  });
});

describe('ProjectGridCard 条目并集 (FEAT-K09 §7.1)', () => {
  it('carries a version badge per entry kind', () => {
    expect(cardSource).toContain("const isVersion = entry.kind === 'version';");
    expect(cardSource).toContain("`v${entry.versionNo ?? ''}`");
    expect(cardSource).toContain("`已发布 v${entry.currentVersionNo}`");
  });

  it('gives version entries the read-only actions only', () => {
    expect(cardSource).toContain('onPreview?.(entry)');
    expect(cardSource).toContain('onNewPuzzle?.(entry)');
    expect(cardSource).toContain('onEditVersion?.(entry)');
  });

  it('never offers rename / cover on a version entry (SPEC-K11)', () => {
    const versionBranch = cardSource.slice(
      cardSource.indexOf('isVersion ? ('),
      cardSource.indexOf(') : ('),
    );
    expect(versionBranch).not.toContain('onRename');
    expect(versionBranch).not.toContain('onDuplicate');
    // 编辑信息（铅笔）只属于工作条目分支。
    const workBranch = cardSource.slice(cardSource.lastIndexOf(') : ('));
    expect(workBranch).toContain('onRename(entry)');
    expect(workBranch).toContain('onDuplicate(entry)');
  });
});

describe('ProjectListRow (OPT-H04 §4.2c + FEAT-K09 §7.1)', () => {
  it('gains the same cover thumbnail', () => {
    expect(rowSource).toContain('h-10 w-16');
    expect(rowSource).toContain('{entry.coverUrl ? (');
    expect(rowSource).toContain("const initial = entry.name.trim().charAt(0) || '图';");
  });

  it('loses both count columns but keeps the absolute time', () => {
    expect(rowSource).not.toContain('cardCount');
    expect(rowSource).not.toContain('regionCount');
    expect(rowSource).toContain('formatDateTime(entry.updatedAt)');
    // The list deliberately keeps the exact value — no relative form here.
    expect(rowSource).not.toContain('formatRelativeTime');
  });

  it('mirrors the card entry-kind split', () => {
    expect(rowSource).toContain("const isVersion = entry.kind === 'version';");
    expect(rowSource).toContain('onEditVersion?.(entry)');
    expect(rowSource).toContain('formatDateTime(entry.publishedAt ?? entry.updatedAt)');
  });
});

describe('ProjectFormDialogs cover picker (FEAT-H03 §3.2b/c)', () => {
  it('offers the cover slot at the shared aspect ratio', () => {
    // 卡片与选择器共用同一个比例常量（shared 层的 `MAP_COVER_ASPECT`）。
    expect(formSource).toContain('style={{ aspectRatio: String(MAP_COVER_ASPECT) }}');
    expect(formSource).toContain('w-40 shrink-0');
  });

  it('pre-validates the file before spending a request', () => {
    expect(formSource).toContain('function coverProblem(file: File): string | null {');
  });

  it('creates the map first, then uploads the cover — serially', () => {
    const createAt = formSource.indexOf('project = await createMutation.mutateAsync({');
    const uploadAt = formSource.indexOf(
      'await uploadMutation.mutateAsync({ id: project.id, file: cover });',
    );
    expect(createAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(createAt);
    // No `Promise.all`: the cover endpoint needs the id the create call returns.
    expect(formSource).not.toContain('Promise.all');
  });

  it('surfaces a failed cover upload with a retry instead of losing the map', () => {
    expect(formSource).toContain('const [createdId, setCreatedId] = useState<number | null>(null);');
    expect(formSource).toContain('const [coverFailed, setCoverFailed] = useState(false);');
    // The retry reuses the id it already holds instead of creating a second map.
    expect(formSource).toContain('if (createdId !== null) {');
    expect(formSource).toContain('await uploadMutation.mutateAsync({ id: createdId, file: cover });');
  });

  it('the edit dialog can remove the cover', () => {
    // 移除走 DELETE 端点。
    expect(formSource).toContain('removeCover');
  });
});
