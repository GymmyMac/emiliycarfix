import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutGrid,
  CheckSquare,
  Cpu,
  BarChart3,
  Settings,
  LogOut,
  Crosshair,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', icon: LayoutGrid, path: '/dashboard' },
  { label: 'Competitors', icon: Crosshair, path: '/competitor-intelligence' },
  { label: 'Approvals', icon: CheckSquare, path: '/approvals' },
  { label: 'Operations', icon: Cpu, path: '/operations' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export default function AppSidebar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={cn(
        'fixed left-0 top-0 z-30 hidden md:flex h-screen flex-col border-r border-border bg-background transition-all duration-300 ease-in-out',
        expanded ? 'w-[200px]' : 'w-[60px]'
      )}
    >
      <div className="flex h-14 items-center px-4 overflow-hidden">
        {expanded ? (
          <span className="text-xl font-bold text-foreground tracking-tight">CARFIX</span>
        ) : (
          <span className="text-lg font-bold text-primary">C</span>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={!expanded ? item.label : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-200',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                !expanded && 'justify-center px-0'
              )}
            >
              <item.icon size={18} className="shrink-0" />
              {expanded && <span className="whitespace-nowrap overflow-hidden">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          onClick={signOut}
          title={!expanded ? 'Logout' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200',
            !expanded && 'justify-center px-0'
          )}
        >
          <LogOut size={18} className="shrink-0" />
          {expanded && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
