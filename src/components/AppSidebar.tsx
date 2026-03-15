import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutGrid,
  Inbox,
  Lightbulb,
  BarChart3,
  Calendar,
  MessageCircle,
  Settings,
  LogOut,
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: LayoutGrid, path: '/dashboard' },
  { label: 'Content Queue', icon: Inbox, path: '/content-queue' },
  { label: 'Ideas Bucket', icon: Lightbulb, path: '/ideas' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'Calendar', icon: Calendar, path: '/calendar' },
  { label: 'Emily', icon: MessageCircle, path: '/emily', isEmily: true },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export default function AppSidebar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-[220px] flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center px-5">
        <span className="text-xl font-bold tracking-tight text-primary">CARFIX</span>
        <span className="ml-1.5 text-xs font-medium text-muted-foreground">NZ</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-accent text-foreground'
                  : 'text-sidebar-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <item.icon
                size={18}
                className={item.isEmily ? 'text-emily' : active ? 'text-primary' : ''}
              />
              <span className={item.isEmily ? 'text-emily font-medium' : ''}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-border p-3">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
