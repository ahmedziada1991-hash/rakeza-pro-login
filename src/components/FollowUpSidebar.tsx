import { LayoutDashboard, Users, LogOut, ArrowRightLeft, Target, Settings, FileText, MessageCircle } from "lucide-react";
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
  { title: "لوحة المتابعة", url: "/dashboard/follow-up", icon: LayoutDashboard, end: true },
  { title: "أهدافي", url: "/dashboard/follow-up/goals", icon: Target },
  { title: "إدارة الأهداف", url: "/dashboard/follow-up/targets", icon: Settings, adminOnly: true },
  { title: "عروض الأسعار", url: "/dashboard/follow-up/offers", icon: FileText },
  { title: "الشات", url: "/dashboard/follow-up/chat", icon: MessageCircle },
  { title: "توزيع العملاء", url: "/dashboard/follow-up/assign", icon: ArrowRightLeft, adminOnly: true },
];

export function FollowUpSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, userRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const visibleItems = navItems.filter((item) => !item.adminOnly || userRole === "admin");

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarContent>
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center shrink-0">
            <span className="text-sidebar-primary-foreground font-cairo font-bold text-lg">ر</span>
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-cairo font-bold text-sidebar-foreground text-base leading-tight">ركيزة Pro</h1>
              <p className="font-cairo text-[11px] text-sidebar-foreground/60">لوحة المتابعة</p>
            </div>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="font-cairo text-sidebar-foreground/50">القائمة</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
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
