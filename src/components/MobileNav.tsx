import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutGrid,
  Inbox,
  Lightbulb,
  MessageCircle,
  MoreHorizontal,
  Rocket,
  ClipboardCheck,
  BarChart3,
  Calendar,
  Settings,
  X,
} from 'lucide-react';

const mainItems = [
  { label: 'Home', icon: LayoutGrid, path: '/dashboard' },
  { label: 'Queue', icon: Inbox, path: '/content-queue' },
  { label: 'Ideas', icon: Lightbulb, path: '/ideas' },
  { label: 'Emily', icon: MessageCircle, path: '/emily', isEmily: true },
];

const moreItems = [
  { label: 'Review Queue', icon: ClipboardCheck, path: '/review' },
  { label: 'Initiatives', icon: Rocket, path: '/initiatives' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'Calendar', icon: Calendar, path: '/calendar' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export default function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

  const isMoreActive = moreItems.some((item) => location.pathname === item.path);

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowMore(false)}>
          <div
            className="absolute bottom-[56px] left-0 right-0 bg-card border-t border-border rounded-t-xl p-4 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-foreground">More</span>
              <button onClick={() => setShowMore(false)} className="p-1">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            {moreItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setShowMore(false); }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm transition-all duration-300 ${
                    active ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <item.icon size={20} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-card md:hidden">
        {mainItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 text-[10px] transition-all duration-300 ${
                active ? 'text-primary' : item.isEmily && active ? 'text-emily' : 'text-muted-foreground'
              }`}
            >
              <item.icon size={20} className={item.isEmily ? 'text-emily' : ''} />
              <span className={active ? 'font-semibold' : ''}>{item.label}</span>
              {active && <span className="h-0.5 w-4 rounded-full bg-primary mt-0.5" />}
            </button>
          );
        })}
        <button
          onClick={() => setShowMore(!showMore)}
          className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 text-[10px] transition-all duration-300 ${
            isMoreActive ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MoreHorizontal size={20} />
          <span className={isMoreActive ? 'font-semibold' : ''}>More</span>
          {isMoreActive && <span className="h-0.5 w-4 rounded-full bg-primary mt-0.5" />}
        </button>
      </nav>
    </>
  );
}
