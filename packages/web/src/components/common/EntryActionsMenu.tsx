import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Eye, MoreHorizontal, Pencil, Rocket } from 'lucide-react';
import { UI_Z } from '@loredoku/shared';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';

/**
 * 列表卡片 / 行上的「三点」菜单。地图与谜题共用一套按钮顺序：
 *
 * - 编辑信息 / 复制：**只给草稿行** —— 版本是发布时冻结的快照，复制一份既改不了
 *   也产不出有用的新行，改名则破坏「版本不可变」。想基于某个版本继续做事，走
 *   「编辑此版本」（谜题 fork 出新草稿行 / 地图 `?v=` 进编辑器）。
 * - 预览：两种行都有；草稿未初始化画布时可预览性为假。
 * - 部署：**只给版本行**，而且只有调用方（谜题列表）提供 `onDeploy` 时才渲染。
 *   草稿行连按钮都不渲染 —— 草稿永远不满足「已发布」，禁用按钮只会让人猜原因。
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
export interface EntryLike {
  kind: 'draft' | 'version';
  versionNo: number | null;
  /** 草稿未初始化画布时为 `null`（地图）；谜题的 `gridSize` 恒为数字。 */
  gridSize: number | null;
}

interface EntryActionsMenuProps<E extends EntryLike> {
  entry: E;
  onEditInfo: (entry: E) => void;
  onPreview: (entry: E) => void;
  onDuplicate: (entry: E) => void;
  /** 谜题专有：把**这个版本**部署为游戏。 */
  onDeploy?: (entry: E) => void;
}

/** 这条条目能不能打开只读预览，以及预览的是什么。 */
export function entryPreviewable(entry: EntryLike): boolean {
  // 版本行是发布时冻住的快照，永远可看；草稿行看自己，未初始化画布时无可预览。
  return entry.kind === 'version' ? true : entry.gridSize !== null;
}

/**
 * 预览按钮的 `title`。只在这里分 kind —— 列表行、卡片菜单共用，
 * 避免各处各写一套文案。
 */
export function entryPreviewTitle(entry: EntryLike): string {
  if (entry.kind === 'version') return '预览版本';
  return entry.gridSize !== null ? '预览草稿' : '草稿还没初始化画布';
}

/** `w-32` —— portal 后用来把浮层右缘对齐按钮右缘。 */
const MENU_WIDTH = 128;

const itemClass =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground';

export function EntryActionsMenu<E extends EntryLike>({
  entry,
  onEditInfo,
  onPreview,
  onDuplicate,
  onDeploy,
}: EntryActionsMenuProps<E>): JSX.Element {
  const [open, setOpen] = useState(false);
  /** 浮层的 viewport 坐标；`null` = 还没量过（开菜单的同一次布局里量）。 */
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const previewable = entryPreviewable(entry);
  const isVersion = entry.kind === 'version';

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

  const run = (action: (entry: E) => void): void => {
    setOpen(false);
    action(entry);
  };

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      style={{ position: 'fixed', top: position?.top ?? 0, left: position?.left ?? 0, zIndex: UI_Z.drawer }}
      className="w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lifted"
    >
      {!isVersion ? (
        <button type="button" role="menuitem" className={itemClass} onClick={() => run(onEditInfo)}>
          <Pencil className="h-3.5 w-3.5" />
          编辑信息
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        disabled={!previewable}
        title={entryPreviewTitle(entry)}
        className={cn(itemClass, !previewable ? 'cursor-not-allowed opacity-50' : undefined)}
        onClick={() => previewable && run(onPreview)}
      >
        <Eye className="h-3.5 w-3.5" />
        预览
      </button>
      {!isVersion ? (
        <button type="button" role="menuitem" className={itemClass} onClick={() => run(onDuplicate)}>
          <Copy className="h-3.5 w-3.5" />
          复制
        </button>
      ) : null}
      {isVersion && onDeploy ? (
        <button type="button" role="menuitem" className={itemClass} onClick={() => run(onDeploy)}>
          <Rocket className="h-3.5 w-3.5" />
          部署
        </button>
      ) : null}
    </div>
  );

  return (
    <div ref={containerRef} className="relative shrink-0">
      <IconButton
        variant="ghost"
        icon={<MoreHorizontal className="h-4 w-4" />}
        label="更多操作"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open && position ? createPortal(menu, document.body) : null}
    </div>
  );
}
