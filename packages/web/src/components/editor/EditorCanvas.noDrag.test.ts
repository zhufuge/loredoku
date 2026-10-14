import { describe, expect, it } from 'vitest';

// Vite/vitest exposes the component sources as raw strings, so this test can
// assert the architectural rule directly: cell content is clickable, never draggable
// (docs/v0.2.5.md BUG-401 / BUG-405).
const raw = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const source = raw['./EditorCanvas.tsx'] ?? '';

function segment(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(`EditorCanvas segment not found: ${startMarker}`);
  }
  return source.slice(start, end);
}

const objectNodes = segment('const objectNodes', 'const characterNodes');
const characterNodes = segment('const characterNodes', 'const regionFills');
const contentNodes = [objectNodes, characterNodes];

describe('EditorCanvas cell content', () => {
  it('selects on click with a pointer cursor', () => {
    expect(source.length).toBeGreaterThan(0);
    for (const part of contentNodes) {
      expect(part).toContain('onClick');
      expect(part).toContain("cursor: ");
      expect(part).toContain("'pointer'");
    }
  });

  it('registers no drag handlers and disables native image dragging', () => {
    const forbidden = ['onPointerMove', 'setPointerCapture', 'onDragStart', 'moveObject'];
    for (const part of contentNodes) {
      for (const token of forbidden) expect(part).not.toContain(token);
      expect(part).toContain('draggable={false}');
    }
  });

  it('never offers grab or move cursors', () => {
    for (const part of contentNodes) {
      expect(part).not.toContain("'grab'");
      expect(part).not.toContain("'grabbing'");
      expect(part).not.toContain("'move'");
    }
  });
});

describe('drag sources across the editor', () => {
  it('leaves the roster column as the only pointer-drag source', () => {
    const dragSources = Object.entries(raw).filter(([, content]) =>
      content.includes('setPointerCapture'),
    );
    const names = dragSources.map(([name]) => name).sort();
    // The canvas uses capture for pan/brush tools, the roster for character drops.
    expect(names).toEqual(['./CharacterSlotColumn.tsx', './EditorCanvas.tsx']);
  });

  it('removes the legacy HTML5 character drag entirely', () => {
    for (const [name, content] of Object.entries(raw)) {
      expect(content.includes('onDragStart')).toBe(false);
      expect(content.includes('CHARACTER_DND_TYPE')).toBe(false);
    }
  });
});
