import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Send, Users, User, ArrowRight } from "lucide-react";

interface ChatMessage {
  id: number;
  sender_id: string;
  sender_name: string;
  receiver_id: string | null;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  auth_id: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "أدمن",
  sales: "مبيعات",
  followup: "متابعة",
  execution: "تنفيذ",
};

export function TeamChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState<{ type: "group" | "private"; userId?: string; userName?: string } | null>(null);
  const [messageText, setMessageText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get current user name
  const { data: currentUserName } = useQuery({
    queryKey: ["chat-current-user", user?.id],
    queryFn: async () => {
      if (!user?.id) return "مستخدم";
      const { data } = await supabase.from("users").select("name").eq("auth_id", user.id).single();
      return data?.name ?? "مستخدم";
    },
    enabled: !!user?.id,
  });

  // Get team members
  const { data: teamMembers } = useQuery({
    queryKey: ["chat-team-members"],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("id, name, role, auth_id").eq("active", true).order("name");
      return (data ?? []).filter((m: any) => m.auth_id && m.auth_id !== user?.id) as TeamMember[];
    },
    enabled: !!user?.id,
  });

  // Get messages for selected chat
  const { data: messages } = useQuery({
    queryKey: ["chat-messages", selectedChat?.type, selectedChat?.userId],
    queryFn: async () => {
      let query = supabase.from("messages").select("*").order("created_at", { ascending: true });
      
      if (selectedChat?.type === "group") {
        query = query.is("receiver_id", null);
      } else if (selectedChat?.type === "private" && selectedChat.userId) {
        query = query.or(`and(sender_id.eq.${user!.id},receiver_id.eq.${selectedChat.userId}),and(sender_id.eq.${selectedChat.userId},receiver_id.eq.${user!.id})`);
      }
      
      const { data } = await query.limit(100);
      return (data ?? []) as ChatMessage[];
    },
    enabled: !!selectedChat && !!user?.id,
    refetchInterval: false,
  });

  // Unread count
  const { data: unreadCount } = useQuery({
    queryKey: ["chat-unread-count", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false)
        .neq("sender_id", user!.id)
        .or(`receiver_id.eq.${user!.id},receiver_id.is.null`);
      return count ?? 0;
    },
    enabled: !!user?.id,
    refetchInterval: 10000,
  });

  // Notification sound using Web Audio API
  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio not available
    }
  };

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("messages-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: any) => {
        queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
        queryClient.invalidateQueries({ queryKey: ["chat-unread-count"] });
        // Play sound only for messages from others
        if (payload.new?.sender_id !== user.id) {
          playNotificationSound();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Mark messages as read when viewing
  useEffect(() => {
    if (!selectedChat || !user?.id || !messages?.length) return;
    
    const unreadIds = messages
      .filter((m) => !m.is_read && m.sender_id !== user.id)
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      supabase
        .from("messages")
        .update({ is_read: true })
        .in("id", unreadIds)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["chat-unread-count"] });
        });
    }
  }, [messages, selectedChat, user?.id, queryClient]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!text.trim() || !user?.id) return;
      const payload = {
        sender_id: user.id,
        sender_name: currentUserName ?? "مستخدم",
        receiver_id: selectedChat?.type === "private" ? selectedChat.userId! : null,
        message: text.trim(),
        is_read: false,
      };
      const { error } = await supabase.from("messages").insert([payload]);
      if (error) {
        console.error("Message insert error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      queryClient.invalidateQueries({ queryKey: ["chat-unread-count"] });
    },
    onError: (err: any) => {
      console.error("Failed to send message:", err);
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = messageText.trim();
    if (!text) return;
    
    // Optimistic update - show message instantly
    const optimisticMsg: ChatMessage = {
      id: Date.now(),
      sender_id: user!.id,
      sender_name: currentUserName ?? "مستخدم",
      receiver_id: selectedChat?.type === "private" ? selectedChat!.userId! : null,
      message: text,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    const key = ["chat-messages", selectedChat?.type, selectedChat?.userId];
    const prev = queryClient.getQueryData<ChatMessage[]>(key) ?? [];
    queryClient.setQueryData(key, [...prev, optimisticMsg]);
    
    setMessageText("");
    sendMutation.mutate(text);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ar-EG", { month: "short", day: "numeric" });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <MessageCircle className="h-5 w-5" />
          {(unreadCount ?? 0) > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] bg-destructive text-destructive-foreground border-0">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full sm:w-[400px] p-0 flex flex-col" dir="rtl">
        {!selectedChat ? (
          <>
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="font-cairo text-right">الشات الداخلي</SheetTitle>
            </SheetHeader>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {/* Group chat */}
                <button
                  onClick={() => setSelectedChat({ type: "group" })}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-right"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-cairo font-medium text-sm">غرفة الفريق</p>
                    <p className="text-xs text-muted-foreground font-cairo">محادثة جماعية لكل الفريق</p>
                  </div>
                </button>

                {/* Private chats */}
                <div className="pt-2">
                  <p className="text-xs font-cairo text-muted-foreground px-3 mb-2">محادثات خاصة</p>
                  {(teamMembers ?? []).map((member) => (
                    <button
                      key={member.id}
                      onClick={() => setSelectedChat({ type: "private", userId: member.auth_id!, userName: member.name })}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-right"
                    >
                      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shrink-0">
                        <span className="font-cairo font-bold text-sm text-accent-foreground">{member.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-cairo font-medium text-sm">{member.name}</p>
                        <p className="text-xs text-muted-foreground font-cairo">{ROLE_LABELS[member.role] ?? member.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 p-4 border-b">
              <Button variant="ghost" size="icon" onClick={() => setSelectedChat(null)} className="shrink-0">
                <ArrowRight className="h-4 w-4" />
              </Button>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {selectedChat.type === "group" ? (
                  <Users className="h-4 w-4 text-primary" />
                ) : (
                  <User className="h-4 w-4 text-primary" />
                )}
              </div>
              <p className="font-cairo font-medium text-sm">
                {selectedChat.type === "group" ? "غرفة الفريق" : selectedChat.userName}
              </p>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
              {!messages?.length ? (
                <p className="text-center text-muted-foreground font-cairo text-sm py-10">لا توجد رسائل بعد</p>
              ) : (
                messages.map((msg, idx) => {
                  const isMine = msg.sender_id === user?.id;
                  const showDate = idx === 0 || formatDate(msg.created_at) !== formatDate(messages[idx - 1].created_at);
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="text-center my-2">
                          <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-cairo text-muted-foreground">
                            {formatDate(msg.created_at)}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          {!isMine && (
                            <p className={`text-[10px] font-cairo font-bold mb-0.5 ${isMine ? "text-primary-foreground/70" : "text-primary"}`}>
                              {msg.sender_name}
                            </p>
                          )}
                          <p className="text-sm font-cairo leading-relaxed">{msg.content}</p>
                          <p className={`text-[9px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-3 border-t flex gap-2">
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="اكتب رسالة..."
                className="font-cairo flex-1"
                autoFocus
              />
              <Button type="submit" size="icon" disabled={!messageText.trim() || sendMutation.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
