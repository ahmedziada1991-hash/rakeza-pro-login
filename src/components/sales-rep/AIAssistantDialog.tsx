import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Sparkles, Phone, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Client {
  id: number;
  name: string;
  phone: string | null;
  status: string;
  notes: string | null;
}

interface AIAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
}

const AI_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;

async function streamAI(
  messages: { role: string; content: string }[],
  onDelta: (t: string) => void,
  onDone: () => void,
) {
  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok || !resp.body) throw new Error("فشل الاتصال بالمساعد الذكي");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { onDone(); return; }
      try {
        const p = JSON.parse(json);
        const c = p.choices?.[0]?.delta?.content;
        if (c) onDelta(c);
      } catch {}
    }
  }
  onDone();
}

export function AIAssistantDialog({ open, onOpenChange, client }: AIAssistantDialogProps) {
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
      ? logs.map((l) => `- ${l.call_type}: ${l.notes || "بدون ملاحظات"} (${l.result})`).join("\n")
      : "لا يوجد سجل مكالمات";

    const clientInfo = `اسم العميل: ${client.name}
التصنيف الحالي: ${client.status}
الملاحظات: ${client.notes || "لا يوجد"}
سجل المكالمات:
${logsText}`;

    let prompt = "";
    if (action === "classify") {
      prompt = `بناءً على بيانات العميل التالية، صنّف العميل (ساخن/دافئ/بارد) واشرح السبب:\n\n${clientInfo}`;
    } else if (action === "script") {
      prompt = `اكتب سكريبت مكالمة مبيعات مخصص لهذا العميل بالعربي:\n\n${clientInfo}\n\nالسكريبت يتضمن: مقدمة، أسئلة، عرض، ردود على اعتراضات، وختام.`;
    } else if (action === "next") {
      prompt = `بناءً على بيانات هذا العميل، إيه الخطوة التالية المقترحة؟\n\n${clientInfo}`;
    }

    let full = "";
    try {
      await streamAI(
        [{ role: "user", content: prompt }],
        (delta) => { full += delta; setResponse(full); },
        () => setLoading(false),
      );
    } catch {
      setResponse("⚠️ حدث خطأ أثناء الاتصال بالمساعد الذكي");
      setLoading(false);
    }
  }

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
          <Button
            size="sm"
            variant={activeAction === "classify" ? "default" : "outline"}
            className="font-cairo text-xs gap-1"
            onClick={() => runAction("classify")}
            disabled={loading}
          >
            <Sparkles className="h-3.5 w-3.5" />
            تصنيف تلقائي
          </Button>
          <Button
            size="sm"
            variant={activeAction === "script" ? "default" : "outline"}
            className="font-cairo text-xs gap-1"
            onClick={() => runAction("script")}
            disabled={loading}
          >
            <Phone className="h-3.5 w-3.5" />
            سكريبت مكالمة
          </Button>
          <Button
            size="sm"
            variant={activeAction === "next" ? "default" : "outline"}
            className="font-cairo text-xs gap-1"
            onClick={() => runAction("next")}
            disabled={loading}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            الخطوة التالية
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-[200px] max-h-[400px] border rounded-lg p-4 bg-muted/30" ref={scrollRef}>
          {loading && !response && (
            <div className="flex items-center gap-2 text-muted-foreground font-cairo">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحليل...
            </div>
          )}
          {response && (
            <div className="font-cairo text-sm whitespace-pre-wrap leading-relaxed text-foreground">
              {response}
              {loading && <span className="animate-pulse">▊</span>}
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
