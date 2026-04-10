import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ExecutionSidebar } from "@/components/ExecutionSidebar";
import { ExecutionContent } from "@/components/ExecutionContent";
import { NotificationBell } from "@/components/NotificationBell";

const ExecutionDashboard = () => {
  const navigate = useNavigate();
  const { session, userRole, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      navigate("/");
      return;
    }
    if (userRole && userRole !== "execution" && userRole !== "admin") {
      navigate(`/dashboard/${userRole}`);
    }
  }, [session, userRole, isLoading, navigate]);

  if (isLoading) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full" dir="rtl">
        <ExecutionSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 bg-card border-b border-border px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1">
              <SidebarTrigger className="mr-1" />
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <span className="text-sm font-cairo text-muted-foreground">مرحباً، التنفيذ</span>
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-cairo font-bold text-sm">ت</span>
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <ExecutionContent />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ExecutionDashboard;
