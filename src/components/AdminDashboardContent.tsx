import {
  Users,
  FileText,
  Truck,
  TrendingUp,
  ArrowUpLeft,
  ArrowDownLeft,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const stats = [
  {
    title: "إجمالي الطلبات",
    value: "1,284",
    change: "+12%",
    trend: "up" as const,
    icon: FileText,
    color: "bg-primary/10 text-primary",
  },
  {
    title: "العملاء النشطين",
    value: "342",
    change: "+5%",
    trend: "up" as const,
    icon: Users,
    color: "bg-secondary/10 text-secondary",
  },
  {
    title: "رحلات اليوم",
    value: "48",
    change: "-3%",
    trend: "down" as const,
    icon: Truck,
    color: "bg-emerald-500/10 text-emerald-600",
  },
  {
    title: "الإيرادات الشهرية",
    value: "٥٢٠,٠٠٠ ر.س",
    change: "+18%",
    trend: "up" as const,
    icon: TrendingUp,
    color: "bg-violet-500/10 text-violet-600",
  },
];

const recentOrders = [
  { id: "#1284", client: "شركة البناء المتحدة", amount: "45,000 ر.س", status: "مكتمل", statusType: "success" },
  { id: "#1283", client: "مؤسسة الأمل للمقاولات", amount: "32,500 ر.س", status: "قيد التنفيذ", statusType: "warning" },
  { id: "#1282", client: "شركة الإنشاءات الحديثة", amount: "67,200 ر.س", status: "مكتمل", statusType: "success" },
  { id: "#1281", client: "مؤسسة النجاح", amount: "18,900 ر.س", status: "في الانتظار", statusType: "pending" },
  { id: "#1280", client: "شركة التعمير", amount: "55,000 ر.س", status: "مكتمل", statusType: "success" },
];

const quickActions = [
  { title: "إضافة طلب جديد", icon: FileText, description: "إنشاء طلب توريد خرسانة" },
  { title: "إضافة عميل", icon: Users, description: "تسجيل عميل جديد في النظام" },
  { title: "تقرير يومي", icon: TrendingUp, description: "عرض تقرير العمليات اليومية" },
  { title: "إدارة السائقين", icon: Truck, description: "متابعة السائقين والرحلات" },
];

export function AdminDashboardContent() {
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
                  <p className="text-2xl font-cairo font-bold text-foreground">{stat.value}</p>
                  <div className="flex items-center gap-1">
                    {stat.trend === "up" ? (
                      <ArrowUpLeft className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <ArrowDownLeft className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span
                      className={`text-xs font-cairo font-medium ${
                        stat.trend === "up" ? "text-emerald-600" : "text-destructive"
                      }`}
                    >
                      {stat.change}
                    </span>
                    <span className="text-xs font-cairo text-muted-foreground">من الشهر الماضي</span>
                  </div>
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
            <div className="space-y-1">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-cairo font-medium text-muted-foreground w-14">
                      {order.id}
                    </span>
                    <span className="text-sm font-cairo text-foreground">{order.client}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-cairo font-semibold text-foreground">
                      {order.amount}
                    </span>
                    <Badge
                      variant={
                        order.statusType === "success"
                          ? "default"
                          : order.statusType === "warning"
                          ? "secondary"
                          : "outline"
                      }
                      className="font-cairo text-[11px] min-w-[80px] justify-center"
                    >
                      {order.statusType === "success" && <CheckCircle2 className="h-3 w-3 ml-1" />}
                      {order.statusType === "warning" && <Clock className="h-3 w-3 ml-1" />}
                      {order.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
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
