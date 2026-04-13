import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Sparkles, Phone, ArrowRight, Loader2, CalendarDays, Truck, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Client {
  id: number;
  name: string;
  phone: string | null;
  status: string;
  notes: string | null;
  [key: string]: any;
}

type RoleType = "sales" | "followup" | "execution";

interface AIAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  role?: RoleType;
}

const ROLE_ACTIONS: Record<RoleType, { key: string; label: string; icon: any }[]> = {
  sales: [
    { key: "classify", label: "تصنيف تلقائي", icon: Sparkles },
    { key: "script", label: "سكريبت مكالمة", icon: Phone },
    { key: "next_step", label: "الخطوة التالية", icon: ArrowRight },
  ],
  followup: [
    { key: "followup_plan", label: "خطة متابعة", icon: CalendarDays },
    { key: "next_step", label: "موعد الصبة المقترح", icon: Truck },
    { key: "classify", label: "تصنيف العميل", icon: Sparkles },
  ],
  execution: [
    { key: "execution_notes", label: "ملاحظات التنفيذ", icon: ClipboardList },
    { key: "next_step", label: "تفاصيل الصبة", icon: Truck },
  ],
};

export function AIAssistantDialog({ open, onOpenChange, client, role = "sales" }: AIAssistantDialogProps) {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setResponse("");
      setActiveAction(null);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [response]);

  async function getCallLogs() {
    const { data } = await supabase
      .from("call_logs")
      .select("call_type, notes, result, call_date")
      .eq("client_id", client.id)
      .order("call_date", { ascending: false })
      .limit(5);
    return data ?? [];
  }

  async function runAction(action: string) {
    setLoading(true);
    setResponse("");
    setActiveAction(action);

    const logs = await getCallLogs();
    const logsText = logs.length
      ? logs.map((l) => `- ${l.call_type}: ${l.notes || "بدون ملاحظات"} (${l.result}) - ${l.call_date}`).join("\n")
      : "لا يوجد سجل مكالمات";

    const clientData = `اسم العميل: ${client.name}
التصنيف الحالي: ${client.status}
الملاحظات: ${client.notes || "لا يوجد"}
الهاتف: ${client.phone || "غير محدد"}
المنطقة: ${client.area || "غير محددة"}
موعد الصبة المتوقع: ${client.expected_pour_date || "غير محدد"}
موعد المتابعة القادم: ${client.next_followup_date || "غير محدد"}
سجل المكالمات:
${logsText}`;

    try {
      const res = await fetch(
        "https://ssuwzsdpzohmfuhvuzmx.supabase.co/functions/v1/ai-assistant",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzdXd6c2Rwem9obWZ1aHZ1em14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTEzNjcsImV4cCI6MjA5MDg2NzM2N30.266UWBIopQo5w349uU3z_SPUJYtEgtxQUXtv95xVh9U",
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzdXd6c2Rwem9obWZ1aHZ1em14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTEzNjcsImV4cCI6MjA5MDg2NzM2N30.266UWBIopQo5w349uU3z_SPUJYtEgtxQUXtv95xVh9U",
          },
          body: JSON.stringify({ action, role, clientData }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        console.error("AI error:", data);
        setResponse(`⚠️ خطأ: ${data?.error || res.statusText}`);
        return;
      }

      if (data?.error) {
        setResponse(`⚠️ ${data.error}`);
      } else {
        setResponse(data?.response || "لم يتم الحصول على رد");
      }
    } catch (e: any) {
      console.error("AI error:", e);
      setResponse(`⚠️ حدث خطأ: ${e.message || "خطأ غير معروف"}`);
    } finally {
      setLoading(false);
    }
  }

  const actions = ROLE_ACTIONS[role] || ROLE_ACTIONS.sales;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-cairo flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            مساعد AI — {client.name}
          </DialogTitle>
          <DialogDescription className="font-cairo text-muted-foreground">
            اختر إجراء ليقوم المساعد الذكي بتحليله
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a.key}
              size="sm"
              variant={activeAction === a.key ? "default" : "outline"}
              className="font-cairo text-xs gap-1"
              onClick={() => runAction(a.key)}
              disabled={loading}
            >
              <a.icon className="h-3.5 w-3.5" />
              {a.label}
            </Button>
          ))}
        </div>

        <ScrollArea className="flex-1 min-h-[200px] max-h-[400px] border rounded-lg p-4 bg-muted/30" ref={scrollRef}>
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground font-cairo">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحليل...
            </div>
          )}
          {response && !loading && (
            <div className="font-cairo text-sm whitespace-pre-wrap leading-relaxed text-foreground">
              {response}
            </div>
          )}
          {!loading && !response && (
            <p className="text-muted-foreground font-cairo text-sm text-center py-8">
              اختر إجراء من الأعلى لبدء التحليل الذكي
            </p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
