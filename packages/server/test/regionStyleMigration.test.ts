import { describe, expect, it } from 'vitest';
import {
  downgradeRegionStyleDraft,
  hasLegacyRegionStyle,
  upgradeRegionStyleDraft,
} from '../src/service/regionStyleMigration';

/**
 * v0.7.0 (docs/v0.7.0.md §4) — the region style transform behind migration
 * `20260101000030_v070_region_style` and the `mapDraftCompat` absorption.
 */

/** A v0.6.x draft: two regions, one at the default width, one custom. */
function legacyDraft(): Record<string, unknown> {
  return {
    version: 6,
    gridSize: 4,
    cells: { '0,0': { item: { assetId: 3, w: 1, h: 1 } } },
    regions: [
      {
        id: 'rg_default',
        name: '默认区',
        color: '#123456',
        borderWidth: 12,
        fillOpacity: 0.4,
        cells: [[0, 0]],
      },
      {
        id: 'rg_custom',
        name: '自定义区',
        color: '#000000',
        borderWidth: 4,
        fillOpacity: 0,
        cells: [[1, 1]],
        labelCell: [1, 1],
      },
    ],
    style: { cellSize: 120 },
  };
}

describe('hasLegacyRegionStyle', () => {
  it('detects the retired trio', () => {
    expect(hasLegacyRegionStyle(legacyDraft()['regions'])).toBe(true);
    expect(hasLegacyRegionStyle([{ id: 'a', name: 'A', cells: [[0, 0]] }])).toBe(false);
    expect(hasLegacyRegionStyle([])).toBe(false);
    expect(hasLegacyRegionStyle(undefined)).toBe(false);
    expect(hasLegacyRegionStyle('x')).toBe(false);
  });
});

describe('upgradeRegionStyleDraft (v0.6.x → v0.7.0)', () => {
  it('strips the trio and records only the width that disagreed with the default', () => {
    const draft = legacyDraft();
    const upgraded = upgradeRegionStyleDraft(draft);
    expect(upgraded).not.toBeNull();
    if (!upgraded) return;

    const regions = upgraded['regions'] as Array<Record<string, unknown>>;
    // 12 === the map-level default → nothing recorded.
    expect(regions[0]).toEqual({ id: 'rg_default', name: '默认区', cells: [[0, 0]] });
    // 4 !== 12 → recorded as the outline override.
    expect(regions[1]).toEqual({
      id: 'rg_custom',
      name: '自定义区',
      cells: [[1, 1]],
      labelCell: [1, 1],
      style: { outline: { width: 4 } },
    });
    expect(upgraded['version']).toBe(7);
  });

  it('measures the disagreement against the map-level width when one is stored', () => {
    const draft = legacyDraft();
    (draft['style'] as Record<string, unknown>)['regionOutline'] = { width: 4, color: '#000000' };
    const upgraded = upgradeRegionStyleDraft(draft);
    if (!upgraded) throw new Error('应有改动');
    const regions = upgraded['regions'] as Array<Record<string, unknown>>;
    // Now 4 agrees with the map-level default and 12 does not.
    expect(regions[0]?.['style']).toEqual({ outline: { width: 12 } });
    expect(regions[1]?.['style']).toBeUndefined();
  });

  it('is idempotent and never mutates the input', () => {
    const draft = legacyDraft();
    const snapshot = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
    const once = upgradeRegionStyleDraft(draft);
    expect(upgradeRegionStyleDraft(once!)).toBeNull();
    expect(upgradeRegionStyleDraft({ ...draft, regions: [] })).toBeNull();
    expect(draft).toEqual(snapshot);
  });
});

describe('downgradeRegionStyleDraft (v0.7.0 → v0.6.x)', () => {
  it('restores the trio, taking the width back from the override', () => {
    const upgraded = upgradeRegionStyleDraft(legacyDraft());
    const downgraded = downgradeRegionStyleDraft(upgraded!);
    expect(downgraded).not.toBeNull();
    if (!downgraded) return;

    const regions = downgraded['regions'] as Array<Record<string, unknown>>;
    expect(regions[0]).toEqual({
      id: 'rg_default',
      name: '默认区',
      color: '#000000',
      borderWidth: 12,
      fillOpacity: 0,
      cells: [[0, 0]],
    });
    expect(regions[1]).toEqual({
      id: 'rg_custom',
      name: '自定义区',
      color: '#000000',
      borderWidth: 4,
      fillOpacity: 0,
      cells: [[1, 1]],
      labelCell: [1, 1],
    });
    expect(downgraded['version']).toBe(6);
  });

  it('falls back to the map-level default when no override was recorded', () => {
    const draft = {
      version: 7,
      gridSize: 4,
      cells: {},
      regions: [{ id: 'rg_a', name: 'A', cells: [[0, 0]] }],
      style: { regionOutline: { width: 6, color: '#000000' } },
    };
    const downgraded = downgradeRegionStyleDraft(draft);
    if (!downgraded) throw new Error('应有改动');
    expect((downgraded['regions'] as Array<Record<string, unknown>>)[0]?.['borderWidth']).toBe(6);
  });

  it('is idempotent on an already v0.6.x payload', () => {
    expect(downgradeRegionStyleDraft(legacyDraft())).toBeNull();
    expect(downgradeRegionStyleDraft({ version: 7, regions: [] })).toBeNull();
  });
});

describe('round trip', () => {
  it('up → down → up lands back on the v0.7.0 shape', () => {
    const original = legacyDraft();
    const up = upgradeRegionStyleDraft(original)!;
    const down = downgradeRegionStyleDraft(up)!;
    const upAgain = upgradeRegionStyleDraft(down)!;
    expect(upAgain).toEqual(up);
  });
});
