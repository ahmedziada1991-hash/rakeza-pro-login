import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Check, CheckCheck, Clock, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  overdue_payment: AlertTriangle,
  pending_order: Clock,
  check_due: AlertTriangle,
  low_activity: Clock,
  no_contact: Clock,
  low_stock: AlertTriangle,
  daily_target: AlertTriangle,
};

const TYPE_COLORS: Record<string, string> = {
  overdue_payment: "text-destructive",
  pending_order: "text-yellow-500",
  check_due: "text-orange-500",
  low_activity: "text-muted-foreground",
  no_contact: "text-muted-foreground",
  low_stock: "text-destructive",
  daily_target: "text-orange-500",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as Notification[]) ?? [];
    },
    refetchInterval: 30000,
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await supabase
        .from("notifications")
        .update({ is_read: true } as any)
        .eq("id", id as any);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const ids = notifications.filter((n) => !n.is_read).map((n) => n.id);
      if (ids.length === 0) return;
      await supabase
        .from("notifications")
        .update({ is_read: true } as any)
        .in("id", ids as any);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end" dir="rtl">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="font-cairo font-bold text-sm">الإشعارات</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="h-3 w-3 ml-1" />
              قراءة الكل
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm font-cairo">
              لا توجد إشعارات
            </div>
          ) : (
            notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] || Bell;
              const color = TYPE_COLORS[n.type] || "text-muted-foreground";
              return (
                <div
                  key={n.id}
                  className={`flex gap-3 p-3 border-b border-border last:border-0 transition-colors ${
                    n.is_read ? "opacity-60" : "bg-accent/30"
                  }`}
                >
                  <div className={`mt-0.5 ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-cairo font-semibold leading-tight">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-cairo">
                        {n.body}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), {
                        addSuffix: true,
                        locale: ar,
                      })}
                    </p>
                  </div>
                  {!n.is_read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => markRead.mutate(n.id)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
