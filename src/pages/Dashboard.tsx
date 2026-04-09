import { useParams, useNavigate, Outlet, useLocation } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminDashboardContent } from "@/components/AdminDashboardContent";
import { ClientsManagement } from "@/components/ClientsManagement";
import { StationsManagement } from "@/components/StationsManagement";
import { ReportsPage } from "@/components/ReportsPage";
import { OrderForm } from "@/components/OrderForm";
import { FinancePage } from "@/components/FinancePage";
import { OrdersList } from "@/components/OrdersList";
import { SettingsPage } from "@/components/SettingsPage";
import { SalesPage } from "@/components/SalesPage";
import { SmartTargetsPage } from "@/components/SmartTargetsPage";
import { PourCalendarPage } from "@/components/PourCalendarPage";
import { NotificationBell } from "@/components/NotificationBell";
import { useNotificationGenerator } from "@/hooks/useNotificationGenerator";

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
    if (userRole === "sales") {
      navigate("/dashboard/sales-rep", { replace: true });
      return;
    }
    if (userRole && userRole !== role) {
      navigate(`/dashboard/${userRole}`);
    }
  }, [session, userRole, role, isLoading, navigate]);

  useNotificationGenerator();

  if (isLoading || !role || !ROLE_LABELS[role]) return null;

  if (role === "admin") {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AdminSidebar />
          <div className="flex-1 flex flex-col min-w-0">
             <header className="h-14 bg-card border-b border-border px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1">
                <SidebarTrigger className="mr-1" />
                {subpath && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate("/dashboard/admin")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Home className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />
                <span className="text-sm font-cairo text-muted-foreground">مرحباً، المدير</span>
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-cairo font-bold text-sm">م</span>
                </div>
              </div>
            </header>
            <main className="flex-1 p-4 md:p-6 overflow-auto">
              {!subpath ? (
                <AdminDashboardContent />
              ) : subpath === "sales" ? (
                <SalesPage />
              ) : subpath === "clients" ? (
                <ClientsManagement />
              ) : subpath === "stations" ? (
                <StationsManagement />
              ) : subpath === "reports" ? (
                <ReportsPage />
              ) : subpath === "orders" ? (
                <OrdersList />
              ) : subpath === "orders/new" ? (
                <OrderForm />
              ) : subpath?.match(/^orders\/(\d+)\/edit$/) ? (
                <OrderForm orderId={subpath.match(/^orders\/(\d+)\/edit$/)?.[1]} />
              ) : subpath === "finance" ? (
                <FinancePage />
              ) : subpath === "settings" ? (
                <SettingsPage />
              ) : subpath === "targets" ? (
                <SmartTargetsPage />
              ) : subpath === "calendar" ? (
                <PourCalendarPage />
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
