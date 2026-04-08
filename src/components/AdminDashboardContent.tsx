import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  FileText,
  Truck,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle2 }> = {
  completed: { label: "مكتمل", variant: "default", icon: CheckCircle2 },
  in_progress: { label: "قيد التنفيذ", variant: "secondary", icon: Clock },
  pending: { label: "في الانتظار", variant: "outline", icon: AlertCircle },
  cancelled: { label: "ملغي", variant: "destructive", icon: AlertCircle },
};

function formatCurrency(amount: number) {
  return `${amount.toLocaleString("ar-EG")} ج.م`;
}

export function AdminDashboardContent() {
  // Fetch stats
  const { data: clientsCount, isLoading: loadingClients } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true }).eq("is_active", true);
      return count ?? 0;
    },
  });

  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ["orders-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("id, total_amount, status, created_at");
      if (!data) return { total: 0, todayCount: 0, revenue: 0, inProgress: 0 };

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayOrders = data.filter((o) => new Date(o.created_at) >= today);
      const revenue = data.filter((o) => o.status === "completed").reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

      return {
        total: data.length,
        todayCount: todayOrders.length,
        revenue,
        inProgress: data.filter((o) => o.status === "in_progress").length,
      };
    },
  });

  const { data: driversCount, isLoading: loadingDrivers } = useQuery({
    queryKey: ["drivers-count"],
    queryFn: async () => {
      const { count } = await supabase.from("drivers").select("*", { count: "exact", head: true }).eq("is_active", true);
      return count ?? 0;
    },
  });

  const { data: recentOrders, isLoading: loadingRecent } = useQuery({
    queryKey: ["recent-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, status, created_at, concrete_type, quantity, clients(name)")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const isLoading = loadingClients || loadingOrders || loadingDrivers;

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
      title: "السائقين",
      value: driversCount ?? 0,
      icon: Truck,
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      title: "إجمالي الإيرادات",
      value: formatCurrency(ordersData?.revenue ?? 0),
      icon: TrendingUp,
      color: "bg-violet-500/10 text-violet-600",
    },
  ];

  const quickActions = [
    { title: "إضافة طلب جديد", icon: FileText, description: "إنشاء طلب توريد خرسانة" },
    { title: "إضافة عميل", icon: Users, description: "تسجيل عميل جديد في النظام" },
    { title: "تقرير يومي", icon: TrendingUp, description: "عرض تقرير العمليات اليومية" },
    { title: "إدارة السائقين", icon: Truck, description: "متابعة السائقين والرحلات" },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <Card className="lg:col-span-2 shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-cairo text-lg">آخر الطلبات</CardTitle>
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
                          #{order.order_number}
                        </span>
                        <span className="text-sm font-cairo text-foreground truncate">
                          {(order.clients as any)?.name ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-sm font-cairo font-semibold text-foreground">
                          {formatCurrency(Number(order.total_amount) || 0)}
                        </span>
                        <Badge variant={statusInfo.variant} className="font-cairo text-[11px] min-w-[80px] justify-center">
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
