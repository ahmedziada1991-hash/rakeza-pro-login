import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TodayTargets } from "@/components/sales-rep/TodayTargets";
import { MyClientsTab } from "@/components/sales-rep/MyClientsTab";
import { FieldTab } from "@/components/sales-rep/FieldTab";
import { NotificationBell } from "@/components/NotificationBell";
import { AISearchBar } from "@/components/sales-rep/AISearchBar";
import { ChatHeaderIcon } from "@/components/chat/ChatHeaderIcon";
import { useNotificationGenerator } from "@/hooks/useNotificationGenerator";
import { Users, MapPin, LogOut, Target, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

const SalesRepDashboard = () => {
  const navigate = useNavigate();
  const { session, userRole, isLoading, signOut } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      navigate("/");
      return;
    }
  }, [session, isLoading, navigate]);

  useNotificationGenerator();

  if (isLoading) return null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="h-14 bg-card border-b border-border px-4 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-base font-cairo font-bold text-foreground">لوحة البائع</h1>
        <div className="flex items-center gap-2">
          <ChatHeaderIcon />
          <NotificationBell />
          <Button variant="ghost" size="icon" onClick={signOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-6 pb-8">
        {/* AI Search Bar */}
        <AISearchBar />

        {/* Section 1: Today's Targets */}
        <TodayTargets />

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="font-cairo gap-2"
            onClick={() => navigate("/dashboard/sales-rep/goals")}
          >
            <Target className="h-4 w-4" />
            أهدافي الشهرية
          </Button>
          <Button
            variant="outline"
            className="font-cairo gap-2"
            onClick={() => navigate("/dashboard/sales-rep/calendar")}
          >
            <CalendarDays className="h-4 w-4" />
            تقويم الصبات
          </Button>
        </div>

        {/* Tabs for Clients & Field */}
        <Tabs defaultValue="clients" dir="rtl">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="clients" className="font-cairo gap-2">
              <Users className="h-4 w-4" />
              عملائي
            </TabsTrigger>
            <TabsTrigger value="field" className="font-cairo gap-2">
              <MapPin className="h-4 w-4" />
              ميداني
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clients">
            <MyClientsTab />
          </TabsContent>

          <TabsContent value="field">
            <FieldTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default SalesRepDashboard;
