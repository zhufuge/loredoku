import { describe, expect, it } from 'vitest';

// Vite/vitest exposes the component sources as raw strings, so this test can
// assert the architectural rule directly: cell content is clickable, never
// draggable (docs/v0.2.5.md BUG-401 / BUG-405, docs/v0.3.0.md OPT-501,
// docs/v0.3.1.md CLAR-603 — character layer removed; participants stay in
// the roster).
//
// The cell layers are shared with the work preview page, so they live in
// `components/map/MapLayers.tsx`.
const raw = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const mapRaw = import.meta.glob('../map/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const source = raw['./EditorCanvas.tsx'] ?? '';
const layerSource = mapRaw['../map/MapLayers.tsx'] ?? '';

function segment(haystack: string, startMarker: string, endMarker: string): string {
  const start = haystack.indexOf(startMarker);
  const end = haystack.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(`segment not found: ${startMarker}`);
  }
  return haystack.slice(start, end);
}

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
    expect(layerSource.length).toBeGreaterThan(0);
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
  it('leaves the participant panel as the only pointer-drag source', () => {
    const dragSources = Object.entries(raw).filter(([, content]) =>
      content.includes('setPointerCapture'),
    );
    const names = dragSources.map(([name]) => name).sort();
    // The canvas uses capture for pan/brush tools; the participant panel uses
    // it for roster reordering (CLAR-603 — no longer drops onto the map).
    expect(names).toEqual(['./EditorCanvas.tsx', './ParticipantPanel.tsx']);
  });

  it('removes the legacy HTML5 character drag entirely', () => {
    for (const [name, content] of Object.entries({ ...raw, ...mapRaw })) {
      expect(content.includes('onDragStart'), name).toBe(false);
      expect(content.includes('CHARACTER_DND_TYPE'), name).toBe(false);
    }
  });

  it('removes any reference to the legacy placedCharacters / PlacedCharacter', () => {
    for (const [name, content] of Object.entries({ ...raw, ...mapRaw })) {
      // The data migration script and zod schema may still mention the legacy
      // field name; this test only scans the editor/map components.
      if (name.includes('EditorCanvas') || name.includes('MapLayers')) {
        expect(content.includes('placedCharacters'), name).toBe(false);
        expect(content.includes('PlacedCharacter'), name).toBe(false);
      }
    }
  });
});
