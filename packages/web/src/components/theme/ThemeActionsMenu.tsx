import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { UI_Z } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeActionsMenuProps {
  onExport: () => void;
  /** v0.8.2：改名称 / 描述 / 识别色。原来这一项叫「重命名」，加了门牌色之后名不副实。 */
  onEdit: () => void;
  onDelete: () => void;
}

/** `w-44` —— 与主题切换器的菜单同宽，两处浮层读起来是同一套。 */
const MENU_WIDTH = 176;

const itemClass =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground';

/**
 * v0.8.0（docs/v0.8.0.md §16.2）—— 主题工作台右上角那半个 `⋯`。
 *
 * 这一屏只有一个动作值得当按钮：**上线**（唯一有外部结果的事）。导出 / 编辑 /
 * 删除都是「偶尔做一次」的，三个平级按钮并排等于告诉作者「四件事一样常做」，
 * 而 56px 的一行放不下四个按钮 —— 只能靠菜单把低频动作收起来。
 *
 * 实现方式与 `EntryActionsMenu` 一致：portal 到 `<body>` + `position: fixed` 跟随
 * 按钮。本仓库没有 dropdown 依赖（见那里的注释），而这枚菜单只有三项。
 *
 * v0.8.2：删掉了那条 disabled 的「风格 · 在地图的「基本信息」里设」。它是菜单里
 * 唯一一行说明文字，而且点不动 —— 一个动作列表里最不该有的东西就是「不能做的
 * 事」。缺省风格去哪儿设，概览页那一行已经用链接说了。
 */
export function ThemeActionsMenu({ onExport, onEdit, onDelete }: ThemeActionsMenuProps): JSX.Element {
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
      <button type="button" role="menuitem" className={itemClass} onClick={() => run(onEdit)}>
        <Pencil className="h-3.5 w-3.5" />
        编辑主题信息
      </button>
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
