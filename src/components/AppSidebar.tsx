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
  Play,
  Grid3X3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Morning Brief', subtitle: 'What happened overnight', icon: LayoutGrid, path: '/dashboard' },
  { label: 'Flow', subtitle: 'All channels, every stage', icon: Grid3X3, path: '/flow' },
  { label: 'Intelligence', subtitle: 'Competitor keywords and gaps', icon: Crosshair, path: '/competitor-intelligence' },
  { label: 'Approvals', subtitle: 'Content waiting for your decision', icon: CheckSquare, path: '/approvals' },
  { label: 'Controls', subtitle: 'Turn things on, adjust the dials', icon: Cpu, path: '/operations' },
  { label: 'Fitting Guides', subtitle: 'YouTube videos by vehicle', icon: Play, path: '/videos' },
  { label: 'Pipeline', subtitle: 'Content flow from queue to published', icon: BarChart3, path: '/analytics' },
  { label: 'Connections', subtitle: 'APIs, integrations, credentials', icon: Settings, path: '/settings' },
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
              {expanded && (
                <div className="whitespace-nowrap overflow-hidden">
                  <span className="block text-sm leading-tight">{item.label}</span>
                  <span className="block text-[10px] leading-tight text-muted-foreground font-normal">{item.subtitle}</span>
                </div>
              )}
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
