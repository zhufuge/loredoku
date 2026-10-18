import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LIST_ROW_HEIGHT } from '@loredoku/shared';
import { cn } from '@/lib/utils';

export interface VirtualListProps {
  /** Total number of rows in the data set (not just the rendered window). */
  count: number;
  /** Rows are a uniform height; `LIST_ROW_HEIGHT` is the shared default. */
  rowHeight?: number;
  /** Viewport height in px. */
  height?: number;
  /** Extra rows rendered above and below the viewport (smooth scrolling). */
  overscan?: number;
  className?: string;
  renderRow: (index: number) => ReactNode;
}

const DEFAULT_HEIGHT = 480;
const DEFAULT_OVERSCAN = 6;

export function VirtualList({
  count,
  rowHeight = LIST_ROW_HEIGHT,
  height = DEFAULT_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  className,
  renderRow,
}: VirtualListProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // jsdom (and the very first paint) report 0 — fall back to the configured
  // height so the list still renders a sensible first window.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = (): void => setViewportHeight(node.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visible = viewportHeight > 0 ? viewportHeight : height;

  const { startIndex, endIndex, paddingTop, paddingBottom } = useMemo(() => {
    const first = Math.floor(scrollTop / rowHeight) - overscan;
    const last = Math.ceil((scrollTop + visible) / rowHeight) + overscan;
    const start = Math.max(0, Math.min(first, Math.max(0, count - 1)));
    const end = Math.min(count, Math.max(last, start));
    return {
      startIndex: start,
      endIndex: end,
      paddingTop: start * rowHeight,
      paddingBottom: Math.max(0, (count - end) * rowHeight),
    };
  }, [count, rowHeight, overscan, scrollTop, visible]);

  const rows: ReactNode[] = [];
  for (let index = startIndex; index < endIndex; index += 1) {
    rows.push(
      <div key={index} style={{ height: rowHeight }}>
        {renderRow(index)}
      </div>,
    );
  }

  return (
    <div
      ref={viewportRef}
      className={cn('overflow-y-auto', className)}
      style={{ height }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      data-testid="virtual-list"
      data-rendered-count={endIndex - startIndex}
    >
      <div style={{ height: count * rowHeight }}>
        <div style={{ paddingTop, paddingBottom }}>{rows}</div>
      </div>
    </div>
  );
}
