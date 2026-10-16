import { describe, expect, it } from 'vitest';
import { UI_Z } from '@loredoku/shared';

/**
 * v0.5.3 — the six puzzle-editor items (docs/v0.5.3.md §6).
 *
 * Same technique as `itemForms.v052.test.ts`: these pages carry a lot of
 * surrounding state, so the durable contract is asserted on the
 * **comment-free** source, plus one plain runtime assertion for the layer order
 * (`UI_Z`), which is a value and not a shape.
 *
 * Glob patterns must be literals; each directory gets its own call.
 */

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

function read(glob: Record<string, string>, key: string): string {
  return stripComments((glob[key] ?? '').replace(/\r\n/g, '\n'));
}

const puzzleDir = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const editorDir = import.meta.glob('../editor/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const mapDir = import.meta.glob('../map/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const uiDir = import.meta.glob('../ui/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const pagesDir = import.meta.glob('../../pages/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const pageSource = read(pagesDir, '../../pages/PuzzleEditorPage.tsx');
const puzzlesPage = read(pagesDir, '../../pages/PuzzlesPage.tsx');
const leftPanel = read(puzzleDir, './PuzzleEditorLeftPanel.tsx');
const puzzleInfo = read(puzzleDir, './PuzzleInfoDrawer.tsx');
const participantDrawer = read(editorDir, '../editor/ParticipantDrawer.tsx');
const infoDrawer = read(editorDir, '../editor/EditorInfoDrawer.tsx');
const linkageDialog = read(editorDir, '../editor/LinkageDialog.tsx');
const rulerStrips = read(mapDir, '../map/MapRulerStrips.tsx');
const colorPalette = read(uiDir, '../ui/color-palette.tsx');

describe('谜题列表项编辑按钮（FEAT-N05）', () => {
  it('opens the editor from the row', () => {
    expect(puzzlesPage).toContain('navigate(`/puzzles/${puzzle.id}/edit`)');
  });

  it('keeps the five columns and their order', () => {
    expect(puzzlesPage).toContain(
      "const COLUMNS = ['名称', '版本', '部署状态', '发布时间', '操作'] as const;",
    );
  });
});

describe('角色框可收起展开 + 筛选（FEAT-N08）', () => {
  it('collapses to a rail and expands back', () => {
    expect(leftPanel).toContain('const [collapsed, setCollapsed] = useState(false);');
    expect(leftPanel).toContain('onClick={() => setCollapsed(true)}');
    expect(leftPanel).toContain('onClick={() => setCollapsed(false)}');
    expect(leftPanel).toContain('w-10 shrink-0');
    expect(leftPanel).toContain('w-[280px] shrink-0');
  });

  it('filters on 名称 and 业务 ID, case-insensitively', () => {
    expect(leftPanel).toContain('const [keyword, setKeyword] = useState(\'\');');
    expect(leftPanel).toContain('placeholder="搜索名称 / 业务 ID"');
    expect(leftPanel).toContain('character.name.toLowerCase().includes(needle)');
    expect(leftPanel).toContain('character.code.toLowerCase().includes(needle)');
  });

  it('distinguishes 「没有匹配的角色」 from 「暂无角色」', () => {
    expect(leftPanel).toContain('没有匹配的角色');
    expect(leftPanel).toContain('暂无角色');
  });
});

describe('主题色调色板（FEAT-N09）', () => {
  it('one shared swatch grid — the participant theme colour is its only home', () => {
    expect(colorPalette).toContain('THEME_COLOR_PALETTE.map(');
    expect(colorPalette).toContain('data-testid="color-palette"');
    // 参与者主题色（v0.5.3 FEAT-N09）
    expect(read(editorDir, '../editor/ThemeColorDialog.tsx')).toContain('<ColorPalette');
    // FIX-O16 (docs/v0.5.4.md §7.3): the 基本信息 palette was removed again —
    // a colour is picked with the `ColorInput` + hex field, not a swatch grid.
    expect(puzzleInfo).not.toContain('<ColorPalette');
    expect(puzzleInfo).toContain('<ColorInput');
  });
});

describe('参与者信息框在头部栏下方（FIX-N10）', () => {
  it('renders inside the row below the header, not under the page root', () => {
    // The page root is deliberately NOT positioned — otherwise `inset-y-0`
    // would resolve against the viewport again.
    expect(pageSource).toContain('<div className="flex h-screen flex-col overflow-hidden">');
    expect(pageSource).toContain('<div className="relative flex min-h-0 flex-1">');
    // …and the drawer comes after `</main>`, i.e. inside that relative row.
    expect(pageSource.indexOf('<ParticipantDrawer')).toBeGreaterThan(pageSource.indexOf('</main>'));
  });
});

describe('标尺层低于方格信息框（FIX-N11）', () => {
  it('orders the three panels in one shared constant', () => {
    expect(UI_Z.ruler).toBeLessThan(UI_Z.infoDrawer);
    expect(UI_Z.infoDrawer).toBeLessThan(UI_Z.drawer);
  });

  it('every panel reads the constant instead of a literal z-* class', () => {
    expect(rulerStrips).toContain('zIndex: UI_Z.ruler');
    expect(rulerStrips).not.toContain('z-30');
    expect(infoDrawer).toContain('zIndex: UI_Z.infoDrawer');
    expect(puzzleInfo).toContain('zIndex: UI_Z.infoDrawer');
    expect(participantDrawer).toContain('zIndex: UI_Z.drawer');
  });
});

describe('联动 · 物品显示名称（业务 ID）（FIX-N12）', () => {
  it('drops the `#主键` prefix', () => {
    expect(linkageDialog).not.toContain('#{item.itemId}');
    expect(linkageDialog).toContain('{item.name}');
    expect(linkageDialog).toContain('{item.code ?');
  });

  it('carries 业务 ID on the option', () => {
    expect(linkageDialog).toContain('code: string;');
    expect(participantDrawer).toContain('code: item.code,');
    expect(pageSource).toContain('code: itemsById.get(cell.object.itemId)?.code ?? \'\',');
  });
});

describe('位置条件保存后不再冒出方格信息栏（FIX-N13）', () => {
  it('the region callback is guarded like the cell one', () => {
    // `selectCellAt` reports cell **and** region; both must ignore a pick click.
    expect(pageSource).toContain('if (positionPickSlot !== null) return;');
  });

  it('saving closes the drawer and leaves no focus behind', () => {
    expect(pageSource).toContain('puzzle.setSelectedSlot(null);');
    expect(pageSource).toContain('puzzle.setSelection(null);');
    expect(pageSource).toContain('setInfoOpen(false);');
  });
});
