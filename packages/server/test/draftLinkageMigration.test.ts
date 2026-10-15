import { describe, expect, it } from 'vitest';
import {
  emptyStats,
  linkageTargetKey,
  migrateDraftLinkages,
  migrateStoredDraft,
} from '../src/service/draftLinkageMigration';

/** Legacy (v0.3.2) slot carrying click/touch trigger groups. */
function legacyDraft(): Record<string, unknown> {
  return {
    version: 1,
    gridSize: 6,
    cells: {},
    regions: [],
    characterSlots: [
      {
        characterId: 5,
        themeColor: '#8B6F47',
        triggers: [
          {
            trigger: 'click',
            targets: [
              { type: 'character', id: 7, effect: 'highlight', color: 'red' },
              { type: 'item', id: 12, effect: 'highlight', color: 'blue' },
              { type: 'item', id: 15, effect: 'highlight', color: 'red' },
              { type: 'cell', x: 2, y: 2, effect: 'highlight', color: 'red' },
            ],
          },
          {
            trigger: 'touch',
            targets: [
              { type: 'character', id: 7, effect: 'highlight', color: 'red' },
              { type: 'region', id: 'rg_a1b2c3', effect: 'highlight', color: 'blue' },
            ],
          },
        ],
      },
      null,
    ],
  };
}

describe('MOD-801 migration: triggers → flat linkages', () => {
  it('merges both trigger groups into one flat list', () => {
    const draft = legacyDraft();
    const stats = migrateDraftLinkages(draft, emptyStats());
    const slot = (draft['characterSlots'] as Array<Record<string, unknown>>)[0]!;

    expect(slot['triggers']).toBeUndefined();
    const linkages = slot['linkages'] as Array<Record<string, unknown>>;
    // 6 targets across both groups, 1 duplicate → 4 unique (2 items + char + region)
    expect(linkages).toHaveLength(5);
    expect(linkages.map((linkage) => linkage['type']).sort()).toEqual([
      'cell',
      'character',
      'item',
      'item',
      'region',
    ]);
    expect(stats.linksMerged).toBe(6);
  });

  it('treats object + colour as the dedupe key (cross-group duplicates collapse)', () => {
    const draft = legacyDraft();
    const stats = migrateDraftLinkages(draft, emptyStats());
    // character 7 / red appears in both groups → kept once.
    expect(stats.linksDeduped).toBe(1);
    const linkages = (
      (draft['characterSlots'] as Array<Record<string, unknown>>)[0]!['linkages'] as Array<
        Record<string, unknown>
      >
    );
    expect(linkages.filter((linkage) => linkage['type'] === 'character')).toHaveLength(1);
  });

  it('keeps the same object twice when the colour differs', () => {
    const draft = {
      characterSlots: [
        {
          characterId: 1,
          triggers: [
            {
              trigger: 'click',
              targets: [{ type: 'character', id: 7, effect: 'highlight', color: 'red' }],
            },
            {
              trigger: 'touch',
              targets: [{ type: 'character', id: 7, effect: 'highlight', color: 'blue' }],
            },
          ],
        },
      ],
    };
    migrateDraftLinkages(draft);
    const linkages = (
      draft.characterSlots[0] as unknown as { linkages: Array<Record<string, unknown>> }
    ).linkages;
    expect(linkages).toHaveLength(2);
    expect(linkages.map((linkage) => linkage['color']).sort()).toEqual(['blue', 'red']);
  });

  it('defaults a missing clue to an empty string', () => {
    const draft = legacyDraft();
    const stats = migrateDraftLinkages(draft, emptyStats());
    expect((draft['characterSlots'] as Array<Record<string, unknown>>)[0]!['clue']).toBe('');
    expect(stats.clueAdded).toBe(1);
  });

  it('preserves an existing clue and null slots', () => {
    const draft = legacyDraft();
    (draft['characterSlots'] as Array<Record<string, unknown>>)[0]!['clue'] = '他**喜欢**黄昏。';
    const stats = migrateDraftLinkages(draft, emptyStats());
    expect((draft['characterSlots'] as Array<Record<string, unknown>>)[0]!['clue']).toBe(
      '他**喜欢**黄昏。',
    );
    expect((draft['characterSlots'] as unknown[])[1]).toBeNull();
    expect(stats.clueAdded).toBe(0);
  });

  it('adds scope=all to item linkages and converts legacy cell coordinates', () => {
    const draft = legacyDraft();
    const stats = migrateDraftLinkages(draft, emptyStats());
    const linkages = (
      (draft['characterSlots'] as Array<Record<string, unknown>>)[0]!['linkages'] as Array<
        Record<string, unknown>
      >
    );
    for (const linkage of linkages) {
      if (linkage['type'] === 'item') expect(linkage['scope']).toBe('all');
      if (linkage['type'] === 'cell') {
        expect(linkage['cells']).toEqual([[2, 2]]);
        expect(linkage['x']).toBeUndefined();
        expect(linkage['y']).toBeUndefined();
      }
    }
    expect(stats.itemScopesAdded).toBe(2);
    expect(stats.cellTargetsMigrated).toBe(1);
  });

  it('is idempotent for an already migrated draft', () => {
    const draft = legacyDraft();
    migrateDraftLinkages(draft);
    const first = JSON.stringify(draft);

    const second = migrateDraftLinkages(draft, emptyStats());
    expect(JSON.stringify(draft)).toBe(first);
    expect(second.linksMerged).toBe(0);
    expect(second.linksDeduped).toBe(0);
    expect(second.clueAdded).toBe(0);
    expect(second.itemScopesAdded).toBe(0);
    expect(second.cellTargetsMigrated).toBe(0);
  });

  it('unions pre-existing linkages with legacy triggers without dropping data', () => {
    const draft = {
      characterSlots: [
        {
          characterId: 5,
          clue: 'x',
          linkages: [{ type: 'character', id: 9, effect: 'highlight', color: 'blue' }],
          triggers: [
            {
              trigger: 'click',
              targets: [{ type: 'region', id: 'rg_old', effect: 'highlight', color: 'red' }],
            },
          ],
        },
      ],
    };
    migrateDraftLinkages(draft);
    const slot = draft.characterSlots[0] as unknown as {
      linkages: Array<Record<string, unknown>>;
      triggers?: unknown;
    };
    expect(slot.linkages).toHaveLength(2);
    expect(slot.linkages.map((linkage) => linkage['type']).sort()).toEqual([
      'character',
      'region',
    ]);
    expect(slot.triggers).toBeUndefined();
  });

  it('leaves drafts without a characterSlots array untouched', () => {
    expect(migrateStoredDraft(null)).toBeNull();
    expect(migrateStoredDraft('nope')).toBeNull();
    const draft: Record<string, unknown> = { version: 1 };
    expect(migrateDraftLinkages(draft)).toMatchObject({ linksMerged: 0 });
    expect('characterSlots' in draft).toBe(false);
  });

  it('identifies targets across value orderings (colour excluded)', () => {
    expect(linkageTargetKey({ type: 'character', id: 3 })).toBe('character:3');
    expect(linkageTargetKey({ type: 'item', id: 4 })).toBe('item:4');
    expect(linkageTargetKey({ type: 'region', id: 'rg_a' })).toBe('region:rg_a');
    expect(linkageTargetKey({ type: 'cell', cells: [[3, 2], [2, 2]] })).toBe(
      linkageTargetKey({ type: 'cell', cells: [[2, 2], [3, 2]] }),
    );
  });
});
