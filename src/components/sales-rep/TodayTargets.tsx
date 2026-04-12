import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Phone, MapPin, Target } from "lucide-react";

export function TodayTargets() {
  const { user } = useAuth();
  const todayStr = new Date().toISOString().split("T")[0];
  const todayLabel = new Date().toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Get user name from users table
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("users")
        .select("name")
        .eq("auth_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Get latest targets
  const { data: targets } = useQuery({
    queryKey: ["latest-target-for-rep"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("targets")
        .select("calls_per_day, visits_per_day")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Count today's calls
  const { data: callCount } = useQuery({
    queryKey: ["my-calls-today", user?.id, todayStr],
    queryFn: async () => {
      const startOfDay = `${todayStr}T00:00:00`;
      const endOfDay = `${todayStr}T23:59:59`;
      const { count } = await (supabase as any)
        .from("call_logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .gte("call_date", startOfDay)
        .lte("call_date", endOfDay);
      return count || 0;
    },
    enabled: !!user,
  });

  // Count today's visits
  const { data: visitCount } = useQuery({
    queryKey: ["my-visits-today", user?.id, todayStr],
    queryFn: async () => {
      const startOfDay = `${todayStr}T00:00:00`;
      const endOfDay = `${todayStr}T23:59:59`;
      const { count } = await (supabase as any)
        .from("field_locations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay);
      return count || 0;
    },
    enabled: !!user,
  });

  const targetCalls = targets?.calls_per_day || 15;
  const targetVisits = targets?.visits_per_day || 5;
  const actualCalls = callCount || 0;
  const actualVisits = visitCount || 0;
  const callsPercent = Math.min(100, Math.round((actualCalls / targetCalls) * 100));
  const visitsPercent = Math.min(100, Math.round((actualVisits / targetVisits) * 100));

  const userName = profile?.name || user?.email?.split("@")[0] || "البائع";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-cairo font-bold text-foreground">
            مرحباً، {userName}
          </h2>
        </div>
        <span className="text-sm font-cairo text-muted-foreground">{todayLabel}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-chart-3/10">
                  <Phone className="h-4 w-4 text-chart-3" />
                </div>
                <span className="font-cairo font-medium text-foreground">المكالمات</span>
              </div>
              <span className="text-sm font-cairo text-muted-foreground">
                {actualCalls} / {targetCalls}
              </span>
            </div>
            <Progress
              value={callsPercent}
              className="h-3"
            />
            <p className="text-xs font-cairo text-muted-foreground text-center">
              {callsPercent}% مكتمل
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-chart-4/10">
                  <MapPin className="h-4 w-4 text-chart-4" />
                </div>
                <span className="font-cairo font-medium text-foreground">الزيارات الميدانية</span>
              </div>
              <span className="text-sm font-cairo text-muted-foreground">
                {actualVisits} / {targetVisits}
              </span>
            </div>
            <Progress
              value={visitsPercent}
              className="h-3"
            />
            <p className="text-xs font-cairo text-muted-foreground text-center">
              {visitsPercent}% مكتمل
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
