import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppSidebar from './AppSidebar';
import MobileNav from './MobileNav';
import SparklesText from './SparklesText';
import { LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function AdminLayout() {
  const { session, user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const initial = user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      {/* Mobile header */}
      <header className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <SparklesText text="CARFIX" className="text-lg" />
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initial}</AvatarFallback>
          </Avatar>
          <button onClick={signOut} className="p-2 text-muted-foreground">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 md:ml-[220px] pt-14 md:pt-0 pb-16 md:pb-0 px-4 md:px-6 py-4 md:py-6 overflow-x-hidden">
        <Outlet />
      </main>

      <MobileNav />
    </div>
  );
}
