import {
  LayoutDashboard,
  Users,
  FileText,
  TrendingUp,
  Settings,
  Building2,
  CreditCard,
  LogOut,
  CalendarDays,
  ClipboardList,
  MessageCircle,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "الرئيسية", url: "/dashboard/admin", icon: LayoutDashboard, end: true },
  { title: "المبيعات", url: "/dashboard/admin/sales", icon: TrendingUp },
  { title: "العملاء", url: "/dashboard/admin/clients", icon: Users },
  { title: "المحطات", url: "/dashboard/admin/stations", icon: Building2 },
  { title: "طلبات الصب", url: "/dashboard/admin/orders", icon: FileText },
  { title: "الماليات", url: "/dashboard/admin/finance", icon: CreditCard },
  { title: "التقارير", url: "/dashboard/admin/reports", icon: TrendingUp },
  { title: "الأهداف الذكية", url: "/dashboard/admin/targets", icon: LayoutDashboard },
  { title: "تقويم الصبات", url: "/dashboard/admin/calendar", icon: CalendarDays },
  { title: "تقرير اليوم", url: "/dashboard/admin/daily-report", icon: ClipboardList },
  { title: "التقرير الأسبوعي", url: "/dashboard/admin/weekly-report", icon: TrendingUp },
  { title: "التقرير الشهري", url: "/dashboard/admin/monthly-report", icon: TrendingUp },
  { title: "الشات", url: "/dashboard/admin/chat", icon: MessageCircle },
  { title: "الإعدادات", url: "/dashboard/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarContent>
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center shrink-0">
            <span className="text-sidebar-primary-foreground font-cairo font-bold text-lg">ر</span>
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-cairo font-bold text-sidebar-foreground text-base leading-tight">ركيزة Pro</h1>
              <p className="font-cairo text-[11px] text-sidebar-foreground/60">لوحة الإدارة</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="font-cairo text-sidebar-foreground/50">القائمة</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.end}
                      className="hover:bg-sidebar-accent/50 font-cairo"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 ml-2" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start font-cairo text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 gap-2"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>تسجيل الخروج</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
