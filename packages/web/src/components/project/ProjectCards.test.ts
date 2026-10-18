import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * v0.5.8 §2: 工作条目与版本条目**展示相同**，操作大部分相同。
 *
 * v0.5.9 §2/§3/§6 修三处：
 * - 徽标只看 `versionNo`（版本条目才 `v{n}`，工作条目一律「草稿」）；
 * - 封面默认放大裁中间、hover 缩回全图；
 * - 卡片主按钮按 kind 分叉（版本条目 → 自己的只读预览）。
 *
 * v0.5.8 §13 裁定再收一处：**「复制」只属于工作条目** —— 版本是冻结快照，
 * 复制它既不能改（版本行不可写）也产不出有用的新图。两类条目共同的只剩
 * 编辑信息 / 预览 / 删除。
 *
 * 卡片与行从「按 kind 分叉的一套 UI」收敛成同一套：名称后一个徽标，卡片上
 * 非破坏性操作收在三点菜单里，破坏性的删除独立在外。
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

  it('v0.5.9 §3: crops the cover zoomed-in and reveals it all on card hover', () => {
    // v0.5.8: 正方形封面在四列网格里太高，压住文字区；4:3 足够辨认。
    expect(cardSource).toContain('aspect-[4/3]');
    expect(cardSource).not.toContain('aspect-square');
    // 默认 scale > 1（放大裁中间，overflow-hidden 切四边），hover 回 1 展示全部。
    expect(cardSource).toContain('scale-[1.2] group-hover:scale-100');
    expect(cardSource).toContain('transition-transform duration-200 ease-out');
    expect(cardSource).not.toContain('group-hover:scale-95');
    // 卡片本体带 group，否则 group-hover 没有作用域。
    expect(cardSource).toContain('group flex flex-col');
  });

  it('v0.5.9 §2: badges v{n} for version entries only, 草稿 otherwise', () => {
    expect(cardSource).toContain('const badge = entry.versionNo !== null ? `v${entry.versionNo}` : \'草稿\';');
    // currentVersionNo 不再是徽标来源 —— 发布过的工作条目也是「草稿」。
    expect(cardSource).not.toContain('currentVersionNo');
    // 旧的两种写法都不该再出现。
    expect(cardSource).not.toContain('已发布 v');
    expect(cardSource).not.toContain('地图 v');
    // 行同款徽标。
    expect(rowSource).toContain('const badge = entry.versionNo !== null ? `v${entry.versionNo}` : \'草稿\';');
    expect(rowSource).not.toContain('currentVersionNo');
  });

  it('v0.5.9 §2: drops the 共 N 个版本 meta line', () => {
    expect(cardSource).not.toContain('versionCount');
    expect(cardSource).not.toContain('共 ');
  });

  it('hides the size line until the canvas is initialised', () => {
    expect(cardSource).toContain('const size = entry.gridSize;');
    expect(cardSource).toContain('{size !== null ? (');
    expect(cardSource).not.toContain('{entry.gridSize} × {entry.gridSize}');
  });

  it('v0.5.8 §13: the primary button forks by entry kind', () => {
    expect(cardSource).toContain("const isVersion = entry.kind === 'version';");
    const firstButton = cardSource.slice(cardSource.indexOf('<Button size="sm"'));
    expect(firstButton).toContain('onClick={() => onOpen(entry)}');
    // 版本条目走「以此为底稿新建」：带 ?v= 进编辑器，保存时才生成草稿；
    // 只读预览留给菜单 / 列表里的眼睛图标。
    expect(firstButton).toContain("{isVersion ? '以此为底稿新建' : '进入编辑'}");
    expect(cardSource).toContain("title={`${isVersion ? '以此为底稿新建' : '进入编辑'}：${entry.name}`}");
  });

  it('keeps exactly one delete button, outside the menu', () => {
    // 删除是破坏性操作，不进菜单。
    expect(cardSource.match(/title="删除"/g)?.length ?? 0).toBe(1);
    expect(cardSource).toContain('<EntryActionsMenu');
  });
});

describe('EntryActionsMenu (v0.5.8 §2)', () => {
  it('holds the actions a card exposes', () => {
    expect(menuSource).toContain('编辑信息');
    expect(menuSource).toContain('预览');
  });

  it('v0.5.8 第三阶段：编辑信息只属于工作条目，版本条目不渲染', () => {
    // 合并后版本行确实有自己的 name / description / cover 快照列，但那些是
    // 冻结值 —— 能改名就破坏了「版本不可变」（设计 §11 第 9 条）。
    const editAt = menuSource.indexOf('编辑信息');
    const guardAt = menuSource.lastIndexOf("entry.kind !== 'version' ? (", editAt);
    expect(guardAt).toBeGreaterThan(-1);
    expect(menuSource.slice(guardAt, editAt)).toContain('onEditInfo');
  });

  it('v0.5.8 §13: 复制只属于工作条目，版本条目不渲染', () => {
    // 版本是冻结快照：复制它既不能改（版本行不可写）也产不出有用的新图，
    // 想基于某版本继续做事走编辑器内版本历史面板的 fork。
    expect(menuSource).toContain("entry.kind !== 'version' ? (");
    expect(menuSource).toContain('复制');
  });

  it('previews the version entry, or the lineage latest for a work entry', () => {
    expect(menuSource).toContain('return entry.versionNo ?? entry.currentVersionNo;');
  });

  it('disables preview when the lineage has never been published', () => {
    expect(menuSource).toContain('const previewable = previewVersionNo(entry) !== null;');
    expect(menuSource).toContain('disabled={!previewable}');
  });

  it('v0.5.9 §1: portals the menu to <body> so the card cannot clip it', () => {
    // 卡片 overflow-hidden（封面圆角）会裁掉探出下沿的 absolute 菜单。
    expect(menuSource).toContain('createPortal');
    expect(menuSource).toContain('createPortal(menu, document.body)');
    expect(menuSource).toContain("position: 'fixed'");
    // 浮层跟随按钮：量 rect + scroll/resize 同步。
    expect(menuSource).toContain('getBoundingClientRect');
    expect(menuSource).toContain("window.addEventListener('scroll', sync, true)");
  });

  it('closes on an outside pointerdown', () => {
    expect(menuSource).toContain("document.addEventListener('pointerdown', onPointerDown)");
    expect(menuSource).toContain("document.removeEventListener('pointerdown', onPointerDown)");
    // 菜单浮层用 UI_Z.drawer，不写裸 z-index。
    expect(menuSource).toContain('UI_Z.drawer');
    expect(menuSource).not.toMatch(/z-\[?\d/);
    // portal 之后菜单不在 container 里 —— 外部关闭必须排除菜单自身，
    // 否则 pointerdown 先卸载浮层、菜单项的 click 永远不触发。
    expect(menuSource).toContain('menuRef.current?.contains(target)');
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

  it('offers the same icon actions for both kinds, minus 编辑信息 / 复制 on versions', () => {
    expect(rowSource).toContain('title="编辑信息"');
    expect(rowSource).toContain('title="删除"');
    // 预览按可用性禁用，而不是按 kind 整块消失。
    expect(rowSource).toContain('title={previewable ? \'预览已发布版本\' : \'还没有已发布的版本可预览\'}');
    // v0.5.8 §13 + 第三阶段：编辑信息与复制都按 kind 条件渲染 —— 版本条目都没有。
    const guards = rowSource.split("entry.kind !== 'version' ? (").length - 1;
    expect(guards).toBe(2);
    expect(rowSource).toContain('title="复制"');
    expect(rowSource).toContain('disabled={!previewable}');
  });

  it('v0.5.8 §13: 主点击标题按 kind 分叉（版本条目 = 以此为底稿新建）', () => {
    // 版本条目带 ?v= 进编辑器、保存时才生成草稿；眼睛图标仍去只读预览。
    expect(rowSource).toContain("const openTitle = entry.kind === 'version' ? '以此为底稿新建' : '进入编辑';");
    expect(rowSource).toContain('title={`${openTitle}：${entry.name}`}');
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
