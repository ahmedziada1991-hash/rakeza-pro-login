import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bot, Send, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AISearchBarProps {
  role?: string;
}

export function AISearchBar({ role = "sales" }: AISearchBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (answerRef.current) answerRef.current.scrollTop = answerRef.current.scrollHeight;
  }, [answer]);

  async function fetchContext() {
    const [{ data: clients }, { data: logs }] = await Promise.all([
      supabase.from("clients").select("id, name, status, notes, phone").limit(50),
      supabase.from("call_logs").select("client_id, call_type, result, notes, call_date").order("call_date", { ascending: false }).limit(30),
    ]);

    const clientSummary = (clients ?? []).map(c => `${c.name} (${c.status})${c.notes ? ` - ${c.notes}` : ""}`).join("\n");
    const logSummary = (logs ?? []).map(l => {
      const cn = (clients ?? []).find(c => c.id === l.client_id)?.name || l.client_id;
      return `${cn}: ${l.call_type} - ${l.result} (${l.call_date})`;
    }).join("\n");

    return `بيانات العملاء:\n${clientSummary}\n\nسجل المكالمات:\n${logSummary}`;
  }

  async function handleSubmit() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setAnswer("");

    const context = await fetchContext();
    const clientData = `${context}\n\nالسؤال: ${query}`;

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { action: "classify", role, clientData },
      });

      if (error) throw error;

      if (data?.error) {
        setAnswer(`⚠️ ${data.error}`);
      } else {
        setAnswer(data?.response || "لم يتم الحصول على رد");
      }
    } catch {
      setAnswer("⚠️ حدث خطأ أثناء الاتصال بالمساعد الذكي");
    }
    setLoading(false);
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="font-cairo gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Bot className="h-4 w-4" />
        مساعد AI
      </Button>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary shrink-0" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="اسأل عن عملائك... مثلاً: مين أحسن عميل؟"
          className="font-cairo text-sm h-8"
          dir="rtl"
          autoFocus
        />
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleSubmit} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setOpen(false); setAnswer(""); setQuery(""); }}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {(answer || loading) && (
        <div ref={answerRef} className="max-h-[200px] overflow-y-auto bg-muted/30 rounded p-3">
          {loading && !answer && (
            <div className="flex items-center gap-2 text-muted-foreground font-cairo text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              جاري التحليل...
            </div>
          )}
          {answer && (
            <p className="font-cairo text-sm whitespace-pre-wrap leading-relaxed text-foreground">
              {answer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
