import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, MoreHorizontal, Palette, Pencil, Trash2 } from 'lucide-react';
import { UI_Z } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeActionsMenuProps {
  onExport: () => void;
  onRename: () => void;
  onDelete: () => void;
}

/** `w-44` —— 比列表行菜单宽：这里的菜单项带一句灰色小注。 */
const MENU_WIDTH = 176;

const itemClass =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground';

/**
 * v0.8.0（docs/v0.8.0.md §16.2）—— 主题工作台右上角那半个 `⋯`。
 *
 * 这一屏只有一个动作值得当按钮：**上线**（唯一有外部结果的事）。风格 / 导出 /
 * 重命名 / 删除都是「偶尔做一次」的，四个平级按钮并排等于告诉作者「五件事一样
 * 常做」，而 56px 的一行放不下五个按钮 —— 只能靠菜单把低频动作收起来。
 *
 * 实现方式与 `EntryActionsMenu` 一致：portal 到 `<body>` + `position: fixed` 跟随
 * 按钮。本仓库没有 dropdown 依赖（见那里的注释），而这枚菜单只有四项。
 *
 * 「风格」这一项目前是**禁用**的，但它不是占位符凑数：它在告诉作者风格从哪儿设
 * —— 不是在这个菜单里，而是在任意一张地图的「基本信息」抽屉里（§16.8 的
 * `设为主题风格`）。禁用一个会解释原因的按钮，比让它消失好。
 */
export function ThemeActionsMenu({ onExport, onRename, onDelete }: ThemeActionsMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      style={{ position: 'fixed', top: position?.top ?? 0, left: position?.left ?? 0, zIndex: UI_Z.drawer }}
      className="w-44 origin-top-right overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lifted animate-in fade-in-0 zoom-in-95 duration-fast"
    >
      <button type="button" role="menuitem" className={itemClass} onClick={() => run(onExport)}>
        <Download className="h-3.5 w-3.5" />
        导出资源包
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={() => run(onRename)}>
        <Pencil className="h-3.5 w-3.5" />
        重命名
      </button>
      <div
        role="menuitem"
        aria-disabled
        title="在任意一张地图的「基本信息」里，用「设为主题风格」把它的风格变成这个主题的缺省"
        className={cn(itemClass, 'cursor-not-allowed items-start opacity-50 hover:bg-transparent')}
      >
        <Palette className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0">
          风格
          <span className="block text-2xs leading-snug">在地图的「基本信息」里设</span>
        </span>
      </div>
      <div className="my-1 h-px bg-border" role="separator" />
      <button
        type="button"
        role="menuitem"
        className={cn(itemClass, 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
        onClick={() => run(onDelete)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        删除主题
      </button>
    </div>
  );

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Button
        variant="ghost"
        size="icon"
        aria-label="更多操作"
        aria-expanded={open}
        className="h-9 w-9"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && position ? createPortal(menu, document.body) : null}
    </div>
  );
}
