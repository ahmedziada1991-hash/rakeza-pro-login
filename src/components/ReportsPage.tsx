import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  TrendingUp, CalendarIcon, FileText, Banknote, CuboidIcon, Loader2, Download,
} from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";

const STATUS_LABELS: Record<string, string> = {
  done: "مكتمل",
  in_progress: "قيد التنفيذ",
  scheduled: "مجدول",
  pending: "في الانتظار",
  cancelled: "ملغي",
  problem: "مشكلة",
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

export function ReportsPage() {
  const today = new Date();
  const [from, setFrom] = useState<Date>(startOfMonth(today));
  const [to, setTo] = useState<Date>(endOfMonth(today));

  // Fetch orders in range
  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ["report-orders", from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pour_orders")
        .select("id, concrete_type, quantity_m3, total_agreed_amount, amount_paid, amount_remaining, status, station_name, scheduled_date, created_at")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch payments in range
  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ["report-payments", from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, created_at")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = loadingOrders || loadingPayments;

  // Computed stats
  const stats = useMemo(() => {
    if (!orders) return null;
    const totalOrders = orders.length;
    const totalQuantity = orders.reduce((s, o) => s + (Number(o.quantity_m3) || 0), 0);
    const totalRevenue = orders.reduce((s, o) => s + (Number(o.total_agreed_amount) || 0), 0);
    const totalCollected = (payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalRemaining = orders.reduce((s, o) => s + (Number(o.amount_remaining) || 0), 0);
    return { totalOrders, totalQuantity, totalRevenue, totalCollected, totalRemaining };
  }, [orders, payments]);

  // Daily bar chart data
  const dailyData = useMemo(() => {
    if (!orders) return [];
    const days = eachDayOfInterval({ start: from, end: to });
    return days.map((day) => {
      const dayOrders = orders.filter((o) => isSameDay(parseISO(o.created_at), day));
      const dayPayments = (payments ?? []).filter((p) => isSameDay(parseISO(p.created_at), day));
      return {
        date: format(day, "MM/dd"),
        label: format(day, "d MMM", { locale: ar }),
        طلبات: dayOrders.length,
        إيرادات: dayOrders.reduce((s, o) => s + (Number(o.total_agreed_amount) || 0), 0),
        تحصيل: dayPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
        كمية: dayOrders.reduce((s, o) => s + (Number(o.quantity_m3) || 0), 0),
      };
    }).filter((d) => d.طلبات > 0 || d.تحصيل > 0);
  }, [orders, payments, from, to]);

  // Status pie data
  const statusData = useMemo(() => {
    if (!orders) return [];
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      const st = o.status || "pending";
      counts[st] = (counts[st] || 0) + 1;
    });
    return Object.entries(counts).map(([status, value]) => ({
      name: STATUS_LABELS[status] ?? status,
      value,
    }));
  }, [orders]);

  const summaryCards = stats
    ? [
        { title: "عدد الطلبات", value: stats.totalOrders.toLocaleString("ar-EG"), icon: FileText, color: "text-primary" },
        { title: "إجمالي الكمية (م³)", value: stats.totalQuantity.toLocaleString("ar-EG"), icon: CuboidIcon, color: "text-emerald-600" },
        { title: "إجمالي الإيرادات", value: fmt(stats.totalRevenue), icon: TrendingUp, color: "text-violet-600" },
        { title: "المحصّل", value: fmt(stats.totalCollected), icon: Banknote, color: "text-emerald-600" },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Header + Date Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-cairo font-bold text-foreground">التقارير</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DatePicker label="من" date={from} onChange={setFrom} />
          <DatePicker label="إلى" date={to} onChange={setTo} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="font-cairo gap-1 h-9">
                <Download className="h-3.5 w-3.5" />
                تصدير
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="end">
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="sm" className="font-cairo justify-start" onClick={() => {
                  if (!orders) return;
                  const headers = [
                    { key: "id", label: "#" },
                    { key: "concrete_type", label: "النوع" },
                    { key: "quantity_m3", label: "الكمية م³" },
                    { key: "total_agreed_amount", label: "الإجمالي" },
                    { key: "amount_paid", label: "المدفوع" },
                    { key: "amount_remaining", label: "المتبقي" },
                    { key: "status", label: "الحالة" },
                    { key: "station_name", label: "المحطة" },
                  ];
                  exportToExcel(orders, headers, `تقرير_${format(from, "yyyy-MM-dd")}`);
                }}>
                  تصدير Excel
                </Button>
                <Button variant="ghost" size="sm" className="font-cairo justify-start" onClick={() => {
                  if (!orders) return;
                  const headers = [
                    { key: "id", label: "#" },
                    { key: "concrete_type", label: "Type" },
                    { key: "quantity_m3", label: "Qty" },
                    { key: "total_agreed_amount", label: "Total" },
                    { key: "amount_paid", label: "Paid" },
                    { key: "amount_remaining", label: "Remaining" },
                    { key: "status", label: "Status" },
                    { key: "station_name", label: "Station" },
                  ];
                  exportToPDF(orders, headers, `تقرير_${format(from, "yyyy-MM-dd")}`, `Report: ${format(from, "yyyy/MM/dd")} - ${format(to, "yyyy/MM/dd")}`);
                }}>
                  تصدير PDF
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((c) => (
            <Card key={c.title} className="shadow-[var(--shadow-card)] border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${c.color}`}>
                    <c.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-cairo text-muted-foreground">{c.title}</p>
                    <p className={`text-lg font-cairo font-bold ${c.color}`}>{c.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bar Chart */}
        <Card className="lg:col-span-2 shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-cairo text-base">الطلبات والإيرادات اليومية</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : dailyData.length === 0 ? (
              <p className="text-center text-muted-foreground font-cairo py-16">لا توجد بيانات في هذه الفترة</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" className="font-cairo text-xs" tick={{ fontSize: 11 }} />
                  <YAxis className="font-cairo text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontFamily: "Cairo", fontSize: 12, direction: "rtl" }}
                    formatter={(value: number, name: string) =>
                      name === "إيرادات" || name === "تحصيل"
                        ? [fmt(value), name]
                        : [value.toLocaleString("ar-EG"), name]
                    }
                  />
                  <Bar dataKey="طلبات" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="كمية" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card className="shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-cairo text-base">توزيع حالات الطلبات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : statusData.length === 0 ? (
              <p className="text-center text-muted-foreground font-cairo py-16">لا توجد بيانات</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                    labelLine={false}
                    style={{ fontSize: 11, fontFamily: "Cairo" }}
                  >
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend
                    formatter={(value) => <span className="font-cairo text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-cairo text-base">الإيرادات والتحصيل اليومي (ج.م)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : dailyData.length === 0 ? (
            <p className="text-center text-muted-foreground font-cairo py-16">لا توجد بيانات في هذه الفترة</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" className="font-cairo text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="font-cairo text-xs" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontFamily: "Cairo", fontSize: 12, direction: "rtl" }}
                  formatter={(value: number, name: string) => [fmt(value), name]}
                />
                <Bar dataKey="إيرادات" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="تحصيل" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DatePicker({ label, date, onChange }: { label: string; date: Date; onChange: (d: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start text-right font-cairo gap-2 min-w-[150px]")}>
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}:</span>
          <span className="text-sm">{format(date, "yyyy/MM/dd")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => d && onChange(d)}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
