import { describe, expect, it } from 'vitest';
import { codeOf } from '@/testing/source';
import {
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_LEVELS,
  GAME_DIFFICULTY_TEXT_COLORS,
} from '@loredoku/shared';

/**
 * v0.5.4 (docs/v0.5.4.md) — the fixes whose durable contract is **wiring**:
 * which constant, which component. Every source file is read as raw text, and
 * the assertions are stripped of comments first (`codeOf`) so a note about a
 * removed string can never satisfy「它已经不在了」.
 */

const itemsPage = codeOf('pages/ItemsPage.tsx');
const itemForm = codeOf('components/item/ItemDetailForm.tsx');
const itemDialog = codeOf('components/item/CreateItemDialog.tsx');
const itemPanel = codeOf('components/item/ItemListPanel.tsx');
const characterPanel = codeOf('components/character/CharacterListPanel.tsx');
const appearanceField = codeOf('components/appearance/AppearanceField.tsx');
const puzzleInfo = codeOf('components/puzzle/PuzzleInfoDrawer.tsx');
const editorPage = codeOf('pages/PuzzleEditorPage.tsx');
const gameCard = codeOf('components/game/GameCard.tsx');
const deployDialog = codeOf('components/game/GameDeployDialog.tsx');

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
  it('keeps the rule but drops its caption', () => {
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

