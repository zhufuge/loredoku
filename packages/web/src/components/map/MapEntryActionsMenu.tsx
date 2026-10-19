import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Eye, MoreHorizontal, Pencil } from 'lucide-react';
import type { MapEntrySummary } from '@loredoku/shared';
import { UI_Z } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 卡片上的「三点」菜单。
 *
 * 工作条目：编辑信息 / 复制 / 预览；版本条目只有**预览** —— 版本是发布时冻结
 * 的快照，复制一份既改不了也产不出有用的新图，改名则破坏「版本不可变」。
 * 想基于某个版本继续做事，走「以此为底稿新建」。
 *
 * 菜单浮层 **portal 到 `<body>`** 并 `position: fixed` 跟随按钮：卡片带
 * `overflow-hidden`（封面圆角需要），把菜单当卡片内的 `absolute` 子元素会被
 * 裁掉，网格最后一行尤其明显。自己实现而不用浮层库：本仓库没有 dropdown
 * 依赖，菜单只有几项，portal + 一个 rect 同步比引入 Radix 便宜。
 *
 * 点击容器外关闭（pointerdown，比 click 更早，不会先触发菜单项）；菜单自身
 * 已不在容器内（portal），所以外部关闭必须**同时排除菜单节点**，否则
 * pointerdown 先卸载浮层、菜单项的 click 就永远不触发。
 */
interface MapEntryActionsMenuProps {
  entry: MapEntrySummary;
  onEditInfo: (entry: MapEntrySummary) => void;
  onPreview: (entry: MapEntrySummary) => void;
  onDuplicate: (entry: MapEntrySummary) => void;
}

/** 这条条目有没有可预览的快照（工作条目看血统的最高版本）。 */
export function previewVersionNo(entry: MapEntrySummary): number | null {
  return entry.versionNo ?? entry.currentVersionNo;
}

/** `w-32` —— portal 后用来把浮层右缘对齐按钮右缘。 */
const MENU_WIDTH = 128;

export function MapEntryActionsMenu({
  entry,
  onEditInfo,
  onPreview,
  onDuplicate,
}: MapEntryActionsMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  /** 浮层的 viewport 坐标；`null` = 还没量过（开菜单的同一次布局里量）。 */
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const previewable = previewVersionNo(entry) !== null;

  // 量按钮、把浮层钉在它下面；滚动 / 缩放时跟着走（capture，浮层可能落在
  // 任何滚动容器里）。layout effect 保证开菜单的同一次绘制就有坐标。
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const sync = (): void => {
      const node = containerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.right - MENU_WIDTH });
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      // 浮层已 portal 出容器 —— 不排除它，点菜单项会先被这里卸载。
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const run = (action: (entry: MapEntrySummary) => void): void => {
    setOpen(false);
    action(entry);
  };

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      style={{ position: 'fixed', top: position?.top ?? 0, left: position?.left ?? 0, zIndex: UI_Z.drawer }}
      className="w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {entry.kind !== 'version' ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          onClick={() => run(onEditInfo)}
        >
          <Pencil className="h-3.5 w-3.5" />
          编辑信息
        </button>
      ) : null}
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
      {entry.kind !== 'version' ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          onClick={() => run(onDuplicate)}
        >
          <Copy className="h-3.5 w-3.5" />
          复制
        </button>
      ) : null}
    </div>
  );

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
      {open && position ? createPortal(menu, document.body) : null}
    </div>
  );
}
