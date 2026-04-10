import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, CalendarDays, TrendingUp, TrendingDown, Minus, ArrowLeft, ArrowRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, getDaysInMonth } from "date-fns";
import { ar } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

function useMonthData(monthStart: Date) {
  const startStr = format(monthStart, "yyyy-MM-dd");
  const endStr = format(endOfMonth(monthStart), "yyyy-MM-dd");

  const { data: calls } = useQuery({
    queryKey: ["monthly-calls", startStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("call_logs")
        .select("id, user_id, call_date")
        .gte("call_date", `${startStr}T00:00:00`)
        .lte("call_date", `${endStr}T23:59:59`);
      return data || [];
    },
  });

  const { data: visits } = useQuery({
    queryKey: ["monthly-visits", startStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("field_locations")
        .select("id, user_id, created_at")
        .gte("created_at", `${startStr}T00:00:00`)
        .lte("created_at", `${endStr}T23:59:59`);
      return data || [];
    },
  });

  const { data: deals } = useQuery({
    queryKey: ["monthly-deals", startStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pour_orders")
        .select("id, client_id, scheduled_date, quantity_m3, status")
        .eq("status", "done")
        .gte("scheduled_date", startStr)
        .lte("scheduled_date", endStr);
      return data || [];
    },
  });

  const { data: newClients } = useQuery({
    queryKey: ["monthly-new-clients", startStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("clients")
        .select("id")
        .gte("created_at", `${startStr}T00:00:00`)
        .lte("created_at", `${endStr}T23:59:59`);
      return data || [];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["monthly-payments", startStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("payments")
        .select("id, amount, payment_date")
        .gte("payment_date", startStr)
        .lte("payment_date", endStr);
      return data || [];
    },
  });

  return {
    calls: calls || [],
    visits: visits || [],
    deals: deals || [],
    newClients: newClients || [],
    payments: payments || [],
    totalCalls: (calls || []).length,
    totalVisits: (visits || []).length,
    totalDeals: (deals || []).length,
    totalM3: (deals || []).reduce((s: number, d: any) => s + (d.quantity_m3 || 0), 0),
    totalNewClients: (newClients || []).length,
    totalPayments: (payments || []).reduce((s: number, p: any) => s + (p.amount || 0), 0),
  };
}

function CompareCard({ label, icon: Icon, current, previous, unit, color }: {
  label: string; icon: any; current: number; previous: number; unit?: string; color: string;
}) {
  const diff = previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? 100 : 0;
  const isUp = diff > 0;
  const isDown = diff < 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-xs font-cairo text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-cairo font-bold text-foreground">
          {unit === "ج.م" ? current.toLocaleString() : current}
          {unit && <span className="text-sm font-normal text-muted-foreground mr-1">{unit}</span>}
        </p>
        <div className="flex items-center gap-1 mt-1">
          {isUp ? (
            <TrendingUp className="h-3.5 w-3.5 text-chart-2" />
          ) : isDown ? (
            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className={`text-xs font-cairo ${isUp ? "text-chart-2" : isDown ? "text-destructive" : "text-muted-foreground"}`}>
            {diff > 0 ? "+" : ""}{diff}% عن الشهر السابق
          </span>
        </div>
        <p className="text-[10px] font-cairo text-muted-foreground mt-0.5">
          الشهر السابق: {unit === "ج.م" ? previous.toLocaleString() : previous}
        </p>
      </CardContent>
    </Card>
  );
}

export function MonthlyReportPage() {
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
  const prevMonth = subMonths(currentMonth, 1);

  const current = useMonthData(currentMonth);
  const previous = useMonthData(prevMonth);

  // Sales & followup users
  const { data: salesUsers } = useQuery({
    queryKey: ["monthly-sales-users"],
    queryFn: async () => {
      const { data: roles } = await (supabase as any).from("user_roles").select("user_id").eq("role", "sales");
      if (!roles?.length) return [];
      const { data: profiles } = await (supabase as any).from("profiles").select("id, name").in("id", roles.map((r: any) => r.user_id));
      return profiles || [];
    },
  });

  const { data: followupUsers } = useQuery({
    queryKey: ["monthly-followup-users"],
    queryFn: async () => {
      const { data: roles } = await (supabase as any).from("user_roles").select("user_id").eq("role", "followup");
      if (!roles?.length) return [];
      const { data: profiles } = await (supabase as any).from("profiles").select("id, name").in("id", roles.map((r: any) => r.user_id));
      return profiles || [];
    },
  });

  // Daily trend chart
  const dailyTrend = useMemo(() => {
    const days = getDaysInMonth(currentMonth);
    return Array.from({ length: days }, (_, i) => {
      const dateStr = format(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1), "yyyy-MM-dd");
      return {
        day: i + 1,
        مكالمات: current.calls.filter((c: any) => c.call_date?.startsWith(dateStr)).length,
        زيارات: current.visits.filter((v: any) => v.created_at?.startsWith(dateStr)).length,
      };
    });
  }, [currentMonth, current.calls, current.visits]);

  // Per-user stats
  const userStats = useMemo(() => {
    const allUsers = [...(salesUsers || []), ...(followupUsers || [])];
    return allUsers.map((u: any) => {
      const isSales = (salesUsers || []).some((s: any) => s.id === u.id);
      const curCalls = current.calls.filter((c: any) => c.user_id === u.id).length;
      const prevCalls = previous.calls.filter((c: any) => c.user_id === u.id).length;
      const curVisits = current.visits.filter((v: any) => v.user_id === u.id).length;
      const prevVisits = previous.visits.filter((v: any) => v.user_id === u.id).length;
      const callDiff = prevCalls > 0 ? Math.round(((curCalls - prevCalls) / prevCalls) * 100) : 0;
      return { ...u, role: isSales ? "مبيعات" : "متابعة", curCalls, prevCalls, curVisits, prevVisits, callDiff };
    }).sort((a: any, b: any) => b.curCalls - a.curCalls);
  }, [salesUsers, followupUsers, current, previous]);

  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: ar });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-cairo font-bold text-foreground">📈 التقرير الشهري</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="font-cairo" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ArrowRight className="h-4 w-4 ml-1" />
            السابق
          </Button>
          <span className="text-sm font-cairo font-medium text-foreground px-2">{monthLabel}</span>
          <Button
            variant="outline"
            size="sm"
            className="font-cairo"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            disabled={addMonths(currentMonth, 1) > new Date()}
          >
            التالي
            <ArrowLeft className="h-4 w-4 mr-1" />
          </Button>
        </div>
      </div>

      {/* Comparison cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <CompareCard label="المكالمات" icon={Phone} current={current.totalCalls} previous={previous.totalCalls} color="bg-chart-3/10 text-chart-3" />
        <CompareCard label="الزيارات" icon={MapPin} current={current.totalVisits} previous={previous.totalVisits} color="bg-chart-4/10 text-chart-4" />
        <CompareCard label="الصفقات المغلقة" icon={CalendarDays} current={current.totalDeals} previous={previous.totalDeals} color="bg-primary/10 text-primary" />
        <CompareCard label="عملاء جدد" icon={TrendingUp} current={current.totalNewClients} previous={previous.totalNewClients} color="bg-chart-2/10 text-chart-2" />
        <CompareCard label="إجمالي م³" icon={CalendarDays} current={current.totalM3} previous={previous.totalM3} unit="م³" color="bg-chart-5/10 text-chart-5" />
        <CompareCard label="التحصيلات" icon={TrendingUp} current={current.totalPayments} previous={previous.totalPayments} unit="ج.م" color="bg-chart-1/10 text-chart-1" />
      </div>

      {/* Daily trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-cairo">الأداء اليومي خلال الشهر</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontFamily: "Cairo", direction: "rtl" }} />
              <Legend wrapperStyle={{ fontFamily: "Cairo" }} />
              <Line type="monotone" dataKey="مكالمات" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="زيارات" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Per-user comparison table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-cairo">مقارنة أداء الموظفين</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm font-cairo">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-right py-2 px-2">الاسم</th>
                <th className="text-center py-2 px-2">الدور</th>
                <th className="text-center py-2 px-2">مكالمات الشهر</th>
                <th className="text-center py-2 px-2">الشهر السابق</th>
                <th className="text-center py-2 px-2">التغيير</th>
                <th className="text-center py-2 px-2">زيارات</th>
              </tr>
            </thead>
            <tbody>
              {userStats.map((u: any) => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-2 font-medium text-foreground whitespace-nowrap">{u.name || "—"}</td>
                  <td className="text-center py-2 px-2">
                    <Badge variant="outline" className="font-cairo text-xs">{u.role}</Badge>
                  </td>
                  <td className="text-center py-2 px-2 font-bold text-foreground">{u.curCalls}</td>
                  <td className="text-center py-2 px-2 text-muted-foreground">{u.prevCalls}</td>
                  <td className="text-center py-2 px-2">
                    <span className={`text-xs font-cairo ${u.callDiff > 0 ? "text-chart-2" : u.callDiff < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {u.callDiff > 0 ? "+" : ""}{u.callDiff}%
                    </span>
                  </td>
                  <td className="text-center py-2 px-2 text-foreground">{u.curVisits}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {userStats.length === 0 && (
            <p className="text-center text-muted-foreground py-4 font-cairo">لا يوجد موظفين</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
