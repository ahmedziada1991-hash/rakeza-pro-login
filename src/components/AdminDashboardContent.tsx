import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, FileText, Building2, TrendingUp, TrendingDown, Clock, CheckCircle2,
  AlertCircle, Loader2, Banknote, BarChart3, Phone, MapPin, Minus, Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle2; color: string }> = {
  done: { label: "مكتمل", variant: "default", icon: CheckCircle2, color: "hsl(var(--primary))" },
  in_progress: { label: "قيد التنفيذ", variant: "secondary", icon: Clock, color: "hsl(var(--secondary))" },
  scheduled: { label: "مجدول", variant: "outline", icon: Clock, color: "hsl(210 60% 55%)" },
  pending: { label: "في الانتظار", variant: "outline", icon: AlertCircle, color: "hsl(45 90% 50%)" },
  cancelled: { label: "ملغي", variant: "destructive", icon: AlertCircle, color: "hsl(var(--destructive))" },
  problem: { label: "مشكلة", variant: "destructive", icon: AlertCircle, color: "hsl(0 70% 45%)" },
};

function formatCurrency(amount: number) {
  return `${amount.toLocaleString("ar-EG")} ج.م`;
}

function shortCurrency(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export function AdminDashboardContent() {
  const navigate = useNavigate();

  const { data: clientsCount, isLoading: loadingClients } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "active");
      return count ?? 0;
    },
  });

  const { data: allOrders, isLoading: loadingOrders } = useQuery({
    queryKey: ["orders-stats-full"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pour_orders")
        .select("id, client_id, total_agreed_amount, amount_paid, amount_remaining, status, quantity_m3, concrete_type, station_name, scheduled_date, created_at");
      return data ?? [];
    },
  });

  const { data: stationsCount, isLoading: loadingStations } = useQuery({
    queryKey: ["stations-count"],
    queryFn: async () => {
      const { count } = await supabase.from("stations").select("*", { count: "exact", head: true }).eq("active", true);
      return count ?? 0;
    },
  });

  const { data: allPayments, isLoading: loadingPayments } = useQuery({
    queryKey: ["payments-full"],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("id, amount, payment_date, created_at, payment_method");
      return data ?? [];
    },
  });

  const { data: recentOrders, isLoading: loadingRecent } = useQuery({
    queryKey: ["recent-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pour_orders")
        .select("id, concrete_type, quantity_m3, total_agreed_amount, amount_paid, amount_remaining, status, station_name, scheduled_date, created_at, client_id")
        .order("created_at", { ascending: false })
        .limit(6);
      if (!data?.length) return [];
      const clientIds = [...new Set(data.map((o) => o.client_id))];
      const { data: clients } = await supabase.from("clients").select("id, name").in("id", clientIds);
      const clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]));
      return data.map((o) => ({ ...o, client_name: clientMap.get(o.client_id) ?? "—" }));
    },
  });

  const isLoading = loadingClients || loadingOrders || loadingStations || loadingPayments;

  // Computed stats
  const ordersData = useMemo(() => {
    if (!allOrders) return { total: 0, revenue: 0, collected: 0, remaining: 0 };
    return {
      total: allOrders.length,
      revenue: allOrders.reduce((s, o) => s + (Number(o.total_agreed_amount) || 0), 0),
      collected: allOrders.reduce((s, o) => s + (Number(o.amount_paid) || 0), 0),
      remaining: allOrders.reduce((s, o) => s + (Number(o.amount_remaining) || 0), 0),
    };
  }, [allOrders]);

  const paymentsTotal = useMemo(() => {
    return (allPayments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }, [allPayments]);

  // Status distribution for pie chart
  const statusData = useMemo(() => {
    if (!allOrders) return [];
    const counts: Record<string, number> = {};
    allOrders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_MAP[status]?.label ?? status,
      value: count,
      color: STATUS_MAP[status]?.color ?? "hsl(var(--muted))",
    }));
  }, [allOrders]);

  // Monthly revenue chart
  const monthlyRevenue = useMemo(() => {
    if (!allOrders) return [];
    const map = new Map<string, { revenue: number; count: number }>();
    allOrders.forEach((o) => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const prev = map.get(key) ?? { revenue: 0, count: 0 };
      map.set(key, { revenue: prev.revenue + (Number(o.total_agreed_amount) || 0), count: prev.count + 1 });
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, v]) => {
        const month = Number(key.split("-")[1]) - 1;
        return { name: AR_MONTHS[month], revenue: v.revenue, orders: v.count };
      });
  }, [allOrders]);

  // Payment methods distribution
  const paymentMethods = useMemo(() => {
    if (!allPayments) return [];
    const labels: Record<string, string> = { cash: "كاش", bank_transfer: "تحويل بنكي", check: "شيك", online: "أونلاين" };
    const colors = ["hsl(var(--primary))", "hsl(142 60% 45%)", "hsl(45 90% 50%)", "hsl(210 60% 55%)"];
    const map: Record<string, number> = {};
    allPayments.forEach((p) => { map[p.payment_method] = (map[p.payment_method] || 0) + (Number(p.amount) || 0); });
    return Object.entries(map).map(([method, amount], i) => ({
      name: labels[method] ?? method,
      value: amount,
      color: colors[i % colors.length],
    }));
  }, [allPayments]);

  // Collection trend (payments over months)
  const collectionTrend = useMemo(() => {
    if (!allPayments) return [];
    const map = new Map<string, number>();
    allPayments.forEach((p) => {
      const d = new Date(p.payment_date ?? p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) ?? 0) + (Number(p.amount) || 0));
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, amount]) => {
        const month = Number(key.split("-")[1]) - 1;
        return { name: AR_MONTHS[month], collected: amount };
      });
  }, [allPayments]);

  const stats = [
    { title: "إجمالي الطلبات", value: ordersData.total, icon: FileText, color: "bg-primary/10 text-primary" },
    { title: "العملاء النشطين", value: clientsCount ?? 0, icon: Users, color: "bg-secondary/10 text-secondary" },
    { title: "المحطات", value: stationsCount ?? 0, icon: Building2, color: "bg-emerald-500/10 text-emerald-600" },
    { title: "إجمالي الإيرادات", value: formatCurrency(ordersData.revenue), icon: TrendingUp, color: "bg-violet-500/10 text-violet-600" },
  ];

  const financeSummary = [
    { title: "المحصّل", value: formatCurrency(paymentsTotal), icon: Banknote, color: "text-emerald-600" },
    { title: "المتبقي", value: formatCurrency(ordersData.remaining), icon: Clock, color: "text-destructive" },
  ];

  const quickActions = [
    { title: "إضافة طلب صب", icon: FileText, description: "إنشاء طلب توريد خرسانة جديد", url: "/dashboard/admin/orders/new" },
    { title: "إضافة عميل", icon: Users, description: "تسجيل عميل جديد في النظام", url: "/dashboard/admin/clients?add=1" },
    { title: "تقرير يومي", icon: TrendingUp, description: "عرض تقرير العمليات اليومية", url: "/dashboard/admin/reports" },
    { title: "إدارة المحطات", icon: Building2, description: "إدارة محطات الخرسانة", url: "/dashboard/admin/stations" },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-right">
        <p className="font-cairo text-sm font-semibold text-foreground mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} className="font-cairo text-xs" style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === "number" && entry.value > 999 ? formatCurrency(entry.value) : entry.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="shadow-[var(--shadow-card)] border-border/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-cairo text-muted-foreground">{stat.title}</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-cairo font-bold text-foreground">
                      {typeof stat.value === "number" ? stat.value.toLocaleString("ar-EG") : stat.value}
                    </p>
                  )}
                </div>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Finance Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {financeSummary.map((item) => (
          <Card key={item.title} className="shadow-[var(--shadow-card)] border-border/50">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-muted ${item.color}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-cairo text-muted-foreground">{item.title}</p>
                {isLoading ? (
                  <Skeleton className="h-7 w-32 mt-1" />
                ) : (
                  <p className={`text-xl font-cairo font-bold ${item.color}`}>{item.value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1: Revenue Bar + Status Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-cairo text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              الإيرادات الشهرية
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : monthlyRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" className="font-cairo" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={shortCurrency} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" name="الإيرادات" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground font-cairo py-16">لا توجد بيانات كافية</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-cairo text-base">حالات الطلبات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span className="font-cairo text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground font-cairo py-16">لا توجد بيانات</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Collection Trend + Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-cairo text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              تطور التحصيل الشهري
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : collectionTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={collectionTrend}>
                  <defs>
                    <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142 60% 45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142 60% 45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={shortCurrency} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="collected" name="المحصّل" stroke="hsl(142 60% 45%)" fill="url(#colorCollected)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground font-cairo py-16">لا توجد بيانات كافية</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-cairo text-base">طرق الدفع</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : paymentMethods.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={paymentMethods} cx="50%" cy="50%" outerRadius={70} dataKey="value" paddingAngle={3}>
                    {paymentMethods.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span className="font-cairo text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground font-cairo py-16">لا توجد بيانات</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-cairo text-lg">آخر طلبات الصب</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRecent ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : recentOrders && recentOrders.length > 0 ? (
              <div className="space-y-1">
                {recentOrders.map((order: any) => {
                  const statusInfo = STATUS_MAP[order.status] ?? STATUS_MAP.pending;
                  const StatusIcon = statusInfo.icon;
                  return (
                    <div
                      key={order.id}
                      className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/dashboard/admin/orders/${order.id}/edit`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-cairo font-medium text-muted-foreground shrink-0">#{order.id}</span>
                        <div className="min-w-0">
                          <span className="text-sm font-cairo text-foreground truncate block">{order.client_name}</span>
                          <span className="text-xs font-cairo text-muted-foreground">
                            {order.concrete_type} • {order.quantity_m3} م³ • {order.station_name ?? "—"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-left">
                          <span className="text-sm font-cairo font-semibold text-foreground block">
                            {formatCurrency(Number(order.total_agreed_amount) || 0)}
                          </span>
                          {Number(order.amount_remaining) > 0 && (
                            <span className="text-[11px] font-cairo text-destructive">
                              متبقي: {formatCurrency(Number(order.amount_remaining))}
                            </span>
                          )}
                        </div>
                        <Badge variant={statusInfo.variant} className="font-cairo text-[11px] min-w-[70px] justify-center">
                          <StatusIcon className="h-3 w-3 ml-1" />
                          {statusInfo.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-muted-foreground font-cairo py-8">لا توجد طلبات بعد</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-cairo text-lg">إجراءات سريعة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <button
                  key={action.title}
                  onClick={() => navigate(action.url)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/70 transition-colors text-right"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <action.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-cairo font-semibold text-foreground">{action.title}</p>
                    <p className="text-xs font-cairo text-muted-foreground">{action.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
