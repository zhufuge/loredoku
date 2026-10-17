import { describe, expect, it } from 'vitest';
import { readSource, segment, tsxIn } from '@/testing/source';

// Vite/vitest exposes the component sources as raw strings, so this test can
// assert the architectural rule directly: cell content is clickable, never
// draggable (docs/v0.2.5.md BUG-401 / BUG-405, docs/v0.3.0.md OPT-501,
// docs/v0.3.1.md CLAR-603 — character layer removed; participants stay in
// the roster).
//
// The cell layers are shared with the work preview page, so they live in
// `components/map/MapLayers.tsx`.
const source = readSource('components/editor/EditorCanvas.tsx');
const layerSource = readSource('components/map/MapLayers.tsx');

// CLAR-603: MapCharacterLayer is gone; only the object layer remains
// interactive on the canvas. The roster (ParticipantPanel) handles its own
// pointer-drag reordering.
const objectNodes = segment(
  layerSource,
  'export function MapObjectLayer',
  'export function MapRegionFillLayer',
);

describe('cell content layers', () => {
  it('are present in the shared map module', () => {
    expect(source).toContain('MapObjectLayer');
  });

  it('selects on click with a pointer cursor', () => {
    expect(objectNodes).toContain('onClick');
    expect(objectNodes).toContain('cursor: ');
    expect(objectNodes).toContain("'pointer'");
  });

  it('registers no drag handlers and disables native image dragging', () => {
    const forbidden = ['onPointerMove', 'setPointerCapture', 'onDragStart', 'moveObject'];
    for (const token of forbidden) expect(objectNodes).not.toContain(token);
    expect(objectNodes).toContain('draggable={false}');
  });

  it('never offers grab or move cursors', () => {
    expect(objectNodes).not.toContain("'grab'");
    expect(objectNodes).not.toContain("'grabbing'");
    expect(objectNodes).not.toContain("'move'");
  });

  it('does not export a MapCharacterLayer (CLAR-603 — participants no longer enter the map)', () => {
    expect(layerSource).not.toContain('export function MapCharacterLayer');
    expect(layerSource).not.toContain('MapCharacterLayerProps');
    // EditorCanvas must also not reference it.
    expect(source).not.toContain('MapCharacterLayer');
  });
});

describe('drag sources across the editor', () => {
  const entries = [...tsxIn('components/editor'), ...tsxIn('components/map')];

  it('leaves the participant panel as the only pointer-drag source', () => {
    const names = tsxIn('components/editor')
      .filter(([, content]) => content.includes('setPointerCapture'))
      .map(([name]) => name)
      .sort();
    // The canvas uses capture for pan/brush tools; the participant panel uses
    // it for roster reordering (CLAR-603 — no longer drops onto the map).
    expect(names).toEqual([
      'components/editor/EditorCanvas.tsx',
      'components/editor/ParticipantPanel.tsx',
    ]);
  });

  it('removes the legacy HTML5 character drag entirely', () => {
    for (const [name, content] of entries) {
      expect(content.includes('onDragStart'), name).toBe(false);
      expect(content.includes('CHARACTER_DND_TYPE'), name).toBe(false);
    }
  });

  it('removes any reference to the legacy placedCharacters / PlacedCharacter', () => {
    for (const [name, content] of entries) {
      // The data migration script and zod schema may still mention the legacy
      // field name; this test only scans the editor/map components.
      if (name.includes('EditorCanvas') || name.includes('MapLayers')) {
        expect(content.includes('placedCharacters'), name).toBe(false);
        expect(content.includes('PlacedCharacter'), name).toBe(false);
      }
    }
  });
});
