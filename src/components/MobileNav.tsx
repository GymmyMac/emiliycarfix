import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  CheckSquare,
  Cpu,
  BarChart3,
  Settings,
  Crosshair,
  Play,
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: LayoutGrid, path: '/dashboard' },
  { label: 'Intel', icon: Crosshair, path: '/competitor-intelligence' },
  { label: 'Approvals', icon: CheckSquare, path: '/approvals' },
  { label: 'Ops', icon: Cpu, path: '/operations' },
  { label: 'Videos', icon: Play, path: '/videos' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export default function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-card md:hidden">
      {navItems.map((item) => {
        const active = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 text-[10px] transition-all duration-200 ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <item.icon size={20} />
            <span className={active ? 'font-semibold' : ''}>{item.label}</span>
            {active && <span className="h-0.5 w-4 rounded-full bg-primary mt-0.5" />}
          </button>
        );
      })}
    </nav>
  );
}
