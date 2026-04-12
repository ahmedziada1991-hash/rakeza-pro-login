import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Phone, Target, TrendingUp, AlertTriangle, CheckCircle2, Clock
} from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";
import { useEffect } from "react";

export function FollowUpGoals() {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const oneWeekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

  // Daily target from daily_performance or default
  const { data: dailyPerf } = useQuery({
    queryKey: ["followup-daily-perf", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("daily_performance")
        .select("target_calls, actual_calls, target_visits")
        .eq("user_id", user.id)
        .eq("date", today)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Today's call logs count
  const { data: todayCalls = 0 } = useQuery({
    queryKey: ["followup-today-calls", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await (supabase as any)
        .from("call_logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("call_type", "followup")
        .gte("call_date", `${today}T00:00:00`)
        .lte("call_date", `${today}T23:59:59`);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user?.id,
  });

  // Monthly closed deals (clients moved to execution this month)
  const { data: monthlyDeals } = useQuery({
    queryKey: ["followup-monthly-deals", monthStart, monthEnd],
    queryFn: async () => {
      // Count orders marked done this month
      const { count: closedCount } = await supabase
        .from("pour_orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "done")
        .gte("scheduled_date", monthStart)
        .lte("scheduled_date", monthEnd);

      // Count clients transferred to execution
      const { count: transferCount } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("status", "execution");

      return {
        closed: closedCount || 0,
        transferred: transferCount || 0,
      };
    },
  });

  // Clients not followed up in over a week
  const { data: neglectedClients = [] } = useQuery({
    queryKey: ["followup-neglected", oneWeekAgo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone, next_followup_date, status")
        .in("status", ["followup", "hot", "warm", "cold", "active"])
        .or(`next_followup_date.is.null,next_followup_date.lt.${oneWeekAgo}`)
        .order("next_followup_date", { ascending: true })
        .limit(20);
      if (error) return [];
      return data || [];
    },
  });

  // Show alert for neglected clients
  useEffect(() => {
    if (neglectedClients.length > 0) {
      toast({
        title: "⚠️ عملاء بدون متابعة",
        description: `يوجد ${neglectedClients.length} عميل لم يتم متابعتهم منذ أكثر من أسبوع`,
        variant: "destructive",
      });
    }
  }, [neglectedClients.length]);

  const targetCalls = dailyPerf?.target_calls || 10;
  const actualCalls = dailyPerf?.actual_calls || todayCalls;
  const callProgress = Math.min(100, Math.round((actualCalls / targetCalls) * 100));

  const monthlyTarget = dailyPerf?.target_visits || 15; // reads admin-set monthly target
  const monthlyClosed = monthlyDeals?.closed || 0;
  const monthlyProgress = Math.min(100, Math.round((monthlyClosed / monthlyTarget) * 100));
  const closeRate = monthlyDeals?.transferred
    ? Math.round((monthlyClosed / (monthlyClosed + (monthlyDeals.transferred - monthlyClosed))) * 100) || 0
    : 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-cairo font-bold text-foreground">أهدافي</h2>
        <p className="text-sm text-muted-foreground font-cairo">
          {format(new Date(), "EEEE d MMMM yyyy", { locale: ar })}
        </p>
      </div>

      {/* Daily Target */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-cairo text-lg flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            هدف اليوم - المكالمات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm font-cairo">
            <span className="text-muted-foreground">المكالمات المطلوبة</span>
            <span className="font-bold text-foreground">{targetCalls}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-cairo">
            <span className="text-muted-foreground">المكالمات المنجزة</span>
            <span className="font-bold text-chart-2">{actualCalls}</span>
          </div>
          <Progress value={callProgress} className="h-3" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-cairo">
              {callProgress >= 100 ? "🎉 تم تحقيق الهدف!" : `متبقي ${targetCalls - actualCalls} مكالمة`}
            </span>
            <Badge
              variant="outline"
              className={`font-cairo ${callProgress >= 100 ? "text-chart-2 border-chart-2/30" : callProgress >= 50 ? "text-chart-4 border-chart-4/30" : "text-destructive border-destructive/30"}`}
            >
              {callProgress}%
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Target */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-cairo text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-chart-4" />
            هدف الشهر - الصفقات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="space-y-1">
              <p className="text-2xl font-bold text-foreground">{monthlyTarget}</p>
              <p className="text-xs text-muted-foreground font-cairo">المطلوب</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-chart-2">{monthlyClosed}</p>
              <p className="text-xs text-muted-foreground font-cairo">المنجز</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-primary">{closeRate}%</p>
              <p className="text-xs text-muted-foreground font-cairo">نسبة الإغلاق</p>
            </div>
          </div>
          <Progress value={monthlyProgress} className="h-3" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-cairo">
              {monthlyProgress >= 100 ? "🎉 ممتاز!" : `متبقي ${monthlyTarget - monthlyClosed} صفقة`}
            </span>
            <Badge
              variant="outline"
              className={`font-cairo ${monthlyProgress >= 100 ? "text-chart-2 border-chart-2/30" : monthlyProgress >= 50 ? "text-chart-4 border-chart-4/30" : "text-destructive border-destructive/30"}`}
            >
              {monthlyProgress}%
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Neglected Clients Alert */}
      {neglectedClients.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="font-cairo text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              عملاء بدون متابعة ({neglectedClients.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground font-cairo mb-3">
              العملاء التالية لم يتم متابعتهم منذ أكثر من أسبوع
            </p>
            <div className="space-y-2">
              {neglectedClients.map((client: any) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-2 rounded-md bg-destructive/5 border border-destructive/10"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    <span className="font-cairo text-sm font-medium">{client.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {client.next_followup_date && (
                      <span className="text-xs text-muted-foreground font-cairo">
                        آخر متابعة: {format(new Date(client.next_followup_date), "d/M")}
                      </span>
                    )}
                    {client.phone && (
                      <a
                        href={`tel:${client.phone}`}
                        className="text-primary hover:text-primary/80"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
