import { describe, expect, it } from 'vitest';
import { TOAST_OFFSET } from '@loredoku/shared';

/**
 * v0.5.3 FIX-N01 (docs/v0.5.3.md §1): the toast stack used to sit flush with
 * the viewport's top-right corner — right on top of the header bar's 保存 /
 * 发布 / 导入 / 导出 buttons.
 */

const source =
  ((import.meta.glob('./sonner.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >)['./sonner.tsx'] ?? '').replace(/\r\n/g, '\n');

describe('Toaster（FIX-N01）', () => {
  it('pushes the stack below the header bar', () => {
    // 64 > the `h-14` (56px) bar of both the console header and the editor
    // toolbar, so the first toast never covers a button.
    expect(TOAST_OFFSET).toBeGreaterThanOrEqual(56);
    expect(source).toContain('offset={TOAST_OFFSET}');
    expect(source).toContain("from '@loredoku/shared'");
  });

  it('keeps the stack on the right and keeps the close button', () => {
    expect(source).toContain('position="top-right"');
    expect(source).toContain('richColors closeButton');
  });
});
