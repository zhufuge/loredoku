import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Map, Package, Puzzle, Users } from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/maps', label: '地图', icon: Map },
  { to: '/assets', label: '资源', icon: Package },
  { to: '/characters', label: '角色', icon: Users },
  { to: '/puzzles', label: '谜题', icon: Puzzle },
];

const WORKSHOP_SUFFIX = ' · 工坊';

export function AppShell(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-6">
          <BrandLogo height={20} withWordmark suffix={WORKSHOP_SUFFIX} />
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
