import { NavLink, Outlet } from 'react-router-dom';
import { Map, LayoutGrid, Package, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/projects', label: '地图', icon: Map },
  { to: '/items', label: '物品', icon: Package },
  { to: '/characters', label: '角色', icon: Users },
];

export function AppShell(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-6">
          <div className="flex items-center gap-2 font-semibold">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <span>Murdoku Maker</span>
          </div>
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
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
