import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Map, Package, Puzzle, Rocket, Users } from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 工坊导航（v0.7.1）：资源 → 地图 → 角色 → 谜题 → 部署。
 *
 * 顺序按「先备料、再画图、再安排人物、最后出题与上线」的工作流排；`/` 落到
 * `/maps`（见 `router.tsx`），所以从根路径进来默认亮的是「地图」。
 */
const navItems = [
  { to: '/assets', label: '资源', icon: Package },
  { to: '/maps', label: '地图', icon: Map },
  { to: '/characters', label: '角色', icon: Users },
  { to: '/puzzles', label: '谜题', icon: Puzzle },
  { to: '/deployments', label: '部署', icon: Rocket },
];

const WORKSHOP_SUFFIX = ' · 工坊';

export function AppShell(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-6">
          <BrandLogo height={20} withWordmark suffix={WORKSHOP_SUFFIX} />
          {/* 五项时窄屏会挤，允许换行（不做折叠菜单）。 */}
          <nav className="flex flex-wrap items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    // `secondary` 与 `accent` 在浅色主题同值，选中与悬停分不出来
                    // （v0.7.0 §8 的踩坑）—— 选中态统一下沉一档实心 slate-200。
                    isActive
                      ? 'bg-slate-200 text-foreground dark:bg-slate-700 dark:text-slate-100'
                      : 'text-muted-foreground hover:bg-slate-200/70 hover:text-foreground dark:hover:bg-slate-700/70',
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {/* v0.5.7: theme switch — every console page rides this header. */}
            <ThemeToggle className="h-9 w-9" />
            {/* v0.5.4 FEAT-O07 (docs/v0.5.4.md §4): the way into the player side. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate('/play')}
              title="进入游戏首页"
            >
              游戏
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
