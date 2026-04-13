import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Send, ArrowRight, Mic, Square, Play, Pause, Users, Paperclip, Smile, Image, Film, FileText, Download, X } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  conversationId: string;
  userId: string;
  onBack: () => void;
}

function formatMsgTime(dateStr: string) {
  return format(new Date(dateStr), "hh:mm a");
}

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "اليوم";
  if (isYesterday(d)) return "أمس";
  return format(d, "EEEE d MMMM", { locale: ar });
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const EMOJI_LIST = [
  "😊", "😂", "❤️", "👍", "🔥", "😍", "😢", "😎", "🙏", "💪",
  "👏", "🎉", "😁", "🤣", "😘", "🥰", "😃", "😄", "😆", "😅",
  "🤗", "🤩", "😇", "🥳", "😋", "😜", "🤔", "😴", "😤", "😡",
  "👋", "✌️", "🤝", "💯", "⭐", "🌟", "💫", "✨", "🎊", "🎈",
  "📞", "💬", "📝", "📌", "✅", "❌", "⚠️", "🔔", "📢", "🏗️",
];

export function ChatArea({ conversationId, userId, onBack }: Props) {
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileAccept, setFileAccept] = useState<string>("");

  // Get conversation details
  const { data: convInfo } = useQuery({
    queryKey: ["chat-conv-info", conversationId],
    queryFn: async () => {
      const { data: conv } = await (supabase as any)
        .from("conversations").select("*").eq("id", conversationId).single();
      const { data: members } = await (supabase as any)
        .from("conversation_members").select("user_id, last_seen_at").eq("conversation_id", conversationId);
      const memberIds = (members ?? []).map((m: any) => m.user_id);
      const { data: users } = memberIds.length
        ? await (supabase as any).from("users").select("name, auth_id, role").in("auth_id", memberIds)
        : { data: [] };
      const otherUsers = (users ?? []).filter((u: any) => u.auth_id !== userId);
      const displayName = conv?.is_group
        ? conv.name || "مجموعة"
        : otherUsers[0]?.name || "محادثة";
      // Track other members' last_seen_at for read receipts
      const otherMembersLastSeen = (members ?? [])
        .filter((m: any) => m.user_id !== userId)
        .map((m: any) => m.last_seen_at);
      return { ...conv, displayName, memberCount: memberIds.length, members: users ?? [], otherMembersLastSeen };
    },
  });

  const { data: currentUserName } = useQuery({
    queryKey: ["chat-my-name", userId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("users").select("name").eq("auth_id", userId).single();
      return data?.name ?? "أنا";
    },
  });

  const { data: messages, isLoading, refetch } = useQuery({
    queryKey: ["chat-messages", conversationId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("messages_view")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

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

  // Update last_seen_at
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`chat-room-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ["chat-conv-info", conversationId] });
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 800; gain.gain.value = 0.1;
          osc.start(); osc.stop(ctx.currentTime + 0.1);
        } catch {}
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, refetch]);

  // Recording timer
  useEffect(() => {
    if (recording) {
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recording]);

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || sending) return;
    setSending(true);
    setMessageText("");
    
    // Refresh session to ensure valid JWT
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.error("Session refresh failed:", refreshError);
      toast.error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
      setMessageText(text);
      setSending(false);
      return;
    }
    
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const senderId = authUser?.id ?? userId;
    
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: senderId,
      sender_name: currentUserName ?? "مستخدم",
      content: text,
      message_type: "text",
    });
    if (error) {
      console.error("Message send error:", error);
      toast.error("فشل إرسال الرسالة: " + error.message);
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
    const { error: uploadError } = await supabase.storage
      .from("call-recordings").upload(fileName, blob, { contentType: "audio/webm" });
    if (uploadError) { toast.error("فشل رفع التسجيل"); setSending(false); return; }

    const { data: urlData } = supabase.storage.from("call-recordings").getPublicUrl(fileName);
    const duration = recordingTime;

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: authUser?.id ?? userId,
      sender_name: currentUserName ?? "مستخدم",
      content: `🎙️ رسالة صوتية (${formatDuration(duration)})`,
      audio_url: urlData?.publicUrl, message_type: "audio",
    });
    if (error) { console.error("Audio msg error:", error); toast.error("فشل إرسال الرسالة الصوتية"); }
    setSending(false);
  };

  // Attachments
  const openFilePicker = (accept: string) => {
    setFileAccept(accept);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setSending(true);
    const ext = file.name.split(".").pop() ?? "bin";
    const fileName = `${conversationId}_${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("chat-attachments").upload(fileName, file, { contentType: file.type });
    if (upErr) { toast.error("فشل رفع الملف"); setSending(false); return; }

    const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(fileName);
    const url = urlData?.publicUrl;

    let attachmentType = "file";
    if (file.type.startsWith("image/")) attachmentType = "image";
    else if (file.type.startsWith("video/")) attachmentType = "video";

    const msgType = attachmentType === "image" ? "image" : attachmentType === "video" ? "video" : "file";
    const label = attachmentType === "image" ? "🖼️ صورة"
      : attachmentType === "video" ? `🎥 ${file.name} (${formatFileSize(file.size)})`
      : `📄 ${file.name} (${formatFileSize(file.size)})`;

    const { data: { user: authUser2 } } = await supabase.auth.getUser();
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: authUser2?.id ?? userId,
      sender_name: currentUserName ?? "مستخدم",
      content: label, message_type: msgType,
      attachment_url: url, attachment_type: attachmentType,
    });
    if (error) { console.error("Attachment msg error:", error); toast.error("فشل إرسال المرفق"); }
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

  const addEmoji = (emoji: string) => {
    setMessageText(prev => prev + emoji);
  };

  // Check if message is read by all other members
  const isMessageRead = (msgCreatedAt: string) => {
    if (!convInfo?.otherMembersLastSeen?.length) return false;
    const msgTime = new Date(msgCreatedAt).getTime();
    return convInfo.otherMembersLastSeen.every(
      (ls: string | null) => ls && new Date(ls).getTime() > msgTime
    );
  };

  // Group messages by date
  const groupedMessages = (messages ?? []).reduce((acc: any[], msg: any) => {
    const dateKey = new Date(msg.created_at).toDateString();
    const last = acc[acc.length - 1];
    if (last && last.dateKey === dateKey) { last.messages.push(msg); }
    else { acc.push({ dateKey, dateLabel: formatDateHeader(msg.created_at), messages: [msg] }); }
    return acc;
  }, []);

  const renderMessageContent = (msg: any, isMine: boolean) => {
    // Audio message
    if (msg.message_type === "audio" && msg.audio_url) {
      return (
        <div className="flex items-center gap-2 min-w-[160px]">
          <button
            onClick={() => togglePlayAudio(msg.audio_url)}
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              isMine ? "bg-primary-foreground/20" : "bg-primary/10"
            }`}
          >
            {playingUrl === msg.audio_url ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
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
      );
    }

    // Image
    if (msg.message_type === "image" && msg.attachment_url) {
      return (
        <img
          src={msg.attachment_url}
          alt="صورة"
          className="rounded-lg max-w-full max-h-60 cursor-pointer"
          onClick={() => window.open(msg.attachment_url, "_blank")}
        />
      );
    }

    // Video
    if (msg.message_type === "video" && msg.attachment_url) {
      return (
        <div className="space-y-1">
          <video src={msg.attachment_url} controls className="rounded-lg max-w-full max-h-60" />
          <p className="text-xs font-cairo opacity-70">{msg.content}</p>
        </div>
      );
    }

    // File
    if (msg.message_type === "file" && msg.attachment_url) {
      return (
        <a
          href={msg.attachment_url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 ${isMine ? "text-primary-foreground" : "text-foreground"}`}
        >
          <FileText className="h-5 w-5 shrink-0" />
          <span className="text-sm font-cairo underline">{msg.content}</span>
          <Download className="h-4 w-4 shrink-0" />
        </a>
      );
    }

    // Text
    return <p className="text-sm font-cairo leading-relaxed whitespace-pre-wrap">{msg.content}</p>;
  };

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
                        <p className="text-[10px] font-cairo font-bold mb-0.5 text-primary">
                          {msg.senderName}
                        </p>
                      )}
                      {renderMessageContent(msg, isMine)}
                      <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-start" : "justify-end"}`}>
                        <span className={`text-[9px] font-cairo ${
                          isMine ? "text-primary-foreground/50" : "text-muted-foreground/60"
                        }`}>
                          {formatMsgTime(msg.created_at)}
                        </span>
                        {isMine && (
                          <span className={`text-[10px] ${
                            isMessageRead(msg.created_at)
                              ? "text-blue-300"
                              : isMine ? "text-primary-foreground/50" : "text-muted-foreground/50"
                          }`}>
                            {isMessageRead(msg.created_at) ? "✓✓" : "✓"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={fileAccept}
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Input bar */}
      <div className="p-3 border-t border-border bg-card shrink-0">
        <div className="flex items-center gap-1.5">
          {recording ? (
            <>
              <Button variant="destructive" size="icon" className="shrink-0 rounded-full" onClick={stopRecording}>
                <Square className="h-4 w-4" />
              </Button>
              <div className="flex-1 flex items-center gap-2 px-2">
                <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
                <span className="font-cairo text-sm text-destructive font-bold tabular-nums">
                  {formatDuration(recordingTime)}
                </span>
                <span className="font-cairo text-xs text-muted-foreground">جاري التسجيل...</span>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => {
                if (mediaRecorderRef.current?.state === "recording") {
                  mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
                  mediaRecorderRef.current = null;
                }
                audioChunksRef.current = [];
                setRecording(false);
              }}>
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            </>
          ) : (
            <>
              {/* Emoji */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-primary">
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-72 p-2">
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJI_LIST.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => addEmoji(emoji)}
                        className="text-xl hover:bg-muted rounded p-1 transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Attachments */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-primary">
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-44 p-1.5">
                  <div className="space-y-0.5">
                    <button
                      onClick={() => openFilePicker("image/*")}
                      className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted transition-colors text-right"
                    >
                      <Image className="h-4 w-4 text-green-500" />
                      <span className="font-cairo text-sm">صورة 🖼️</span>
                    </button>
                    <button
                      onClick={() => openFilePicker("video/*")}
                      className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted transition-colors text-right"
                    >
                      <Film className="h-4 w-4 text-blue-500" />
                      <span className="font-cairo text-sm">فيديو 🎥</span>
                    </button>
                    <button
                      onClick={() => openFilePicker("*/*")}
                      className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted transition-colors text-right"
                    >
                      <FileText className="h-4 w-4 text-orange-500" />
                      <span className="font-cairo text-sm">ملف 📄</span>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Mic */}
              <Button
                variant="ghost" size="icon"
                className="shrink-0 text-muted-foreground hover:text-primary"
                onClick={startRecording} disabled={sending}
              >
                <Mic className="h-5 w-5" />
              </Button>

              {/* Text input */}
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="اكتب رسالة..."
                className="font-cairo flex-1"
                disabled={sending}
              />

              {/* Send */}
              <Button
                size="icon" className="shrink-0 rounded-full"
                onClick={handleSend} disabled={!messageText.trim() || sending}
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
