import { useEffect, useRef, useState } from 'react';
import { Copy, Eye, MoreHorizontal, Pencil } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
import { UI_Z } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * v0.5.8 §2: 卡片上的「三点」菜单。工作条目与版本条目的操作集合同构
 * （编辑信息 / 预览 / 复制），差异只在预览是否可用 —— 一条从没发布过的
 * 工作条目没有可预览的快照。
 *
 * 自己实现而不用浮层库：本仓库没有 dropdown 依赖，而这个菜单只有三项、
 * 只在列表页出现，一个受控的 `relative` 容器比引入 Radix 更便宜。
 * 点击容器外关闭（pointerdown，比 click 更早，不会先触发菜单项）。
 */
interface EntryActionsMenuProps {
  entry: MapEntrySummary;
  onEditInfo: (entry: MapEntrySummary) => void;
  onPreview: (entry: MapEntrySummary) => void;
  onDuplicate: (entry: MapEntrySummary) => void;
}

/** 这条条目有没有可预览的快照（工作条目看血统的最高版本）。 */
export function previewVersionNo(entry: MapEntrySummary): number | null {
  return entry.versionNo ?? entry.currentVersionNo;
}

export function EntryActionsMenu({
  entry,
  onEditInfo,
  onPreview,
  onDuplicate,
}: EntryActionsMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewable = previewVersionNo(entry) !== null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target && containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const run = (action: (entry: MapEntrySummary) => void): void => {
    setOpen(false);
    action(entry);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Button
        size="icon"
        variant="ghost"
        title="更多操作"
        aria-label="更多操作"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          style={{ zIndex: UI_Z.drawer }}
          className="absolute right-0 top-full mt-1 w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => run(onEditInfo)}
          >
            <Pencil className="h-3.5 w-3.5" />
            编辑信息
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!previewable}
            title={previewable ? '预览已发布版本' : '还没有已发布的版本可预览'}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
              !previewable ? 'cursor-not-allowed opacity-50' : undefined,
            )}
            onClick={() => previewable && run(onPreview)}
          >
            <Eye className="h-3.5 w-3.5" />
            预览
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => run(onDuplicate)}
          >
            <Copy className="h-3.5 w-3.5" />
            复制
          </button>
        </div>
      ) : null}
    </div>
  );
}
