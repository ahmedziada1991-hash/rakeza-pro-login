import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, User } from "lucide-react";
import { useEffect } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { ar } from "date-fns/locale";

const ROLE_LABELS: Record<string, string> = {
  admin: "أدمن", sales: "مبيعات", followup: "متابعة", execution: "تنفيذ",
};

interface Props {
  userId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "hh:mm a");
  if (isYesterday(d)) return "أمس";
  return format(d, "MM/dd");
}

export function ConversationList({ userId, selectedId, onSelect }: Props) {
  const { data: conversations, isLoading, refetch } = useQuery({
    queryKey: ["chat-conversations", userId],
    queryFn: async () => {
      // Get user's conversation memberships
      const { data: memberships } = await (supabase as any)
        .from("conversation_members")
        .select("conversation_id, last_seen_at")
        .eq("user_id", userId);

      if (!memberships?.length) return [];

      const convIds = memberships.map((m: any) => m.conversation_id);
      const lastSeenMap = new Map(memberships.map((m: any) => [m.conversation_id, m.last_seen_at]));

      // Get conversations
      const { data: convs } = await (supabase as any)
        .from("conversations")
        .select("*")
        .in("id", convIds)
        .order("created_at", { ascending: false });

      // Get all members for these conversations
      const { data: allMembers } = await (supabase as any)
        .from("conversation_members")
        .select("conversation_id, user_id")
        .in("conversation_id", convIds);

      // Get user names
      const memberIds = [...new Set((allMembers ?? []).map((m: any) => m.user_id))];
      const { data: users } = memberIds.length
        ? await (supabase as any).from("users").select("id, name, role, auth_id").in("auth_id", memberIds)
        : { data: [] };
      const userMap = new Map((users ?? []).map((u: any) => [u.auth_id, u]));

      // Get last message for each conversation
      const results = await Promise.all((convs ?? []).map(async (conv: any) => {
        const { data: lastMsgs } = await (supabase as any)
          .from("messages")
          .select("message, created_at, sender_id, message_type")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const lastMsg = lastMsgs?.[0] ?? null;

        // Count unread
        const lastSeen = lastSeenMap.get(conv.id);
        let unreadCount = 0;
        if (lastSeen) {
          const { count } = await (supabase as any)
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .gt("created_at", lastSeen)
            .neq("sender_id", userId);
          unreadCount = count ?? 0;
        }

        // Get other members for display name
        const convMembers = (allMembers ?? []).filter((m: any) => m.conversation_id === conv.id);
        const otherMembers = convMembers.filter((m: any) => m.user_id !== userId);
        const displayName = conv.is_group
          ? conv.name || "مجموعة"
          : otherMembers.length > 0
            ? userMap.get(otherMembers[0].user_id)?.name || "مستخدم"
            : "أنت";

        const otherUser = !conv.is_group && otherMembers.length > 0
          ? userMap.get(otherMembers[0].user_id)
          : null;

        return {
          id: conv.id,
          name: displayName,
          isGroup: conv.is_group,
          lastMessage: lastMsg?.message_type === "audio" ? "🎙️ رسالة صوتية" : lastMsg?.message ?? "",
          lastMessageTime: lastMsg?.created_at ?? conv.created_at,
          unreadCount,
          role: otherUser?.role,
          memberCount: convMembers.length,
        };
      }));

      // Sort by last message time
      return results.sort((a: any, b: any) =>
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      );
    },
    refetchInterval: 10000,
  });

  // Realtime subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel("chat-list-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        refetch();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="p-3 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!conversations?.length) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="font-cairo text-muted-foreground text-sm text-center">لا توجد محادثات بعد<br />ابدأ محادثة جديدة</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y divide-border">
        {conversations.map((conv: any) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full flex items-center gap-3 p-3 text-right transition-colors hover:bg-muted/50 ${
              selectedId === conv.id ? "bg-primary/10" : ""
            }`}
          >
            {/* Avatar */}
            <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
              conv.isGroup ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {conv.isGroup ? <Users className="h-5 w-5" /> : (
                <span className="font-cairo font-bold text-sm">{conv.name?.charAt(0) ?? "؟"}</span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-cairo font-medium text-sm text-foreground truncate">{conv.name}</span>
                <span className="text-[10px] text-muted-foreground font-cairo shrink-0">
                  {formatTime(conv.lastMessageTime)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground font-cairo truncate">{conv.lastMessage || "لا توجد رسائل"}</p>
                {conv.unreadCount > 0 && (
                  <Badge className="h-5 min-w-5 px-1.5 text-[10px] font-cairo bg-primary text-primary-foreground rounded-full shrink-0">
                    {conv.unreadCount}
                  </Badge>
                )}
              </div>
              {conv.role && (
                <span className="text-[10px] text-muted-foreground/70 font-cairo">
                  {ROLE_LABELS[conv.role] ?? conv.role}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
