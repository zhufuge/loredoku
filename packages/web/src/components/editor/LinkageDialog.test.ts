import { describe, expect, it } from 'vitest';
import type { ParticipantTarget } from '@murdoku/shared';
import {
  buildLinkages,
  draftFromLinkage,
  EMPTY_LINKAGE_DRAFT,
  isLinkageDraftValid,
} from '@/components/editor/LinkageDialog';

describe('draftFromLinkage (MOD-801 edit refill)', () => {
  it('add mode starts from an empty character draft', () => {
    expect(draftFromLinkage(null)).toEqual(EMPTY_LINKAGE_DRAFT);
  });

  it('refills a character linkage', () => {
    expect(
      draftFromLinkage({ type: 'character', id: 7, effect: 'highlight', color: 'blue' }),
    ).toMatchObject({ type: 'character', characterIds: [7], color: 'blue' });
  });

  it('refills an item linkage with scope + instances', () => {
    const draft = draftFromLinkage({
      type: 'item',
      id: 12,
      scope: 'instances',
      instances: [[1, 2]],
      effect: 'highlight',
      color: 'red',
    });
    expect(draft).toMatchObject({
      type: 'item',
      itemId: 12,
      itemScope: 'instances',
      itemInstances: [[1, 2]],
    });
  });

  it('refills a cell linkage', () => {
    const draft = draftFromLinkage({
      type: 'cell',
      cells: [[2, 2], [3, 2]],
      effect: 'highlight',
      color: 'red',
    });
    expect(draft.cells).toEqual([[2, 2], [3, 2]]);
  });

  it('refills a region linkage', () => {
    expect(
      draftFromLinkage({ type: 'region', id: 'rg_a', effect: 'highlight', color: 'blue' }),
    ).toMatchObject({ type: 'region', regionIds: ['rg_a'] });
  });
});

describe('buildLinkages (MOD-801 multi-object expansion)', () => {
  it('expands multi-selected characters into one entry per id', () => {
    const linkages = buildLinkages({
      ...EMPTY_LINKAGE_DRAFT,
      type: 'character',
      characterIds: [7, 9, 11],
      color: 'red',
    });
    expect(linkages).toEqual<ParticipantTarget[]>([
      { type: 'character', id: 7, effect: 'highlight', color: 'red' },
      { type: 'character', id: 9, effect: 'highlight', color: 'red' },
      { type: 'character', id: 11, effect: 'highlight', color: 'red' },
    ]);
  });

  it('expands multi-selected regions into one entry per id', () => {
    const linkages = buildLinkages({
      ...EMPTY_LINKAGE_DRAFT,
      type: 'region',
      regionIds: ['rg_a', 'rg_b'],
      color: 'blue',
    });
    expect(linkages).toHaveLength(2);
    expect(linkages[0]).toMatchObject({ type: 'region', id: 'rg_a', color: 'blue' });
  });

  it('stores item scope all without instances', () => {
    const linkages = buildLinkages({
      ...EMPTY_LINKAGE_DRAFT,
      type: 'item',
      itemId: 12,
      itemScope: 'all',
      color: 'blue',
    });
    expect(linkages).toEqual([
      { type: 'item', id: 12, scope: 'all', effect: 'highlight', color: 'blue' },
    ]);
    expect('instances' in linkages[0]!).toBe(false);
  });

  it('stores item scope instances with coords', () => {
    const linkages = buildLinkages({
      ...EMPTY_LINKAGE_DRAFT,
      type: 'item',
      itemId: 12,
      itemScope: 'instances',
      itemInstances: [[1, 2], [3, 4]],
      color: 'red',
    });
    expect(linkages).toEqual([
      {
        type: 'item',
        id: 12,
        scope: 'instances',
        instances: [[1, 2], [3, 4]],
        effect: 'highlight',
        color: 'red',
      },
    ]);
  });

  it('stores one cell linkage with the whole coord array', () => {
    const linkages = buildLinkages({
      ...EMPTY_LINKAGE_DRAFT,
      type: 'cell',
      cells: [[2, 2], [3, 2], [4, 2]],
      color: 'red',
    });
    expect(linkages).toEqual([
      { type: 'cell', cells: [[2, 2], [3, 2], [4, 2]], effect: 'highlight', color: 'red' },
    ]);
  });

  it('rejects drafts without any selectable object', () => {
    expect(buildLinkages({ ...EMPTY_LINKAGE_DRAFT, type: 'character', characterIds: [] })).toEqual([]);
    expect(buildLinkages({ ...EMPTY_LINKAGE_DRAFT, type: 'item', itemId: null })).toEqual([]);
    expect(buildLinkages({ ...EMPTY_LINKAGE_DRAFT, type: 'cell', cells: [] })).toEqual([]);
    expect(buildLinkages({ ...EMPTY_LINKAGE_DRAFT, type: 'region', regionIds: [] })).toEqual([]);
  });

  it('validity mirrors buildLinkages emptiness', () => {
    expect(isLinkageDraftValid({ ...EMPTY_LINKAGE_DRAFT, type: 'cell', cells: [] })).toBe(false);
    expect(
      isLinkageDraftValid({ ...EMPTY_LINKAGE_DRAFT, type: 'cell', cells: [[0, 0]] }),
    ).toBe(true);
  });

  it('never leaks draft state into stored linkages (defensive copies)', () => {
    const cells: Array<[number, number]> = [[1, 1]];
    const [linkage] = buildLinkages({ ...EMPTY_LINKAGE_DRAFT, type: 'cell', cells });
    cells[0] = [9, 9];
    expect(linkage).toMatchObject({ type: 'cell', cells: [[1, 1]] });
  });
});
