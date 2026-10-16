import { describe, expect, it } from 'vitest';

/**
 * FEAT-H03（docs/v0.4.2.md §3）+ OPT-H04（§4）。
 *
 * 卡片与列表行都重排过：封面成为卡片的头、去掉「卡片 N」「区域 N」两列/两块，
 * 卡片用相对时间、列表保留绝对时间。表单侧新增封面选择器，新建走「先建后传」的
 * 两步串行，失败时可重试。
 *
 * 渲染 `ProjectGridCard` 需要 TanStack Query 的 provider 与 router，因此沿用本仓
 * 惯用的源码断言语境（同 `EditorPage.infoDrawer.test.ts`）。
 */

function read(path: string): string {
  const raw =
    (import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
      string,
      string
    >)[path] ?? '';
  // Drop JSDoc blocks: the 「去掉卡片 N」 comments still name what was removed,
  // and the assertions below must only look at the code.
  return stripBlockComments(raw.replace(/\r\n/g, '\n'));
}

function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

const cardSource = read('./ProjectGridCard.tsx');
const rowSource = read('./ProjectListRow.tsx');
const formSource = read('./ProjectFormDialogs.tsx');

describe('ProjectGridCard (FEAT-H03 §3.2d + OPT-H04 §4.2b)', () => {
  it('leads with the cover and falls back to the name initial', () => {
    expect(cardSource).toContain('aspect-[16/10]');
    expect(cardSource).toContain('{project.coverUrl ? (');
    expect(cardSource).toContain('alt={project.name}');
    // 无封面 → 取名称首字（与游戏卡片同一套占位）。
    expect(cardSource).toContain("const initial = project.name.trim().charAt(0) || '图';");
    expect(cardSource).toContain('{initial}');
  });

  it('drops 「卡片 N」 / 「区域 N」', () => {
    expect(cardSource).not.toContain('cardCount');
    expect(cardSource).not.toContain('regionCount');
    expect(cardSource).not.toContain('卡片');
    expect(cardSource).not.toContain('区域');
  });

  it('shows n × n plus a relative update time (absolute on hover)', () => {
    expect(cardSource).toContain('{project.gridSize} × {project.gridSize}');
    expect(cardSource).toContain('title={formatDateTime(updatedAt)}');
    expect(cardSource).toContain('{formatRelativeTime(updatedAt)}更新');
  });

  it('collapses the description line when there is none', () => {
    expect(cardSource).toContain('{project.description ? (');
    expect(cardSource).not.toContain('暂无描述');
  });

  it('keeps the four actions, with 编辑 as the primary one', () => {
    expect(cardSource).toContain('编辑');
    expect(cardSource).toContain('title="编辑信息"');
    expect(cardSource).toContain('title="复制"');
    expect(cardSource).toContain('title="删除"');
    const firstButton = cardSource.slice(cardSource.indexOf('<Button size="sm"'));
    expect(firstButton).toContain('onClick={() => onOpen(project)}');
  });
});

describe('ProjectListRow (OPT-H04 §4.2c)', () => {
  it('gains the same cover thumbnail', () => {
    expect(rowSource).toContain('h-10 w-16');
    expect(rowSource).toContain('{project.coverUrl ? (');
    expect(rowSource).toContain("const initial = project.name.trim().charAt(0) || '图';");
  });

  it('loses both count columns but keeps the absolute time', () => {
    expect(rowSource).not.toContain('cardCount');
    expect(rowSource).not.toContain('regionCount');
    expect(rowSource).not.toContain('卡片');
    expect(rowSource).not.toContain('区域');
    expect(rowSource).toContain('{formatDateTime(project.updatedAt)}');
    // The list deliberately keeps the exact value — no relative form here.
    expect(rowSource).not.toContain('formatRelativeTime');
  });
});

describe('ProjectFormDialogs cover picker (FEAT-H03 §3.2b/c)', () => {
  it('offers the cover slot with the 16:10 preview and an empty state', () => {
    expect(formSource).toContain('封面（可选）');
    expect(formSource).toContain('未设置封面');
    expect(formSource).toContain('alt="封面预览"');
    expect(formSource).toContain('alt="当前封面"');
    // 卡片与选择器共用同一个比例常量（shared 层的 `MAP_COVER_ASPECT`）。
    expect(formSource).toContain('style={{ aspectRatio: String(MAP_COVER_ASPECT) }}');
    expect(formSource).toContain('w-40 shrink-0');
  });

  it('pre-validates the file before spending a request', () => {
    expect(formSource).toContain('function coverProblem(file: File): string | null {');
    expect(formSource).toContain('封面不能超过 ${COVER_MAX_MB} MB');
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
    expect(formSource).toContain('地图已创建，但封面未上传成功。可以「重试上传」，或直接关闭（之后再编辑补上）。');
    expect(formSource).toContain("'重试上传'");
    expect(formSource).toContain("'关闭'");
    // The retry reuses the id it already holds instead of creating a second map.
    expect(formSource).toContain('if (createdId !== null) {');
    expect(formSource).toContain('await uploadMutation.mutateAsync({ id: createdId, file: cover });');
  });

  it('the edit dialog switches between 沿用 / 替换 / 移除', () => {
    expect(formSource).toContain('当前为该地图的封面。');
    expect(formSource).toContain('已选择：${file.name}');
    // 移除走 DELETE 端点。
    expect(formSource).toContain('removeCover');
  });
});
