import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Phone, MapPin, CalendarDays, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function DailyReportPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const now = new Date();
  const todayStr = format(selectedDate, "yyyy-MM-dd");
  const todayLabel = selectedDate.toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const isToday = format(now, "yyyy-MM-dd") === todayStr;
  const isAfter2PM = isToday && now.getHours() >= 14;

  // Get all salespeople
  const { data: salesUsers } = useQuery({
    queryKey: ["admin-sales-users"],
    queryFn: async () => {
      const { data: roles } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "sales");
      if (!roles?.length) return [];

      const userIds = roles.map((r: any) => r.user_id);
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, name")
        .in("id", userIds);
      return profiles || [];
    },
  });

  // Get latest targets
  const { data: targets } = useQuery({
    queryKey: ["admin-daily-targets"],
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

  // Today's call logs (all users)
  const { data: todayCalls } = useQuery({
    queryKey: ["admin-all-calls-today", todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("call_logs")
        .select("id, user_id, client_id, notes, call_date")
        .gte("call_date", `${todayStr}T00:00:00`)
        .lte("call_date", `${todayStr}T23:59:59`);
      return data || [];
    },
  });

  // Today's field visits (all users)
  const { data: todayVisits } = useQuery({
    queryKey: ["admin-all-visits-today", todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("field_locations")
        .select("id, user_id, created_at")
        .gte("created_at", `${todayStr}T00:00:00`)
        .lte("created_at", `${todayStr}T23:59:59`);
      return data || [];
    },
  });

  // Today's pour date clients
  const { data: pourClients } = useQuery({
    queryKey: ["admin-pour-clients-today", todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("clients")
        .select("id, name, phone")
        .gte("expected_pour_date", `${todayStr}T00:00:00`)
        .lte("expected_pour_date", `${todayStr}T23:59:59`);
      return data || [];
    },
  });

  const targetCalls = targets?.calls_per_day || 15;
  const targetVisits = targets?.visits_per_day || 5;
  const totalCalls = todayCalls?.length || 0;
  const totalVisits = todayVisits?.length || 0;
  const totalPour = pourClients?.length || 0;

  // Called client IDs today
  const calledClientIds = new Set((todayCalls || []).map((c: any) => c.client_id));

  // Call notes per client
  const clientCallNotes: Record<number, string> = {};
  (todayCalls || []).forEach((c: any) => {
    if (c.client_id && c.notes) {
      clientCallNotes[c.client_id] = c.notes;
    }
  });

  // Per-salesperson data
  const salesData = (salesUsers || []).map((sp: any) => {
    const spCalls = (todayCalls || []).filter((c: any) => c.user_id === sp.id);
    const spVisits = (todayVisits || []).filter((v: any) => v.user_id === sp.id);
    const callCount = spCalls.length;
    const visitCount = spVisits.length;
    const callPercent = Math.min(100, Math.round((callCount / targetCalls) * 100));
    const visitPercent = Math.min(100, Math.round((visitCount / targetVisits) * 100));
    const overallPercent = Math.round((callPercent + visitPercent) / 2);

    // Pour clients contacted by this salesperson
    const spCalledClientIds = new Set(spCalls.map((c: any) => c.client_id));

    return {
      ...sp,
      callCount,
      visitCount,
      callPercent,
      visitPercent,
      overallPercent,
      spCalledClientIds,
    };
  });

  // Uncalled pour clients after 2 PM
  const uncalledPourClients = (pourClients || []).filter((c: any) => !calledClientIds.has(c.id));

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-cairo font-bold text-foreground">📋 تقرير اليوم</h2>
        <span className="text-sm font-cairo text-muted-foreground">{todayLabel}</span>
      </div>

      {/* Alert: uncalled pour clients after 2PM */}
      {isAfter2PM && uncalledPourClients.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <h3 className="font-cairo font-bold text-destructive">
                ⚠️ تنبيه: {uncalledPourClients.length} عميل موعد صبتهم النهارده ومتكلمهمش!
              </h3>
            </div>
            <div className="space-y-1">
              {uncalledPourClients.map((c: any) => (
                <p key={c.id} className="text-sm font-cairo text-foreground">
                  • {c.name} - {c.phone}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-lg bg-chart-3/10">
              <Phone className="h-5 w-5 text-chart-3" />
            </div>
            <div>
              <p className="text-2xl font-cairo font-bold text-foreground">{totalCalls}</p>
              <p className="text-xs font-cairo text-muted-foreground">مكالمة اليوم</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-lg bg-chart-4/10">
              <MapPin className="h-5 w-5 text-chart-4" />
            </div>
            <div>
              <p className="text-2xl font-cairo font-bold text-foreground">{totalVisits}</p>
              <p className="text-xs font-cairo text-muted-foreground">زيارة ميدانية</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-cairo font-bold text-foreground">{totalPour}</p>
              <p className="text-xs font-cairo text-muted-foreground">موعد صبة</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-salesperson breakdown */}
      {salesData.length === 0 ? (
        <p className="text-center font-cairo text-muted-foreground py-8">لا يوجد بائعين مسجلين</p>
      ) : (
        <div className="space-y-4">
          {salesData.map((sp: any) => (
            <Card key={sp.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-cairo">{sp.name || "بائع"}</CardTitle>
                  <Badge
                    className={`font-cairo ${
                      sp.overallPercent >= 80
                        ? "bg-chart-2/15 text-chart-2"
                        : sp.overallPercent >= 50
                        ? "bg-chart-4/15 text-chart-4"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {sp.overallPercent}% إنجاز
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Calls & Visits */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm font-cairo">
                      <span className="text-muted-foreground">المكالمات</span>
                      <span>{sp.callCount} / {targetCalls}</span>
                    </div>
                    <div className="relative">
                      <Progress value={sp.callPercent} className="h-2" />
                      <div
                        className={`absolute inset-0 h-2 rounded-full transition-all ${
                          sp.callPercent >= 80 ? "bg-chart-2" : sp.callPercent >= 50 ? "bg-chart-4" : "bg-destructive"
                        }`}
                        style={{ width: `${sp.callPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm font-cairo">
                      <span className="text-muted-foreground">الزيارات</span>
                      <span>{sp.visitCount} / {targetVisits}</span>
                    </div>
                    <div className="relative">
                      <Progress value={sp.visitPercent} className="h-2" />
                      <div
                        className={`absolute inset-0 h-2 rounded-full transition-all ${
                          sp.visitPercent >= 80 ? "bg-chart-2" : sp.visitPercent >= 50 ? "bg-chart-4" : "bg-destructive"
                        }`}
                        style={{ width: `${sp.visitPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Pour date clients for this salesperson */}
                {(pourClients || []).length > 0 && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-cairo font-bold text-muted-foreground mb-2">
                      عملاء موعد الصبة اليوم:
                    </p>
                    <div className="space-y-1.5">
                      {(pourClients || []).map((client: any) => {
                        const called = sp.spCalledClientIds.has(client.id);
                        const note = clientCallNotes[client.id];
                        return (
                          <div key={client.id} className="flex items-start gap-2 text-sm">
                            {called ? (
                              <CheckCircle2 className="h-4 w-4 text-chart-2 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="font-cairo text-foreground">{client.name}</span>
                              {called && note && (
                                <p className="text-xs font-cairo text-muted-foreground truncate">
                                  💬 {note}
                                </p>
                              )}
                              {!called && isAfter2PM && (
                                <p className="text-xs font-cairo text-destructive">لم يتم التواصل بعد!</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
