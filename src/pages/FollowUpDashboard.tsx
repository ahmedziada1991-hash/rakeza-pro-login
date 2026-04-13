import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUsersTableId } from "@/hooks/useUsersTableId";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { FollowUpSidebar } from "@/components/FollowUpSidebar";
import { FollowUpContent } from "@/components/FollowUpContent";
import { FollowUpGoals } from "@/components/FollowUpGoals";
import { FollowUpTargetsAdmin } from "@/components/FollowUpTargetsAdmin";
import { ClientAssignment } from "@/components/ClientAssignment";
import { PriceOffersPage } from "@/components/PriceOffersPage";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatHeaderIcon } from "@/components/chat/ChatHeaderIcon";
import { ChatPage } from "@/components/chat/ChatPage";

const FollowUpDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, userRole, isLoading, user } = useAuth();
  const { userName } = useUsersTableId();

  const isAssignPage = location.pathname.endsWith("/assign");
  const isGoalsPage = location.pathname.endsWith("/goals");
  const isTargetsPage = location.pathname.endsWith("/targets");
  const isOffersPage = location.pathname.endsWith("/offers");
  const isChatPage = location.pathname.endsWith("/chat");

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      navigate("/");
      return;
    }
    if ((isAssignPage || isTargetsPage) && userRole !== "admin") {
      navigate("/dashboard/follow-up", { replace: true });
      return;
    }
    if (userRole && userRole !== "followup" && userRole !== "admin") {
      navigate(`/dashboard/${userRole}`);
    }
  }, [session, userRole, isLoading, navigate, isAssignPage]);

  if (isLoading) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full" dir="rtl">
        <FollowUpSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 bg-card border-b border-border px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1">
              <SidebarTrigger className="mr-1" />
            </div>
            <div className="flex items-center gap-2">
              <ChatHeaderIcon />
              <NotificationBell />
              <span className="text-sm font-cairo text-muted-foreground">مرحباً يا {userName ?? "المتابع"}! 👋</span>
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-cairo font-bold text-sm">
                  {(userName ?? "م").charAt(0)}
                </span>
              </div>
            </div>
          </header>
          <main className={`flex-1 overflow-auto ${isChatPage ? "" : "p-4 md:p-6"}`}>
            {isChatPage ? (
              <ChatPage />
            ) : isOffersPage ? (
              <PriceOffersPage
                prefillName={new URLSearchParams(location.search).get("clientName") || undefined}
                prefillPhone={new URLSearchParams(location.search).get("phone") || undefined}
              />
            ) : isAssignPage ? <ClientAssignment /> : isTargetsPage ? <FollowUpTargetsAdmin /> : isGoalsPage ? <FollowUpGoals /> : <FollowUpContent />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default FollowUpDashboard;
