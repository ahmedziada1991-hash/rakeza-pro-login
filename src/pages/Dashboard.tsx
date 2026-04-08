import { useParams, useNavigate, Outlet } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminDashboardContent } from "@/components/AdminDashboardContent";
import { ClientsManagement } from "@/components/ClientsManagement";
import { StationsManagement } from "@/components/StationsManagement";

const ROLE_LABELS: Record<string, string> = {
  admin: "أدمن",
  sales: "مبيعات",
  followup: "متابعة",
  execution: "تنفيذ",
};

const Dashboard = () => {
  const { role, "*": subpath } = useParams();
  const navigate = useNavigate();
  const { session, userRole, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      navigate("/");
      return;
    }
    if (userRole && userRole !== role) {
      navigate(`/dashboard/${userRole}`);
    }
  }, [session, userRole, role, isLoading, navigate]);

  if (isLoading || !role || !ROLE_LABELS[role]) return null;

  if (role === "admin") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AdminSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 bg-card border-b border-border px-4 flex items-center justify-between shrink-0">
              <SidebarTrigger className="mr-2" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-cairo text-muted-foreground">مرحباً، المدير</span>
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-cairo font-bold text-sm">م</span>
                </div>
              </div>
            </header>
            <main className="flex-1 p-4 md:p-6 overflow-auto">
              {!subpath ? (
                <AdminDashboardContent />
              ) : subpath === "clients" ? (
                <ClientsManagement />
              ) : subpath === "stations" ? (
                <StationsManagement />
              ) : (
                <Outlet />
              )}
            </main>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // Fallback for other roles (sales, followup, execution)
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-cairo font-bold text-foreground mb-2">
          لوحة تحكم {ROLE_LABELS[role]}
        </h2>
        <p className="text-muted-foreground font-cairo">سيتم بناء هذه اللوحة قريباً...</p>
      </div>
    </div>
  );
};

export default Dashboard;
