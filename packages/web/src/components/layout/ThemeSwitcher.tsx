import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Settings2 } from 'lucide-react';
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
 * 门牌色圆点 —— 触发器与菜单里每一行共用一枚，尺寸与描边不许各写一套。
 *
 * 外圈用 `ring-foreground/15` 而不是 `ring-border`：border 在深色下比多数 accent
 * 还深，圈等于没画；foreground 一个 token 在两种明暗里都成立。
 *
 * 没设识别色就画灰点：诚实地说「这间还没挑颜色」，不拿模板色顶上 —— 伪造成
 * 已有的答案比空着更糟。
 */
function AccentDot({
  accent,
  testId,
}: {
  accent: string | null;
  testId?: string;
}): JSX.Element {
  return (
    <span
      aria-hidden
      data-testid={testId}
      className={cn(
        'h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/15',
        accent ? undefined : 'bg-muted-foreground/30',
      )}
      style={accent ? { backgroundColor: accent } : undefined}
    />
  );
}

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
 * 第二件事单独在菜单底部、隔着一条分隔线：它是一个出口，不是第三个主题。出口
 * 不需要副标题解释自己 —— v0.8.2 删掉了原来那行「新建、改名、删除」。
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
    // 认不出模块（`/hlm` 本身、或一个不存在的段）就落**概览** —— 那是这个空间的
    // 首页。原来落 `maps`，等于在一个不认识的地址上还要替作者挑一间房（v0.8.2）。
    return found?.key ?? 'overview';
  })();

  /** 这间工作台的门牌色（v0.8.2 的 `data.accent`）；没设就 null —— 不拿模板色替它。 */
  const accent = workspace?.theme.data.accent ?? null;

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
            {/*
             * v0.8.2：每一行也带自己的门牌色。
             *
             * 触发器上那颗点只说明「你现在在哪」，可换主题时真正要做的判断是
             * 「另一间是什么样」—— 只看名字（默认主题 / 红楼梦）与编码，两行在
             * 视觉上是同一个东西。勾选回答「当前」，色点回答「哪一间」，两件事
             * 各占一格，谁也不顶替谁。
             */}
            <AccentDot accent={theme.data.accent ?? null} testId="theme-menu-accent" />
            <span className="min-w-0 flex-1 truncate">{theme.name}</span>
            <span className="shrink-0 font-mono text-2xs text-muted-foreground">{theme.code}</span>
          </button>
        );
      })}

      <div className="my-1 h-px bg-border" role="separator" />

      <Link
        to={SETTINGS_THEMES_PATH}
        role="menuitem"
        className={cn(itemClass, 'gap-1.5')}
        onClick={() => setOpen(false)}
      >
        <Settings2 className="h-3.5 w-3.5 shrink-0" />
        {/* 占掉色点那 10px：出口不是第三个主题，但它的字要和主题名对齐。 */}
        <span aria-hidden className="h-2.5 w-2.5 shrink-0" />
        主题配置
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
        {/*
         * v0.8.2：门牌色就是这枚圆点。
         *
         * 原先是通用的 `Layers` 图标 —— 它说的是「叠起来的一堆作品」，和这一格
         * 真正在回答的问题（**我在哪个世界**）不是一回事，而且每个主题长得一样。
         * 换成一个颜色，顶栏才第一次有「换个主题，连这里也会变」的可见证据。
         */}
        <AccentDot accent={accent} testId="theme-switcher-accent" />
        <span className="truncate font-kai text-sm">{workspace.theme.name}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </Button>
      {open && position ? createPortal(menu, document.body) : null}
    </div>
  );
}
