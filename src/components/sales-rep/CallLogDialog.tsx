import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Mic, MicOff, Play, Pause, Plus, Clock, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const FOLLOWUP_TYPES = [
  { value: "phone_followup", label: "متابعة تليفونية" },
  { value: "field_visit", label: "زيارة ميدانية" },
  { value: "expected_pour", label: "موعد صبة متوقع" },
];

const FOLLOWUP_TYPE_LABELS: Record<string, string> = {
  phone_followup: "متابعة تليفونية",
  field_visit: "زيارة ميدانية",
  expected_pour: "موعد صبة متوقع",
};

const CALL_TYPES = [
  { value: "call", label: "مكالمة" },
  { value: "field_visit", label: "زيارة ميدانية" },
  { value: "followup", label: "متابعة" },
  { value: "note", label: "ملاحظة" },
];

const CALL_RESULTS = [
  { value: "interested", label: "مهتم" },
  { value: "not_interested", label: "غير مهتم" },
  { value: "postponed", label: "تأجيل" },
  { value: "no_answer", label: "لم يرد" },
  { value: "completed", label: "مكتمل" },
];

const RESULT_LABELS: Record<string, string> = {
  interested: "مهتم",
  not_interested: "غير مهتم",
  postponed: "تأجيل",
  no_answer: "لم يرد",
  completed: "مكتمل",
  field_visit: "زيارة ميدانية",
};

const TYPE_LABELS: Record<string, string> = {
  call: "📞 مكالمة",
  field_visit: "📍 زيارة ميدانية",
  followup: "🔄 متابعة",
  note: "📝 ملاحظة",
};

interface CallLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: number | string;
  clientName: string;
}

export function CallLogDialog({ open, onOpenChange, clientId, clientName }: CallLogDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showNewCall, setShowNewCall] = useState(false);
  const [callType, setCallType] = useState("call");
  const [callResult, setCallResult] = useState("");
  const [callNotes, setCallNotes] = useState("");
  const [nextFollowupDate, setNextFollowupDate] = useState("");
  const [nextFollowupType, setNextFollowupType] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const recorder = useAudioRecorder();

  const { data: calls, isLoading } = useQuery({
    queryKey: ["client-call-history", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("call_logs")
        .select("*")
        .eq("client_id", clientId)
        .order("call_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!clientId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!callResult) throw new Error("اختر نتيجة المكالمة");

      let audioUrl: string | null = null;
      if (recorder.audioBlob) {
        audioUrl = await recorder.uploadAudio(clientId);
      }

      const notes = [callNotes, recorder.transcribedText].filter(Boolean).join("\n");

      const { error } = await (supabase as any).from("call_logs").insert({
        user_id: user!.id,
        client_id: clientId,
        employee_name: user!.email?.split("@")[0] || "",
        call_date: new Date().toISOString(),
        call_type: callType,
        result: callResult,
        notes: notes || null,
        audio_url: audioUrl,
        next_followup_date: nextFollowupDate ? new Date(nextFollowupDate).toISOString() : null,
        next_followup_type: nextFollowupType || null,
      });
      if (error) throw error;

      // Create follow-up notification if scheduled
      if (nextFollowupDate && nextFollowupType) {
        const typeLabel = FOLLOWUP_TYPE_LABELS[nextFollowupType] || "متابعة";
        const { error: notifErr } = await (supabase as any).from("notifications").insert({
          user_id: user!.id,
          type: "followup_reminder",
          title: `تذكير: ${typeLabel} مع ${clientName}`,
          body: `موعدك مع ${clientName} اليوم - سجل النتيجة`,
          scheduled_for: new Date(nextFollowupDate).toISOString(),
          client_id: typeof clientId === "string" ? Number(clientId) : clientId,
          is_read: false,
          metadata: { followup_type: nextFollowupType, client_name: clientName },
        });
        if (notifErr) console.error("Notification insert error:", notifErr);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-call-history", clientId] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["followup-reminders-today"] });
      setShowNewCall(false);
      setCallResult("");
      setCallNotes("");
      setCallType("call");
      setNextFollowupDate("");
      setNextFollowupType("");
      recorder.resetRecording();
      toast({ title: "تم تسجيل المكالمة بنجاح ✅" });
    },
    onError: (err: Error) => {
      console.error("Save call error:", err);
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const togglePlay = (audioUrl: string, id: string) => {
    if (playingId === id) {
      setPlayingId(null);
      return;
    }
    const audio = new Audio(audioUrl);
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-cairo">سجل المكالمات - {clientName}</DialogTitle>
        </DialogHeader>

        {/* New call button */}
        {!showNewCall && (
          <Button onClick={() => setShowNewCall(true)} className="w-full font-cairo gap-2" size="sm">
            <Plus className="h-4 w-4" />
            سجل مكالمة جديدة
          </Button>
        )}

        {/* New call form */}
        {showNewCall && (
          <div className="space-y-3 p-3 border border-border rounded-lg bg-muted/30">
            <div className="space-y-1.5">
              <Label className="font-cairo text-xs">نوع المكالمة</Label>
              <Select value={callType} onValueChange={setCallType}>
                <SelectTrigger className="font-cairo h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="font-cairo">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="font-cairo text-xs">نتيجة المكالمة</Label>
              <Select value={callResult} onValueChange={setCallResult}>
                <SelectTrigger className="font-cairo h-9">
                  <SelectValue placeholder="اختر النتيجة" />
                </SelectTrigger>
                <SelectContent>
                  {CALL_RESULTS.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="font-cairo">{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="font-cairo text-xs">ملاحظات</Label>
              <Textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="أضف ملاحظاتك..."
                className="font-cairo min-h-[60px] text-sm"
              />
              {recorder.transcribedText && (
                <p className="text-xs text-muted-foreground font-cairo bg-muted/50 rounded p-2">
                  🎙️ نص مكتوب: {recorder.transcribedText}
                </p>
              )}
            </div>

            {/* Next follow-up section */}
            <div className="space-y-1.5 p-2 border border-primary/30 rounded-md bg-primary/5">
              <Label className="font-cairo text-xs flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5 text-primary" />
                موعد المتابعة القادم (اختياري)
              </Label>
              <Input
                type="datetime-local"
                value={nextFollowupDate}
                onChange={(e) => setNextFollowupDate(e.target.value)}
                className="font-cairo h-9 text-sm"
              />
              {nextFollowupDate && (
                <Select value={nextFollowupType} onValueChange={setNextFollowupType}>
                  <SelectTrigger className="font-cairo h-9">
                    <SelectValue placeholder="نوع الموعد القادم" />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOWUP_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="font-cairo">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className={cn("font-cairo gap-1 text-xs", recorder.isRecording && "text-destructive border-destructive")}
                onClick={async () => {
                  if (recorder.isRecording) {
                    recorder.stopRecording();
                  } else {
                    try {
                      await recorder.startRecording();
                    } catch {
                      toast({ title: "لا يمكن الوصول للميكروفون", variant: "destructive" });
                    }
                  }
                }}
              >
                {recorder.isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {recorder.isRecording ? "إيقاف" : "تسجيل صوتي"}
              </Button>
              {recorder.audioBlob && (
                <span className="text-xs text-muted-foreground font-cairo">🎙️ تسجيل جاهز</span>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex-1 font-cairo"
                size="sm"
              >
                {saveMutation.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-cairo"
                onClick={() => {
                  setShowNewCall(false);
                  setCallResult("");
                  setCallNotes("");
                  recorder.resetRecording();
                }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {/* Call history */}
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-center text-xs font-cairo text-muted-foreground py-4">جاري التحميل...</p>
          ) : !calls?.length ? (
            <p className="text-center text-xs font-cairo text-muted-foreground py-4">لا يوجد سجل مكالمات</p>
          ) : (
            calls.map((call: any) => (
              <Card key={call.id} className="border-border/50">
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-cairo font-bold text-foreground">
                        {RESULT_LABELS[call.result] || call.result}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-cairo">
                        {TYPE_LABELS[call.call_type] || call.call_type}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-cairo flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(call.call_date), "d/M/yyyy HH:mm")}
                    </span>
                  </div>
                  {call.notes && (
                    <p className="text-xs text-muted-foreground font-cairo">{call.notes}</p>
                  )}
                  {call.audio_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-cairo text-xs gap-1 h-7"
                      onClick={() => togglePlay(call.audio_url, call.id)}
                    >
                      {playingId === call.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      {playingId === call.id ? "إيقاف" : "تشغيل ▶️"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
