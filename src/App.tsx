import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import AdminLayout from "./components/AdminLayout";
import Dashboard from "./pages/Dashboard";
import Ideas from "./pages/Ideas";
import Analytics from "./pages/Analytics";
import Emily from "./pages/Emily";
import CalendarPage from "./pages/Calendar";
import ContentQueue from "./pages/ContentQueue";
import Settings from "./pages/Settings";
import Initiatives from "./pages/Initiatives";
import NotFound from "./pages/NotFound";
import BatchReview from "./pages/BatchReview";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AdminLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/content-queue" element={<ContentQueue />} />
              <Route path="/ideas" element={<Ideas />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/emily" element={<Emily />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/initiatives" element={<Initiatives />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
