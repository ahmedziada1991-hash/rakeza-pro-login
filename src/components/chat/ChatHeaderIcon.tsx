import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle } from "lucide-react";

export function ChatHeaderIcon() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();

  const { data: unreadCount } = useQuery({
    queryKey: ["chat-total-unread", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      // Get all memberships with last_seen_at
      const { data: memberships } = await (supabase as any)
        .from("conversation_members")
        .select("conversation_id, last_seen_at")
        .eq("user_id", user.id);

      if (!memberships?.length) return 0;

      let total = 0;
      for (const m of memberships) {
        if (!m.last_seen_at) continue;
        const { count } = await (supabase as any)
          .from("messages_view")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", m.conversation_id)
          .gt("created_at", m.last_seen_at)
          .neq("sender_id", user.id);
        total += count ?? 0;
      }
      return total;
    },
    enabled: !!user?.id,
    refetchInterval: 10000,
  });

  // Realtime refresh
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("chat-unread-header")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        // Will be refreshed by refetchInterval, but we can trigger manually too
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const getChatPath = () => {
    if (userRole === "admin") return "/dashboard/admin/chat";
    if (userRole === "sales") return "/dashboard/sales-rep/chat";
    if (userRole === "followup") return "/dashboard/follow-up/chat";
    if (userRole === "execution") return "/dashboard/execution/chat";
    return "/dashboard/admin/chat";
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={() => navigate(getChatPath())}
    >
      <MessageCircle className="h-5 w-5" />
      {(unreadCount ?? 0) > 0 && (
        <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] bg-destructive text-destructive-foreground border-0 rounded-full">
          {unreadCount! > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </Button>
  );
}
