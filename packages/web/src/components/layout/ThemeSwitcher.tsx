import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Layers, Settings2 } from 'lucide-react';
import { UI_Z } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/layout/WorkspaceContext';
import { rememberThemeCode, SETTINGS_THEMES_PATH, WORKSHOP_MODULES, type ModuleKey } from '@/lib/workspace';
import { cn } from '@/lib/utils';

/** 与 `ThemeActionsMenu` 同宽：一行「名字 + 编码」读得完。 */
const MENU_WIDTH = 208;

const itemClass =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground';

/**
 * v0.8.0 §18：顶栏里的**主题切换器**，位置在日夜图标之前。
 *
 * 上一版顶栏还是「六个模块」平铺，其中「主题」是第一项 —— 于是「换个主题」这件事
 * 藏在导航里，像去另一个页面，可它其实是换个世界接着干活：你在 `hlm/puzzles`，
 * 换到默认主题就该落到 `default/puzzles`，而不是主题列表。
 *
 * 所以它现在是一个**下拉**，与日夜图标并列（两者都是「外壳的开关」，不是内容），
 * 触发器直接写出当前主题名 —— 顶栏里始终有一句「你在哪个世界」。
 *
 * 菜单里只有两件事：
 *
 * 1. 换到另一个主题（**保留当前模块**，找不到同名模块就回地图）；
 * 2. 去系统配置页管主题（新建 / 改名 / 删）。
 *
 * 第二件事单独在菜单底部、带一句小注：它是一个出口，不是第三个主题。
 */
export function ThemeSwitcher(): JSX.Element | null {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 换主题时保留模块：`/hlm/puzzles` → `/default/puzzles`。
  const currentModule = ((): ModuleKey => {
    const segment = location.pathname.split('/').filter(Boolean)[1];
    const found = WORKSHOP_MODULES.find((module) => module.key === segment);
    return found?.key ?? 'maps';
  })();

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const sync = (): void => {
      const node = containerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setPosition({ top: rect.bottom + 6, left: Math.max(8, rect.right - MENU_WIDTH) });
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [open]);

  // 路由一变就收起 —— 否则从菜单里跳走后浮层还挂在新页面上。
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      // 浮层 portal 到了 body，必须排除它，否则点菜单项会先被这里卸载。
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!workspace) return null;

  const switchTo = (code: string): void => {
    setOpen(false);
    if (code === workspace.themeCode) return;
    rememberThemeCode(code);
    navigate(`/${encodeURIComponent(code)}/${currentModule}`);
  };

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label="切换主题"
      style={{ position: 'fixed', top: position?.top ?? 0, left: position?.left ?? 0, zIndex: UI_Z.drawer }}
      className="w-52 origin-top-right overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lifted animate-in fade-in-0 zoom-in-95 duration-fast"
    >
      {workspace.themes.map((theme) => {
        const active = theme.code === workspace.themeCode;
        return (
          <button
            key={theme.code}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            className={cn(itemClass, 'gap-1.5')}
            onClick={() => switchTo(theme.code)}
          >
            <Check
              className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-primary' : 'opacity-0')}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{theme.name}</span>
            <span className="shrink-0 font-mono text-2xs text-muted-foreground">{theme.code}</span>
          </button>
        );
      })}

      <div className="my-1 h-px bg-border" role="separator" />

      <Link
        to={SETTINGS_THEMES_PATH}
        role="menuitem"
        className={cn(itemClass, 'items-start')}
        onClick={() => setOpen(false)}
      >
        <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0">
          主题配置
          <span className="block text-2xs leading-snug text-muted-foreground">新建、改名、删除</span>
        </span>
      </Link>
    </div>
  );

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`当前主题：${workspace.theme.name}（点击切换）`}
        data-testid="theme-switcher"
        className="h-9 max-w-44 gap-1.5 px-2"
        onClick={() => setOpen((value) => !value)}
      >
        <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-kai text-sm">{workspace.theme.name}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </Button>
      {open && position ? createPortal(menu, document.body) : null}
    </div>
  );
}
