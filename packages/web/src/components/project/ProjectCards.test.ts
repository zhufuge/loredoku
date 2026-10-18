import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * v0.5.8 §2: 工作条目与版本条目**展示相同**、**操作相同**。
 *
 * 卡片与行都从「按 kind 分叉的一套 UI」收敛成同一套：名称后一个徽标
 * （`v{n}`，没有版本号的显示「草稿」），操作四个图标（编辑信息 / 预览 /
 * 复制 / 删除），卡片上后三个收在三点菜单里。
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
const menuSource = read('./EntryActionsMenu.tsx');

describe('ProjectGridCard (v0.5.8 §2)', () => {
  it('leads with the cover and falls back to the name initial', () => {
    expect(cardSource).toContain('{entry.coverUrl ? (');
    expect(cardSource).toContain('alt={entry.name}');
    // 无封面 → 取名称首字（与游戏卡片同一套占位）。
    expect(cardSource).toContain("const initial = entry.name.trim().charAt(0)");
    expect(cardSource).toContain('{initial}');
  });

  it('shrinks the cover to 4:3 and scales it inward on card hover', () => {
    // v0.5.8: 正方形封面在四列网格里太高，压住文字区；4:3 足够辨认。
    expect(cardSource).toContain('aspect-[4/3]');
    expect(cardSource).not.toContain('aspect-square');
    // 动效挂在 img 上，且是「向内缩小」（scale < 1）。
    expect(cardSource).toContain('group-hover:scale-95');
    expect(cardSource).toContain('transition-transform duration-200 ease-out');
    // 卡片本体带 group，否则 group-hover 没有作用域。
    expect(cardSource).toContain('group flex flex-col');
  });

  it('puts one badge after the name: v{n}, or 草稿 when there is none', () => {
    expect(cardSource).toContain('const versionNo = entry.versionNo ?? entry.currentVersionNo;');
    expect(cardSource).toContain("const badge = versionNo !== null ? `v${versionNo}` : '草稿';");
    // 旧的两种写法都不该再出现。
    expect(cardSource).not.toContain('已发布 v');
    expect(cardSource).not.toContain('地图 v');
    expect(cardSource).not.toContain("entry.kind === 'version'");
  });

  it('hides the size line until the canvas is initialised', () => {
    expect(cardSource).toContain('const size = entry.gridSize;');
    expect(cardSource).toContain('{size !== null ? (');
    expect(cardSource).not.toContain('{entry.gridSize} × {entry.gridSize}');
  });

  it('wires the primary action to onOpen', () => {
    const firstButton = cardSource.slice(cardSource.indexOf('<Button size="sm"'));
    expect(firstButton).toContain('onClick={() => onOpen(entry)}');
    expect(cardSource).toContain('进入编辑');
  });

  it('keeps exactly one delete button, outside the menu', () => {
    // 删除是破坏性操作，不进菜单；菜单里只有三项。
    expect(cardSource.match(/title="删除"/g)?.length ?? 0).toBe(1);
    expect(cardSource).toContain('<EntryActionsMenu');
  });
});

describe('EntryActionsMenu (v0.5.8 §2)', () => {
  it('holds the three non-destructive actions', () => {
    expect(menuSource).toContain('编辑信息');
    expect(menuSource).toContain('预览');
    expect(menuSource).toContain('复制');
  });

  it('previews the version entry, or the lineage latest for a work entry', () => {
    expect(menuSource).toContain('return entry.versionNo ?? entry.currentVersionNo;');
  });

  it('disables preview when the lineage has never been published', () => {
    expect(menuSource).toContain('const previewable = previewVersionNo(entry) !== null;');
    expect(menuSource).toContain('disabled={!previewable}');
  });

  it('closes on an outside pointerdown', () => {
    expect(menuSource).toContain("document.addEventListener('pointerdown', onPointerDown)");
    expect(menuSource).toContain("document.removeEventListener('pointerdown', onPointerDown)");
    // 菜单浮层用 UI_Z.drawer，不写裸 z-index。
    expect(menuSource).toContain('UI_Z.drawer');
    expect(menuSource).not.toMatch(/z-\[?\d/);
  });
});

describe('ProjectListRow (v0.5.8 §2)', () => {
  it('gains the same cover thumbnail', () => {
    expect(rowSource).toContain('h-10 w-16');
    expect(rowSource).toContain('{entry.coverUrl ? (');
    expect(rowSource).toContain("const initial = entry.name.trim().charAt(0) || '图';");
  });

  it('gives the version / time / action columns their own aligned slots', () => {
    // 版本列：等宽数字，v9 / v10 不错位。
    expect(rowSource).toContain('w-14 shrink-0 tabular-nums');
    // 时间列：右对齐 + 固定宽度。
    expect(rowSource).toContain('w-52 shrink-0 truncate text-right');
    // 操作列：固定宽度 + 右对齐。
    expect(rowSource).toContain('w-32 shrink-0 items-center justify-end');
    // n × n 不再是独立一列（创建时不再有尺寸，列会经常是空的）。
    expect(rowSource).not.toContain('{entry.gridSize} × {entry.gridSize}');
  });

  it('keeps the absolute time, not the relative form', () => {
    expect(rowSource).toContain('formatDateTime(entry.publishedAt ?? entry.updatedAt)');
    expect(rowSource).not.toContain('formatRelativeTime');
  });

  it('offers the same four icon actions for both entry kinds', () => {
    expect(rowSource).toContain('title="编辑信息"');
    expect(rowSource).toContain('title="复制"');
    expect(rowSource).toContain('title="删除"');
    // 预览按可用性禁用，而不是按 kind 整块消失。
    expect(rowSource).toContain('title={previewable ? \'预览已发布版本\' : \'还没有已发布的版本可预览\'}');
    expect(rowSource).toContain('disabled={!previewable}');
    // 两类条目共用一套 DOM —— 没有任何 kind 分叉。
    expect(rowSource).not.toContain("entry.kind === 'version'");
  });
});

describe('ProjectFormDialogs (v0.5.8 §1)', () => {
  it('offers the cover slot at the shared aspect ratio', () => {
    // 卡片与选择器共用同一个比例常量（shared 层的 `MAP_COVER_ASPECT`）。
    expect(formSource).toContain('style={{ aspectRatio: String(MAP_COVER_ASPECT) }}');
    expect(formSource).toContain('w-40 shrink-0');
  });

  it('no longer asks for the canvas size on create', () => {
    expect(formSource).not.toContain('gridSize');
    expect(formSource).not.toContain('GRID_SIZE_DEFAULT');
    expect(formSource).toContain('创建后进入编辑器，先设置画布尺寸。');
    // 编辑对话框的旧文案「画布尺寸不可修改」也走了。
    expect(formSource).not.toContain('画布尺寸不可修改');
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
