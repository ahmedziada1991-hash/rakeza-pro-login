import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays, Phone, MapPin, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, startOfWeek, addDays, subWeeks, addWeeks, isSameDay } from "date-fns";
import { ar } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const DAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function WeeklyReportPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 6 })); // Saturday
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(addDays(weekStart, 6), "yyyy-MM-dd");
  const today = new Date();

  // Sales users
  const { data: salesUsers } = useQuery({
    queryKey: ["weekly-sales-users"],
    queryFn: async () => {
      const { data: roles } = await (supabase as any).from("user_roles").select("user_id").eq("role", "sales");
      if (!roles?.length) return [];
      const { data: profiles } = await (supabase as any).from("profiles").select("id, name").in("id", roles.map((r: any) => r.user_id));
      return profiles || [];
    },
  });

  // Followup users
  const { data: followupUsers } = useQuery({
    queryKey: ["weekly-followup-users"],
    queryFn: async () => {
      const { data: roles } = await (supabase as any).from("user_roles").select("user_id").eq("role", "followup");
      if (!roles?.length) return [];
      const { data: profiles } = await (supabase as any).from("profiles").select("id, name").in("id", roles.map((r: any) => r.user_id));
      return profiles || [];
    },
  });

  // Week call logs
  const { data: weekCalls } = useQuery({
    queryKey: ["weekly-calls", weekStartStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("call_logs")
        .select("id, user_id, call_date")
        .gte("call_date", `${weekStartStr}T00:00:00`)
        .lte("call_date", `${weekEndStr}T23:59:59`);
      return data || [];
    },
  });

  // Week field visits
  const { data: weekVisits } = useQuery({
    queryKey: ["weekly-visits", weekStartStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("field_locations")
        .select("id, user_id, created_at")
        .gte("created_at", `${weekStartStr}T00:00:00`)
        .lte("created_at", `${weekEndStr}T23:59:59`);
      return data || [];
    },
  });

  // Week closed deals
  const { data: weekDeals } = useQuery({
    queryKey: ["weekly-deals", weekStartStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pour_orders")
        .select("id, client_id, scheduled_date, status")
        .eq("status", "done")
        .gte("scheduled_date", weekStartStr)
        .lte("scheduled_date", weekEndStr);
      return data || [];
    },
  });

  // Targets
  const { data: targets } = useQuery({
    queryKey: ["weekly-targets"],
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

  const targetCalls = targets?.calls_per_day || 15;
  const targetVisits = targets?.visits_per_day || 5;

  // Chart data - daily totals
  const chartData = useMemo(() => {
    return weekDates.map((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const dayCalls = (weekCalls || []).filter((c: any) => c.call_date?.startsWith(dateStr)).length;
      const dayVisits = (weekVisits || []).filter((v: any) => v.created_at?.startsWith(dateStr)).length;
      const dayDeals = (weekDeals || []).filter((d: any) => d.scheduled_date === dateStr).length;
      return {
        day: DAYS_AR[date.getDay()],
        date: format(date, "M/d"),
        مكالمات: dayCalls,
        زيارات: dayVisits,
        صفقات: dayDeals,
      };
    });
  }, [weekDates, weekCalls, weekVisits, weekDeals]);

  // Per-user weekly summary
  const buildUserWeekly = (userId: string) => {
    const userCalls = (weekCalls || []).filter((c: any) => c.user_id === userId);
    const userVisits = (weekVisits || []).filter((v: any) => v.user_id === userId);
    const dailyData = weekDates.map((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      return {
        calls: userCalls.filter((c: any) => c.call_date?.startsWith(dateStr)).length,
        visits: userVisits.filter((v: any) => v.created_at?.startsWith(dateStr)).length,
      };
    });
    const totalCalls = userCalls.length;
    const totalVisits = userVisits.length;
    const workDays = weekDates.filter(d => d <= today).length;
    const avgCalls = workDays > 0 ? Math.round(totalCalls / workDays) : 0;
    const avgVisits = workDays > 0 ? Math.round(totalVisits / workDays) : 0;
    const callPercent = workDays > 0 ? Math.min(100, Math.round((totalCalls / (targetCalls * workDays)) * 100)) : 0;
    return { dailyData, totalCalls, totalVisits, avgCalls, avgVisits, callPercent };
  };

  const totalWeekCalls = (weekCalls || []).length;
  const totalWeekVisits = (weekVisits || []).length;
  const totalWeekDeals = (weekDeals || []).length;

  const TrendIcon = ({ current, target }: { current: number; target: number }) => {
    if (current >= target) return <TrendingUp className="h-4 w-4 text-chart-2" />;
    if (current >= target * 0.5) return <Minus className="h-4 w-4 text-chart-4" />;
    return <TrendingDown className="h-4 w-4 text-destructive" />;
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header with week navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-cairo font-bold text-foreground">📊 التقرير الأسبوعي</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="font-cairo" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            الأسبوع السابق
          </Button>
          <Button variant="outline" size="sm" className="font-cairo" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 6 }))}>
            هذا الأسبوع
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-cairo"
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            disabled={addWeeks(weekStart, 1) > new Date()}
          >
            الأسبوع التالي
          </Button>
        </div>
      </div>

      <p className="text-sm font-cairo text-muted-foreground">
        {format(weekStart, "d MMMM", { locale: ar })} → {format(addDays(weekStart, 6), "d MMMM yyyy", { locale: ar })}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Phone className="h-5 w-5 text-chart-3 mx-auto mb-1" />
            <p className="text-2xl font-cairo font-bold text-foreground">{totalWeekCalls}</p>
            <p className="text-xs font-cairo text-muted-foreground">مكالمة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MapPin className="h-5 w-5 text-chart-4 mx-auto mb-1" />
            <p className="text-2xl font-cairo font-bold text-foreground">{totalWeekVisits}</p>
            <p className="text-xs font-cairo text-muted-foreground">زيارة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CalendarDays className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-cairo font-bold text-foreground">{totalWeekDeals}</p>
            <p className="text-xs font-cairo text-muted-foreground">صفقة مغلقة</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-cairo">أداء الفريق يوم بيوم</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ fontFamily: "Cairo", direction: "rtl" }} />
              <Legend wrapperStyle={{ fontFamily: "Cairo" }} />
              <Bar dataKey="مكالمات" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="زيارات" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="صفقات" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sales team table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-cairo">فريق المبيعات</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm font-cairo">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-right py-2 px-2">البائع</th>
                {weekDates.map((d, i) => (
                  <th key={i} className="text-center py-2 px-1 min-w-[60px]">
                    <div className="text-xs">{DAYS_AR[d.getDay()]}</div>
                    <div className="text-[10px]">{format(d, "M/d")}</div>
                  </th>
                ))}
                <th className="text-center py-2 px-2">المجموع</th>
                <th className="text-center py-2 px-2">المعدل</th>
                <th className="text-center py-2 px-2">الاتجاه</th>
              </tr>
            </thead>
            <tbody>
              {(salesUsers || []).map((sp: any) => {
                const weekly = buildUserWeekly(sp.id);
                return (
                  <tr key={sp.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium text-foreground whitespace-nowrap">{sp.name || "بائع"}</td>
                    {weekly.dailyData.map((day, i) => (
                      <td key={i} className="text-center py-2 px-1">
                        <div className="text-xs text-foreground">{day.calls}📞</div>
                        <div className="text-[10px] text-muted-foreground">{day.visits}📍</div>
                      </td>
                    ))}
                    <td className="text-center py-2 px-2 font-bold text-foreground">{weekly.totalCalls}</td>
                    <td className="text-center py-2 px-2 text-foreground">{weekly.avgCalls}/يوم</td>
                    <td className="text-center py-2 px-2">
                      <div className="flex justify-center">
                        <TrendIcon current={weekly.avgCalls} target={targetCalls} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(!salesUsers || salesUsers.length === 0) && (
            <p className="text-center text-muted-foreground py-4 font-cairo">لا يوجد بائعين</p>
          )}
        </CardContent>
      </Card>

      {/* Followup team table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-cairo">فريق المتابعة</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm font-cairo">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-right py-2 px-2">المتابع</th>
                {weekDates.map((d, i) => (
                  <th key={i} className="text-center py-2 px-1 min-w-[60px]">
                    <div className="text-xs">{DAYS_AR[d.getDay()]}</div>
                    <div className="text-[10px]">{format(d, "M/d")}</div>
                  </th>
                ))}
                <th className="text-center py-2 px-2">المجموع</th>
                <th className="text-center py-2 px-2">المعدل</th>
                <th className="text-center py-2 px-2">الاتجاه</th>
              </tr>
            </thead>
            <tbody>
              {(followupUsers || []).map((fu: any) => {
                const weekly = buildUserWeekly(fu.id);
                return (
                  <tr key={fu.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium text-foreground whitespace-nowrap">{fu.name || "متابع"}</td>
                    {weekly.dailyData.map((day, i) => (
                      <td key={i} className="text-center py-2 px-1">
                        <div className="text-xs text-foreground">{day.calls}📞</div>
                      </td>
                    ))}
                    <td className="text-center py-2 px-2 font-bold text-foreground">{weekly.totalCalls}</td>
                    <td className="text-center py-2 px-2 text-foreground">{weekly.avgCalls}/يوم</td>
                    <td className="text-center py-2 px-2">
                      <div className="flex justify-center">
                        <TrendIcon current={weekly.avgCalls} target={10} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(!followupUsers || followupUsers.length === 0) && (
            <p className="text-center text-muted-foreground py-4 font-cairo">لا يوجد متابعين</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
