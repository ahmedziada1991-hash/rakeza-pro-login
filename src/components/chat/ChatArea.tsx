import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, ArrowRight, Mic, Square, Play, Pause, Users } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  conversationId: string;
  userId: string;
  onBack: () => void;
}

function formatMsgTime(dateStr: string) {
  const d = new Date(dateStr);
  return format(d, "hh:mm a");
}

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "اليوم";
  if (isYesterday(d)) return "أمس";
  return format(d, "EEEE d MMMM", { locale: ar });
}

export function ChatArea({ conversationId, userId, onBack }: Props) {
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get conversation details
  const { data: convInfo } = useQuery({
    queryKey: ["chat-conv-info", conversationId],
    queryFn: async () => {
      const { data: conv } = await (supabase as any)
        .from("conversations").select("*").eq("id", conversationId).single();
      const { data: members } = await (supabase as any)
        .from("conversation_members").select("user_id").eq("conversation_id", conversationId);
      const memberIds = (members ?? []).map((m: any) => m.user_id);
      const { data: users } = memberIds.length
        ? await (supabase as any).from("users").select("name, auth_id, role").in("auth_id", memberIds)
        : { data: [] };
      const otherUsers = (users ?? []).filter((u: any) => u.auth_id !== userId);
      const displayName = conv?.is_group
        ? conv.name || "مجموعة"
        : otherUsers[0]?.name || "محادثة";
      return { ...conv, displayName, memberCount: memberIds.length, members: users ?? [] };
    },
  });

  // Get current user name
  const { data: currentUserName } = useQuery({
    queryKey: ["chat-my-name", userId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("users").select("name").eq("auth_id", userId).single();
      return data?.name ?? "أنا";
    },
  });

  // Get messages
  const { data: messages, isLoading, refetch } = useQuery({
    queryKey: ["chat-messages", conversationId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      // Get sender names
      const senderIds = [...new Set((data ?? []).map((m: any) => m.sender_id))];
      const { data: users } = senderIds.length
        ? await (supabase as any).from("users").select("name, auth_id").in("auth_id", senderIds)
        : { data: [] };
      const nameMap = new Map((users ?? []).map((u: any) => [u.auth_id, u.name]));

      return (data ?? []).map((m: any) => ({
        ...m,
        senderName: nameMap.get(m.sender_id) ?? "مستخدم",
      }));
    },
  });

  // Update last_seen_at when opening conversation
  useEffect(() => {
    if (!conversationId || !userId) return;
    (supabase as any)
      .from("conversation_members")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      });
  }, [conversationId, userId, messages?.length]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat-room-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        refetch();
        // Play notification sound for messages from others
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 800;
          gain.gain.value = 0.1;
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        } catch {}
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, refetch]);

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || sending) return;
    setSending(true);
    setMessageText("");

    const { error } = await (supabase as any).from("messages").insert({
      conversation_id: conversationId,
      sender_id: userId,
      sender_name: currentUserName ?? "مستخدم",
      message: text,
      message_type: "text",
    });

    if (error) {
      toast.error("فشل إرسال الرسالة");
      setMessageText(text);
    }
    setSending(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await uploadAndSendAudio(blob);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
    } catch {
      toast.error("لا يمكن الوصول للميكروفون");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const uploadAndSendAudio = async (blob: Blob) => {
    setSending(true);
    const fileName = `chat_${conversationId}_${Date.now()}.webm`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("call-recordings")
      .upload(fileName, blob, { contentType: "audio/webm" });

    if (uploadError) {
      toast.error("فشل رفع التسجيل");
      setSending(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("call-recordings").getPublicUrl(fileName);
    const audioUrl = urlData?.publicUrl;

    // Speech-to-text
    let transcription = "";
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        // Note: real-time transcription would need to happen during recording
        // For now, just send as audio message
      }
    } catch {}

    const { error } = await (supabase as any).from("messages").insert({
      conversation_id: conversationId,
      sender_id: userId,
      sender_name: currentUserName ?? "مستخدم",
      message: transcription || "🎙️ رسالة صوتية",
      audio_url: audioUrl,
      message_type: "audio",
    });

    if (error) toast.error("فشل إرسال الرسالة الصوتية");
    setSending(false);
  };

  const togglePlayAudio = (url: string) => {
    if (playingUrl === url) {
      audioRef.current?.pause();
      setPlayingUrl(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audio.onended = () => setPlayingUrl(null);
      audio.play();
      audioRef.current = audio;
      setPlayingUrl(url);
    }
  };

  // Group messages by date
  const groupedMessages = (messages ?? []).reduce((acc: any[], msg: any) => {
    const dateKey = new Date(msg.created_at).toDateString();
    const last = acc[acc.length - 1];
    if (last && last.dateKey === dateKey) {
      last.messages.push(msg);
    } else {
      acc.push({ dateKey, dateLabel: formatDateHeader(msg.created_at), messages: [msg] });
    }
    return acc;
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-3 bg-muted/30 shrink-0">
        <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={onBack}>
          <ArrowRight className="h-4 w-4" />
        </Button>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          convInfo?.is_group ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        }`}>
          {convInfo?.is_group ? <Users className="h-5 w-5" /> : (
            <span className="font-cairo font-bold">{convInfo?.displayName?.charAt(0) ?? "؟"}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-cairo font-bold text-sm text-foreground truncate">{convInfo?.displayName}</p>
          {convInfo?.is_group && (
            <p className="text-[10px] text-muted-foreground font-cairo">{convInfo.memberCount} عضو</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {isLoading ? (
          <div className="space-y-4 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                <Skeleton className="h-10 w-48 rounded-xl" />
              </div>
            ))}
          </div>
        ) : !groupedMessages.length ? (
          <div className="flex items-center justify-center h-full">
            <p className="font-cairo text-muted-foreground text-sm">لا توجد رسائل بعد — ابدأ المحادثة!</p>
          </div>
        ) : (
          groupedMessages.map((group: any) => (
            <div key={group.dateKey}>
              <div className="flex justify-center my-3">
                <span className="bg-muted text-muted-foreground text-[10px] font-cairo px-3 py-1 rounded-full">
                  {group.dateLabel}
                </span>
              </div>
              {group.messages.map((msg: any) => {
                const isMine = msg.sender_id === userId;
                return (
                  <div key={msg.id} className={`flex mb-2 ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                      isMine
                        ? "bg-primary text-primary-foreground rounded-bl-md"
                        : "bg-muted text-foreground rounded-br-md"
                    }`}>
                      {!isMine && convInfo?.is_group && (
                        <p className={`text-[10px] font-cairo font-bold mb-0.5 ${isMine ? "text-primary-foreground/70" : "text-primary"}`}>
                          {msg.senderName}
                        </p>
                      )}
                      {msg.message_type === "audio" && msg.audio_url ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => togglePlayAudio(msg.audio_url)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              isMine ? "bg-primary-foreground/20" : "bg-primary/10"
                            }`}
                          >
                            {playingUrl === msg.audio_url
                              ? <Pause className="h-4 w-4" />
                              : <Play className="h-4 w-4" />
                            }
                          </button>
                          <div className="flex-1">
                            <div className={`h-1 rounded-full ${isMine ? "bg-primary-foreground/30" : "bg-border"}`}>
                              <div className={`h-1 rounded-full w-1/2 ${isMine ? "bg-primary-foreground/60" : "bg-primary/40"}`} />
                            </div>
                          </div>
                          <span className={`text-[10px] font-cairo ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            🎙️
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm font-cairo leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                      )}
                      <p className={`text-[9px] font-cairo mt-1 text-left ${
                        isMine ? "text-primary-foreground/50" : "text-muted-foreground/60"
                      }`}>
                        {formatMsgTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          {recording ? (
            <>
              <Button
                variant="destructive"
                size="icon"
                className="shrink-0 rounded-full"
                onClick={stopRecording}
              >
                <Square className="h-4 w-4" />
              </Button>
              <div className="flex-1 flex items-center gap-2">
                <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
                <span className="font-cairo text-sm text-destructive">جاري التسجيل...</span>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-primary"
                onClick={startRecording}
                disabled={sending}
              >
                <Mic className="h-5 w-5" />
              </Button>
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="اكتب رسالة..."
                className="font-cairo flex-1"
                disabled={sending}
              />
              <Button
                size="icon"
                className="shrink-0 rounded-full"
                onClick={handleSend}
                disabled={!messageText.trim() || sending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
