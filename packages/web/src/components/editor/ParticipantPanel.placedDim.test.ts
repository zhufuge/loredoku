import { describe, expect, it } from 'vitest';

/**
 * SPEC-G05 (docs/v0.4.1.md §5.2 / §12.2): once a participant has been placed on
 * the board its roster card dims, so the author can see at a glance who is
 * still unplaced. The set of placed slot indices is derived in
 * `lib/gamePlacement` (`placedParticipantIds`) and handed to the panel as
 * `placedSlotIndices`; this file guards the rendering half.
 */

const source =
  ((import.meta.glob('./ParticipantPanel.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./ParticipantPanel.tsx'] ?? '').replace(/\r\n/g, '\n');

describe('ParticipantPanel placement dimming (SPEC-G05 §5.2)', () => {
  it('accepts the placed slot indices as an optional prop', () => {
    expect(source).toContain('placedSlotIndices?: Set<number>;');
    expect(source).toContain('placedSlotIndices,');
  });

  it('uses the shared opacity constant rather than a magic number', () => {
    expect(source).toContain('GAME_PLACED_OPACITY');
    expect(source).toContain('opacity: isPlaced ? GAME_PLACED_OPACITY : undefined,');
  });

  it('derives "placed" from the index the board reports', () => {
    expect(source).toContain('const isPlaced = placedSlotIndices?.has(index) ?? false;');
  });

  it('keeps the dimming on the avatar (the roster frame stays interactive)', () => {
    expect(source).toContain('data-testid={`slot-avatar-${index}`}');
  });
});
