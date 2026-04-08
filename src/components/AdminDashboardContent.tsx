import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  FileText,
  Building2,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Banknote,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle2 }> = {
  done: { label: "مكتمل", variant: "default", icon: CheckCircle2 },
  in_progress: { label: "قيد التنفيذ", variant: "secondary", icon: Clock },
  scheduled: { label: "مجدول", variant: "outline", icon: Clock },
  pending: { label: "في الانتظار", variant: "outline", icon: AlertCircle },
  cancelled: { label: "ملغي", variant: "destructive", icon: AlertCircle },
  problem: { label: "مشكلة", variant: "destructive", icon: AlertCircle },
};

function formatCurrency(amount: number) {
  return `${amount.toLocaleString("ar-EG")} ج.م`;
}

export function AdminDashboardContent() {
  const navigate = useNavigate();
  // Clients count
  const { data: clientsCount, isLoading: loadingClients } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");
      return count ?? 0;
    },
  });

  // Orders stats from pour_orders
  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ["orders-stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pour_orders")
        .select("id, total_agreed_amount, amount_paid, amount_remaining, status, scheduled_date, created_at");
      if (!data) return { total: 0, revenue: 0, remaining: 0, collected: 0 };

      const revenue = data.reduce((sum, o) => sum + (Number(o.total_agreed_amount) || 0), 0);
      const collected = data.reduce((sum, o) => sum + (Number(o.amount_paid) || 0), 0);
      const remaining = data.reduce((sum, o) => sum + (Number(o.amount_remaining) || 0), 0);

      return { total: data.length, revenue, collected, remaining };
    },
  });

  // Stations count
  const { data: stationsCount, isLoading: loadingStations } = useQuery({
    queryKey: ["stations-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("stations")
        .select("*", { count: "exact", head: true })
        .eq("active", true);
      return count ?? 0;
    },
  });

  // Payments total
  const { data: paymentsTotal, isLoading: loadingPayments } = useQuery({
    queryKey: ["payments-total"],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("amount");
      if (!data) return 0;
      return data.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    },
  });

  // Recent orders with client name
  const { data: recentOrders, isLoading: loadingRecent } = useQuery({
    queryKey: ["recent-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pour_orders")
        .select("id, concrete_type, quantity_m3, total_agreed_amount, amount_paid, amount_remaining, status, station_name, scheduled_date, created_at, client_id")
        .order("created_at", { ascending: false })
        .limit(6);
      if (!data || data.length === 0) return [];

      // Fetch client names
      const clientIds = [...new Set(data.map((o) => o.client_id))];
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);

      const clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]));
      return data.map((o) => ({ ...o, client_name: clientMap.get(o.client_id) ?? "—" }));
    },
  });

  const isLoading = loadingClients || loadingOrders || loadingStations || loadingPayments;

  const stats = [
    {
      title: "إجمالي الطلبات",
      value: ordersData?.total ?? 0,
      icon: FileText,
      color: "bg-primary/10 text-primary",
    },
    {
      title: "العملاء النشطين",
      value: clientsCount ?? 0,
      icon: Users,
      color: "bg-secondary/10 text-secondary",
    },
    {
      title: "المحطات",
      value: stationsCount ?? 0,
      icon: Building2,
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      title: "إجمالي الإيرادات",
      value: formatCurrency(ordersData?.revenue ?? 0),
      icon: TrendingUp,
      color: "bg-violet-500/10 text-violet-600",
    },
  ];

  const financeSummary = [
    { title: "المحصّل", value: formatCurrency(paymentsTotal ?? 0), icon: Banknote, color: "text-emerald-600" },
    { title: "المتبقي", value: formatCurrency(ordersData?.remaining ?? 0), icon: Clock, color: "text-destructive" },
  ];

  const quickActions = [
    { title: "إضافة طلب صب", icon: FileText, description: "إنشاء طلب توريد خرسانة جديد", url: "/dashboard/admin/orders/new" },
    { title: "إضافة عميل", icon: Users, description: "تسجيل عميل جديد في النظام", url: "/dashboard/admin/clients?add=1" },
    { title: "تقرير يومي", icon: TrendingUp, description: "عرض تقرير العمليات اليومية", url: "/dashboard/admin/reports" },
    { title: "إدارة المحطات", icon: Building2, description: "إدارة محطات الخرسانة", url: "/dashboard/admin/stations" },
  ];

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
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
                      className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-cairo font-medium text-muted-foreground shrink-0">
                          #{order.id}
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm font-cairo text-foreground truncate block">
                            {order.client_name}
                          </span>
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

        {/* Quick Actions */}
        <Card className="shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-cairo text-lg">إجراءات سريعة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <button
                  key={action.title}
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
