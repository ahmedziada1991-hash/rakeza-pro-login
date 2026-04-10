import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Phone, MapPin, CalendarDays, AlertCircle, CheckCircle2, XCircle, Users, Handshake } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

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

  // Get all followup users
  const { data: followupUsers } = useQuery({
    queryKey: ["admin-followup-users"],
    queryFn: async () => {
      const { data: roles } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "followup");
      if (!roles?.length) return [];
      const userIds = roles.map((r: any) => r.user_id);
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, name")
        .in("id", userIds);
      return profiles || [];
    },
  });

  // Get targets
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

  // Followup targets from daily_performance
  const { data: followupTargets } = useQuery({
    queryKey: ["admin-followup-targets", todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("daily_performance")
        .select("user_id, target_calls, target_visits")
        .eq("date", todayStr);
      return data || [];
    },
  });

  // Today's call logs (all users)
  const { data: todayCalls } = useQuery({
    queryKey: ["admin-all-calls-today", todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("call_logs")
        .select("id, user_id, client_id, notes, call_date, employee_name")
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
        .select("id, name, phone, assigned_sales_id, assigned_followup_id")
        .gte("expected_pour_date", `${todayStr}T00:00:00`)
        .lte("expected_pour_date", `${todayStr}T23:59:59`);
      return data || [];
    },
  });

  // Clients converted to followup today
  const { data: convertedClients } = useQuery({
    queryKey: ["admin-converted-today", todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("clients")
        .select("id")
        .eq("is_converted", true)
        .gte("created_at", `${todayStr}T00:00:00`)
        .lte("created_at", `${todayStr}T23:59:59`);
      return data || [];
    },
  });

  // Closed deals today (pour_orders with status done scheduled today)
  const { data: closedDeals } = useQuery({
    queryKey: ["admin-closed-deals-today", todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pour_orders")
        .select("id, client_id")
        .eq("status", "done")
        .eq("scheduled_date", todayStr);
      return data || [];
    },
  });

  const targetCalls = targets?.calls_per_day || 15;
  const targetVisits = targets?.visits_per_day || 5;
  const totalCalls = todayCalls?.length || 0;
  const totalVisits = todayVisits?.length || 0;
  const totalPour = pourClients?.length || 0;
  const totalConverted = convertedClients?.length || 0;

  // Called client IDs today
  const calledClientIds = new Set((todayCalls || []).map((c: any) => c.client_id));

  // Client call notes
  const clientCallNotes: Record<number, string> = {};
  (todayCalls || []).forEach((c: any) => {
    if (c.client_id && c.notes) clientCallNotes[c.client_id] = c.notes;
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
    const spCalledClientIds = new Set(spCalls.map((c: any) => c.client_id));
    // Pour clients assigned to this salesperson
    const spPourClients = (pourClients || []).filter((c: any) => c.assigned_sales_id === sp.id);

    return { ...sp, callCount, visitCount, callPercent, visitPercent, overallPercent, spCalledClientIds, spPourClients };
  });

  // Per-followup data
  const followupData = (followupUsers || []).map((fu: any) => {
    const fuCalls = (todayCalls || []).filter((c: any) => c.user_id === fu.id);
    const callCount = fuCalls.length;
    // Get target for this followup user
    const fuTarget = (followupTargets || []).find((t: any) => t.user_id === fu.id);
    const fuTargetCalls = fuTarget?.target_calls || 10;
    const callPercent = Math.min(100, Math.round((callCount / fuTargetCalls) * 100));
    // Closed deals: clients assigned to this followup with done pours today
    const fuClients = (pourClients || []).filter((c: any) => c.assigned_followup_id === fu.id);
    const fuClosedCount = (closedDeals || []).filter((d: any) =>
      fuClients.some((c: any) => c.id === d.client_id)
    ).length;
    const fuCalledClientIds = new Set(fuCalls.map((c: any) => c.client_id));
    // Pour clients assigned to this followup
    const fuPourClients = (pourClients || []).filter((c: any) => c.assigned_followup_id === fu.id);

    return { ...fu, callCount, callPercent, fuClosedCount, fuTargetCalls, fuCalledClientIds, fuPourClients };
  });

  // Uncalled pour clients after 2 PM - check both sales and followup
  const uncalledPourClients = (pourClients || []).filter((c: any) => !calledClientIds.has(c.id));

  // Find staff who haven't called their pour clients
  const alertStaff: { name: string; clients: string[] }[] = [];
  if (isAfter2PM) {
    salesData.forEach((sp: any) => {
      const uncalled = sp.spPourClients.filter((c: any) => !sp.spCalledClientIds.has(c.id));
      if (uncalled.length > 0) {
        alertStaff.push({ name: sp.name || "بائع", clients: uncalled.map((c: any) => c.name) });
      }
    });
    followupData.forEach((fu: any) => {
      const uncalled = fu.fuPourClients.filter((c: any) => !fu.fuCalledClientIds.has(c.id));
      if (uncalled.length > 0) {
        alertStaff.push({ name: fu.name || "متابع", clients: uncalled.map((c: any) => c.name) });
      }
    });
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-cairo font-bold text-foreground">📋 {isToday ? "تقرير اليوم" : "تقرير يوم"}</h2>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="font-cairo gap-2">
              <CalendarDays className="h-4 w-4" />
              {todayLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              className="p-3 pointer-events-auto"
              disabled={(date) => date > new Date()}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Alert: staff not calling pour clients after 2PM */}
      {isAfter2PM && alertStaff.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <h3 className="font-cairo font-bold text-destructive">
                ⚠️ تنبيه: موظفين لم يتواصلوا مع عملاء موعد صبتهم اليوم
              </h3>
            </div>
            <div className="space-y-2">
              {alertStaff.map((s, i) => (
                <div key={i} className="text-sm font-cairo text-foreground">
                  <span className="font-bold">{s.name}:</span>{" "}
                  {s.clients.map((c, j) => (
                    <Badge key={j} variant="outline" className="mr-1 mb-1 text-destructive border-destructive/30">
                      {c}
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-chart-3/10">
              <Phone className="h-5 w-5 text-chart-3" />
            </div>
            <div>
              <p className="text-2xl font-cairo font-bold text-foreground">{totalCalls}</p>
              <p className="text-xs font-cairo text-muted-foreground">مكالمة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-chart-4/10">
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
            <div className="p-2.5 rounded-lg bg-primary/10">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-cairo font-bold text-foreground">{totalPour}</p>
              <p className="text-xs font-cairo text-muted-foreground">موعد صبة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-chart-2/10">
              <Users className="h-5 w-5 text-chart-2" />
            </div>
            <div>
              <p className="text-2xl font-cairo font-bold text-foreground">{totalConverted}</p>
              <p className="text-xs font-cairo text-muted-foreground">محول للمتابعة</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales team section */}
      <div>
        <h3 className="text-lg font-cairo font-bold text-foreground mb-3 flex items-center gap-2">
          <Phone className="h-5 w-5 text-chart-3" />
          فريق المبيعات
        </h3>
        {salesData.length === 0 ? (
          <p className="text-center font-cairo text-muted-foreground py-6">لا يوجد بائعين</p>
        ) : (
          <div className="space-y-3">
            {salesData.map((sp: any) => (
              <Card key={sp.id}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-cairo">{sp.name || "بائع"}</CardTitle>
                    <Badge
                      className={`font-cairo text-xs ${
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
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-cairo">
                        <span className="text-muted-foreground">المكالمات</span>
                        <span>{sp.callCount} / {targetCalls}</span>
                      </div>
                      <Progress value={sp.callPercent} className="h-2" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-cairo">
                        <span className="text-muted-foreground">الزيارات</span>
                        <span>{sp.visitCount} / {targetVisits}</span>
                      </div>
                      <Progress value={sp.visitPercent} className="h-2" />
                    </div>
                  </div>

                  {sp.spPourClients.length > 0 && (
                    <div className="border-t border-border pt-2">
                      <p className="text-xs font-cairo font-bold text-muted-foreground mb-1.5">عملاء موعد الصبة:</p>
                      <div className="space-y-1">
                        {sp.spPourClients.map((client: any) => {
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
                                <span className="font-cairo text-foreground text-xs">{client.name}</span>
                                {called && note && (
                                  <p className="text-xs font-cairo text-muted-foreground truncate">💬 {note}</p>
                                )}
                                {!called && isAfter2PM && (
                                  <p className="text-xs font-cairo text-destructive">لم يتم التواصل!</p>
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

      {/* Followup team section */}
      <div>
        <h3 className="text-lg font-cairo font-bold text-foreground mb-3 flex items-center gap-2">
          <Handshake className="h-5 w-5 text-chart-4" />
          فريق المتابعة
        </h3>
        {followupData.length === 0 ? (
          <p className="text-center font-cairo text-muted-foreground py-6">لا يوجد متابعين</p>
        ) : (
          <div className="space-y-3">
            {followupData.map((fu: any) => (
              <Card key={fu.id}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-cairo">{fu.name || "متابع"}</CardTitle>
                    <Badge
                      className={`font-cairo text-xs ${
                        fu.callPercent >= 80
                          ? "bg-chart-2/15 text-chart-2"
                          : fu.callPercent >= 50
                          ? "bg-chart-4/15 text-chart-4"
                          : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {fu.callPercent}% إنجاز
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-cairo font-bold text-foreground">{fu.callCount}</p>
                      <p className="text-xs font-cairo text-muted-foreground">مكالمة / {fu.fuTargetCalls}</p>
                    </div>
                    <div>
                      <p className="text-lg font-cairo font-bold text-foreground">{fu.fuClosedCount}</p>
                      <p className="text-xs font-cairo text-muted-foreground">صفقة مغلقة</p>
                    </div>
                    <div>
                      <p className="text-lg font-cairo font-bold text-foreground">{fu.callPercent}%</p>
                      <p className="text-xs font-cairo text-muted-foreground">نسبة الإنجاز</p>
                    </div>
                  </div>
                  <Progress value={fu.callPercent} className="h-2" />

                  {fu.fuPourClients.length > 0 && (
                    <div className="border-t border-border pt-2">
                      <p className="text-xs font-cairo font-bold text-muted-foreground mb-1.5">عملاء موعد الصبة:</p>
                      <div className="space-y-1">
                        {fu.fuPourClients.map((client: any) => {
                          const called = fu.fuCalledClientIds.has(client.id);
                          return (
                            <div key={client.id} className="flex items-center gap-2 text-xs">
                              {called ? (
                                <CheckCircle2 className="h-4 w-4 text-chart-2 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                              )}
                              <span className="font-cairo text-foreground">{client.name}</span>
                              {!called && isAfter2PM && (
                                <span className="font-cairo text-destructive text-xs">⚠️</span>
                              )}
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
    </div>
  );
}
