import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, CalendarDays } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

function getWeekRanges(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const weeks: { start: Date; end: Date; label: string }[] = [];
  let current = new Date(start);
  let weekNum = 1;

  while (current <= end) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > end) weekEnd.setTime(end.getTime());

    weeks.push({
      start: weekStart,
      end: weekEnd,
      label: `الأسبوع ${weekNum}`,
    });

    current.setDate(current.getDate() + 7);
    weekNum++;
  }

  return weeks;
}

export function MonthlyGoals() {
  const { user } = useAuth();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const weeks = getWeekRanges(currentYear, currentMonth);

  // Get latest target
  const { data: target } = useQuery({
    queryKey: ["monthly-target-for-rep"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("targets")
        .select("target_m3, num_salespeople, working_days")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Get this month's completed orders for the rep
  const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01T00:00:00`;
  const monthEnd = new Date(currentYear, currentMonth + 1, 0);
  const monthEndStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}T23:59:59`;

  const { data: orders } = useQuery({
    queryKey: ["rep-monthly-orders", user?.id, currentMonth, currentYear],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pour_orders")
        .select("quantity_m3, created_at")
        .eq("status", "completed")
        .gte("created_at", monthStart)
        .lte("created_at", monthEndStr);
      return data || [];
    },
    enabled: !!user,
  });

  const totalTarget = target?.target_m3 || 0;
  const numSalespeople = target?.num_salespeople || 1;
  const myTarget = Math.round(totalTarget / numSalespeople);
  const totalAchieved = (orders || []).reduce((sum: number, o: any) => sum + (o.quantity_m3 || 0), 0);
  const totalPercent = myTarget > 0 ? Math.min(100, Math.round((totalAchieved / myTarget) * 100)) : 0;

  // Calculate weekly targets with redistribution
  const weeklyBaseTarget = myTarget / weeks.length;
  const weeklyData = weeks.map((week, index) => {
    const weekOrders = (orders || []).filter((o: any) => {
      const d = new Date(o.created_at);
      return d >= week.start && d <= week.end;
    });
    const achieved = weekOrders.reduce((sum: number, o: any) => sum + (o.quantity_m3 || 0), 0);
    return { ...week, achieved, baseTarget: weeklyBaseTarget };
  });

  // Redistribute shortfall from past weeks to future weeks
  const currentWeekIndex = weeks.findIndex((w) => now >= w.start && now <= w.end);
  let carryOver = 0;
  const adjustedWeekly = weeklyData.map((w, i) => {
    if (i < currentWeekIndex) {
      const shortfall = Math.max(0, w.baseTarget - w.achieved);
      carryOver += shortfall;
      return { ...w, adjustedTarget: w.baseTarget };
    } else if (i >= currentWeekIndex) {
      const remainingWeeks = weeks.length - i;
      const extra = remainingWeeks > 0 ? carryOver / remainingWeeks : 0;
      const adjustedTarget = w.baseTarget + extra;
      return { ...w, adjustedTarget };
    }
    return { ...w, adjustedTarget: w.baseTarget };
  });

  const monthLabel = now.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

  const getProgressColor = (percent: number) => {
    if (percent >= 80) return "bg-chart-2";
    if (percent >= 50) return "bg-chart-4";
    return "bg-destructive";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-cairo font-bold text-foreground">أهدافي - {monthLabel}</h2>
      </div>

      {/* Monthly overall */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-cairo font-medium text-foreground">الهدف الشهري</span>
            <span className="text-sm font-cairo text-muted-foreground">
              {totalAchieved.toFixed(0)} / {myTarget} م³
            </span>
          </div>
          <div className="relative">
            <Progress value={totalPercent} className="h-4" />
            <div
              className={`absolute inset-0 h-4 rounded-full ${getProgressColor(totalPercent)} transition-all`}
              style={{ width: `${totalPercent}%` }}
            />
          </div>
          <p className="text-xs font-cairo text-muted-foreground text-center">
            {totalPercent}% مكتمل
          </p>
        </CardContent>
      </Card>

      {/* Weekly breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {adjustedWeekly.map((week, i) => {
          const weekTarget = Math.round(week.adjustedTarget);
          const weekPercent = weekTarget > 0 ? Math.min(100, Math.round((week.achieved / weekTarget) * 100)) : 0;
          const isPast = i < currentWeekIndex;
          const isCurrent = i === currentWeekIndex;

          return (
            <Card key={i} className={isCurrent ? "border-primary/50 shadow-sm" : ""}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-cairo font-medium text-sm text-foreground">
                      {week.label}
                      {isCurrent && <span className="text-xs text-primary mr-1">(الحالي)</span>}
                    </span>
                  </div>
                  <span className="text-xs font-cairo text-muted-foreground">
                    {week.achieved.toFixed(0)} / {weekTarget} م³
                  </span>
                </div>
                <div className="relative">
                  <Progress value={weekPercent} className="h-2.5" />
                  <div
                    className={`absolute inset-0 h-2.5 rounded-full ${getProgressColor(weekPercent)} transition-all`}
                    style={{ width: `${weekPercent}%` }}
                  />
                </div>
                {isPast && week.achieved < week.baseTarget && (
                  <p className="text-xs font-cairo text-destructive">
                    فارق: {(week.baseTarget - week.achieved).toFixed(0)} م³ (موزع على الأسابيع القادمة)
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
