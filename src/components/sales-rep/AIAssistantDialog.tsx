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
    { key: "next", label: "الخطوة التالية", icon: ArrowRight },
  ],
  followup: [
    { key: "last_contact", label: "آخر تواصل", icon: CalendarDays },
    { key: "pour_suggestion", label: "اقتراح موعد صبة", icon: Truck },
    { key: "followup_method", label: "طريقة المتابعة", icon: ArrowRight },
  ],
  execution: [
    { key: "pour_details", label: "تفاصيل الصبة", icon: ClipboardList },
    { key: "quantity_station", label: "الكمية والمحطة", icon: Truck },
    { key: "exec_notes", label: "ملاحظات التنفيذ", icon: Sparkles },
  ],
};

export function AIAssistantDialog({ open, onOpenChange, client, role = "sales" }: AIAssistantDialogProps) {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setResponse("");
      setActiveAction(null);
      setErrorDetail(null);
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

  function buildPrompt(action: string, clientInfo: string): string {
    // Sales prompts
    if (action === "classify") {
      return `بناءً على بيانات العميل التالية، صنّف العميل (ساخن/دافئ/بارد) واشرح السبب:\n\n${clientInfo}`;
    }
    if (action === "script") {
      return `اكتب سكريبت مكالمة مبيعات مخصص لهذا العميل بالعربي:\n\n${clientInfo}\n\nالسكريبت يتضمن: مقدمة، أسئلة، عرض، ردود على اعتراضات، وختام.`;
    }
    if (action === "next") {
      return `بناءً على بيانات هذا العميل، إيه الخطوة التالية المقترحة؟\n\n${clientInfo}`;
    }
    // Followup prompts
    if (action === "last_contact") {
      return `بناءً على بيانات العميل وسجل المكالمات، متى كان آخر تواصل مع هذا العميل؟ وما هي نتيجة آخر تواصل؟ وهل مر وقت طويل بدون تواصل؟\n\n${clientInfo}`;
    }
    if (action === "pour_suggestion") {
      return `بناءً على بيانات العميل التالية، اقترح موعد مناسب للصبة القادمة مع الأسباب. خد في الاعتبار المواعيد السابقة وحالة العميل:\n\n${clientInfo}`;
    }
    if (action === "followup_method") {
      return `بناءً على بيانات هذا العميل، إيه أفضل طريقة للمتابعة معاه دلوقتي؟ (مكالمة/واتساب/زيارة ميدانية) واشرح ليه:\n\n${clientInfo}`;
    }
    // Execution prompts
    if (action === "pour_details") {
      return `بناءً على بيانات العميل التالية، لخّص تفاصيل الصبة المطلوبة وأي ملاحظات مهمة للتنفيذ:\n\n${clientInfo}`;
    }
    if (action === "quantity_station") {
      return `بناءً على بيانات العميل، حلل الكمية المطلوبة واقترح أنسب محطة للتوريد مع الأسباب:\n\n${clientInfo}`;
    }
    if (action === "exec_notes") {
      return `بناءً على بيانات العميل وتاريخ الصبات، اكتب ملاحظات تنفيذ مهمة يجب مراعاتها:\n\n${clientInfo}`;
    }
    return `حلل بيانات هذا العميل:\n\n${clientInfo}`;
  }

  async function runAction(action: string) {
    setLoading(true);
    setResponse("");
    setActiveAction(action);
    setErrorDetail(null);

    const logs = await getCallLogs();
    const logsText = logs.length
      ? logs.map((l) => `- ${l.call_type}: ${l.notes || "بدون ملاحظات"} (${l.result}) - ${l.call_date}`).join("\n")
      : "لا يوجد سجل مكالمات";

    const clientInfo = `اسم العميل: ${client.name}
التصنيف الحالي: ${client.status}
الملاحظات: ${client.notes || "لا يوجد"}
الهاتف: ${client.phone || "غير محدد"}
المنطقة: ${client.area || "غير محددة"}
موعد الصبة المتوقع: ${client.expected_pour_date || "غير محدد"}
موعد المتابعة القادم: ${client.next_followup_date || "غير محدد"}
سجل المكالمات:
${logsText}`;

    const prompt = buildPrompt(action, clientInfo);

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { messages: [{ role: "user", content: prompt }] },
      });

      if (error) {
        console.error("AI invoke error:", error);
        setErrorDetail(error.message || JSON.stringify(error));
        setResponse(`⚠️ خطأ في الاتصال: ${error.message || "خطأ غير معروف"}`);
        return;
      }

      if (data?.error) {
        setErrorDetail(data.error);
        setResponse(`⚠️ ${data.error}`);
      } else {
        setResponse(data?.response || "لم يتم الحصول على رد");
      }
    } catch (e: any) {
      console.error("AI error:", e);
      setErrorDetail(e.message || String(e));
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
