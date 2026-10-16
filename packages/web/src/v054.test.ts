import { describe, expect, it } from 'vitest';
import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_LEVELS,
  GAME_DIFFICULTY_TEXT_COLORS,
} from '@loredoku/shared';

/**
 * v0.5.4 (docs/v0.5.4.md) — the fixes whose durable contract is **wiring**:
 * which constant, which component, which text. Same technique as
 * `wording.test.ts`: every source file is read with `?raw`, and the assertions
 * are stripped of comments first (`stripComments`) so a note about a removed
 * string can never satisfy「它已经不在了」.
 */

const sources = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

function code(path: string): string {
  return stripComments((sources[path] ?? '').replace(/\r\n/g, '\n'));
}

const itemsPage = code('./pages/ItemsPage.tsx');
const itemForm = code('./components/item/ItemDetailForm.tsx');
const itemDialog = code('./components/item/CreateItemDialog.tsx');
const itemPanel = code('./components/item/ItemListPanel.tsx');
const characterPanel = code('./components/character/CharacterListPanel.tsx');
const appearanceField = code('./components/appearance/AppearanceField.tsx');
const leftPanel = code('./components/puzzle/PuzzleEditorLeftPanel.tsx');
const puzzleInfo = code('./components/puzzle/PuzzleInfoDrawer.tsx');
const editorPage = code('./pages/PuzzleEditorPage.tsx');
const gameCard = code('./components/game/GameCard.tsx');
const deployDialog = code('./components/game/GameDeployDialog.tsx');

describe('难度 tag 淡化（FEAT-O01）', () => {
  it('gives every level a tint and a matching dark label', () => {
    expect(Object.keys(GAME_DIFFICULTY_COLORS).sort()).toEqual([...GAME_DIFFICULTY_LEVELS].sort());
    expect(Object.keys(GAME_DIFFICULTY_TEXT_COLORS).sort()).toEqual(
      [...GAME_DIFFICULTY_LEVELS].sort(),
    );
  });

  it('the card and the deploy dialog print the label in the dark tone', () => {
    expect(gameCard).toContain('GAME_DIFFICULTY_TEXT_COLORS[game.difficulty]');
    expect(gameCard).not.toContain('text-white');
    expect(deployDialog).toContain('GAME_DIFFICULTY_TEXT_COLORS[level]');
    expect(deployDialog).not.toContain('text-white');
  });
});

describe('/items 四项（FIX-O08 ~ FEAT-O11）', () => {
  it('drops both explanatory captions', () => {
    expect(itemForm).not.toContain('背景类型恒定可站立');
    expect(appearanceField).not.toContain('不上传图片也能启用');
    // The rule itself is untouched — only its caption went away.
    expect(itemForm).toContain('canStand: canStandFor(category, canStand),');
  });

  it('clips the list to the frame corners', () => {
    expect(itemPanel).toContain('overflow-hidden rounded-lg border');
    expect(characterPanel).toContain('overflow-hidden rounded-lg border');
  });

  it('gives the colour block a grey translucent edge', () => {
    expect(appearanceField).toContain('border border-black/20');
  });

  it('turns 分类 into buttons everywhere it appears', () => {
    expect(itemsPage).toContain('<SegmentedRadio');
    expect(itemDialog).toContain('<SegmentedRadio');
    expect(itemForm).toContain('<SegmentedRadio');
    // The create dialog had exactly one dropdown — 分类 — and it is gone.
    expect(itemDialog).not.toContain('<select');
    // The detail form keeps only 图片填充方式.
    expect(itemForm.split('<select').length - 1).toBe(1);
  });
});

describe('谜题编辑器五项（FIX-O14 ~ FIX-O18）', () => {
  it('no longer explains how to use the roster', () => {
    expect(leftPanel).not.toContain('点击角色可选中');
    expect(leftPanel).not.toContain('再从参与者区拖拽完成放置');
    // The 加入 button itself is, of course, still there.
    expect(leftPanel).toContain('已加入');
  });

  it('identifies a palette row by index, so renaming never remounts it', () => {
    // FIX-O17: `${entry.key}-${index}` remounted the row on every keystroke.
    expect(puzzleInfo).toContain('<li key={index}');
    expect(puzzleInfo).not.toContain('${entry.key}-${index}');
  });

  it('remembers the timestamp its own save wrote back', () => {
    // FIX-O18: without this the save's `setQueryData` re-seeds the store.
    expect(editorPage).toContain('lastSavedAtRef');
    expect(editorPage).toContain('lastSavedAtRef.current = savedAt');
    expect(editorPage).toContain(
      'if (lastSavedAtRef.current !== null && detailQuery.data.updatedAt === lastSavedAtRef.current) {',
    );
  });
});

describe('琢玉台只挂在 logo 后面（SPEC-O19）', () => {
  const router = code('./router.tsx');
  const appShell = code('./components/layout/AppShell.tsx');
  const mapsPage = code('./pages/MapsPage.tsx');
  const gamesPage = code('./pages/GamesPage.tsx');

  it('the wordmark gains the suffix on /maps', () => {
    expect(appShell).toContain("const ZHUYUTAI_SUFFIX = ' · 琢玉台'");
    expect(appShell).toContain('suffix={onMaps ? ZHUYUTAI_SUFFIX : undefined}');
    // …but the nav label and the page are still 地图.
    expect(appShell).toContain("label: '地图'");
    expect(appShell).not.toContain("label: '琢玉台'");
  });

  it('the map page itself keeps speaking 地图', () => {
    expect(mapsPage).toContain("document.title = '地图 · 格物'");
    expect(mapsPage).toContain('>地图</h1>');
    expect(mapsPage).not.toContain('琢玉台');
    expect(mapsPage).toContain('新建地图');
  });

  it('the route is /maps and the games home still offers 进入琢玉台', () => {
    expect(router).toContain("path: 'maps'");
    expect(router).toContain("<Navigate to=\"/maps\" replace />");
    expect(router).toContain("<Navigate to=\"/play\" replace />");
    expect(gamesPage).toContain('进入琢玉台');
  });
});
