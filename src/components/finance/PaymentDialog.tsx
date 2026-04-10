import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { CalendarIcon, Loader2 } from "lucide-react";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const PAYMENT_METHODS = [
  { value: "cash", label: "كاش" },
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "check", label: "شيك" },
  { value: "online", label: "أونلاين" },
];

const PAYMENT_TYPES = [
  { value: "client", label: "دفعة عميل" },
  { value: "station", label: "دفعة محطة" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaymentDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [payForm, setPayForm] = useState({
    client_id: "",
    pour_order_id: "",
    amount: "",
    payment_method: "cash",
    payment_type: "client",
    notes: "",
    check_number: "",
  });
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [checkDateCleared, setCheckDateCleared] = useState<Date | undefined>(undefined);

  const { data: clients } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
      return data ?? [];
    },
  });

  const { data: clientOrders } = useQuery({
    queryKey: ["client-orders", payForm.client_id],
    enabled: !!payForm.client_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pour_orders")
        .select("id, concrete_type, total_agreed_amount, amount_remaining")
        .eq("client_id", Number(payForm.client_id))
        .order("id", { ascending: false });
      return data ?? [];
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(payForm.amount);
      const isCheck = payForm.payment_method === "check";
      const clientId = Number(payForm.client_id);

      // Get client name for notification
      const selectedClientObj = (clients ?? []).find((c) => c.id === clientId);
      const clientName = selectedClientObj?.name || "عميل";

      const payload: any = {
        client_id: clientId,
        pour_order_id: payForm.pour_order_id ? Number(payForm.pour_order_id) : null,
        amount,
        payment_method: payForm.payment_method,
        payment_date: paymentDate ? format(paymentDate, "yyyy-MM-dd") : null,
        notes: payForm.notes || null,
      };
      const { error } = await supabase.from("payments").insert(payload);
      if (error) throw error;

      // Also insert into client_accounts for the statement view
      const accountPayload: any = {
        client_id: clientId,
        transaction_type: "payment",
        amount,
        payment_method: payForm.payment_method,
        notes: payForm.notes || null,
        pour_order_id: payForm.pour_order_id ? Number(payForm.pour_order_id) : null,
      };

      // Add check fields if payment method is check
      if (isCheck) {
        accountPayload.check_number = payForm.check_number || null;
        accountPayload.check_date_cleared = checkDateCleared ? format(checkDateCleared, "yyyy-MM-dd") : null;
      }

      await supabase.from("client_accounts" as any).insert(accountPayload);

      // Create scheduled notification for check clearance date
      if (isCheck && checkDateCleared && user?.id) {
        const checkNum = payForm.check_number || "—";
        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "check_clearance",
          title: "موعد صرف شيك 📅",
          body: `شيك رقم ${checkNum} للعميل ${clientName} بمبلغ ${amount.toLocaleString("ar-EG")} ج.م — موعد الصرف اليوم`,
          metadata: { client_id: clientId, check_number: checkNum, amount },
          is_read: false,
          scheduled_date: format(checkDateCleared, "yyyy-MM-dd"),
        } as any);
      }

      if (payForm.pour_order_id) {
        const orderId = Number(payForm.pour_order_id);
        const { data: order } = await supabase.from("pour_orders").select("amount_paid, amount_remaining").eq("id", orderId).single();
        if (order) {
          await supabase.from("pour_orders").update({
            amount_paid: (Number(order.amount_paid) || 0) + amount,
            amount_remaining: Math.max(0, (Number(order.amount_remaining) || 0) - amount),
          }).eq("id", orderId);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-payments"] });
      queryClient.invalidateQueries({ queryKey: ["finance-client-summary"] });
      queryClient.invalidateQueries({ queryKey: ["finance-clients-tab"] });
      queryClient.invalidateQueries({ queryKey: ["finance-stations-tab"] });
      queryClient.invalidateQueries({ queryKey: ["finance-profits"] });
      queryClient.invalidateQueries({ queryKey: ["orders-list"] });
      queryClient.invalidateQueries({ queryKey: ["execution-orders"] });
      queryClient.invalidateQueries({ queryKey: ["client-statement-pours"] });
      queryClient.invalidateQueries({ queryKey: ["client-statement-payments"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "تم تسجيل الدفعة بنجاح ✅" });
      onOpenChange(false);
      setPayForm({ client_id: "", pour_order_id: "", amount: "", payment_method: "cash", payment_type: "client", notes: "", check_number: "" });
      setPaymentDate(new Date());
      setCheckDateCleared(undefined);
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const setField = (k: string, v: string) => setPayForm((f) => ({ ...f, [k]: v }));

  function handleSubmit() {
    if (!payForm.client_id) { toast({ title: "اختر العميل", variant: "destructive" }); return; }
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast({ title: "أدخل المبلغ", variant: "destructive" }); return; }
    if (payForm.payment_method === "check" && !payForm.check_number) {
      toast({ title: "أدخل رقم الشيك", variant: "destructive" }); return;
    }
    paymentMutation.mutate();
  }

  const isCheck = payForm.payment_method === "check";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-cairo text-right">تسجيل دفعة جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="font-cairo">نوع الدفعة</Label>
            <Select value={payForm.payment_type} onValueChange={(v) => setField("payment_type", v)}>
              <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="font-cairo">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-cairo">العميل *</Label>
            <Select value={payForm.client_id} onValueChange={(v) => { setField("client_id", v); setField("pour_order_id", ""); }}>
              <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
              <SelectContent>
                {(clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)} className="font-cairo">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-cairo">الطلب (اختياري)</Label>
            <Select value={payForm.pour_order_id} onValueChange={(v) => setField("pour_order_id", v)} disabled={!payForm.client_id}>
              <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر الطلب" /></SelectTrigger>
              <SelectContent>
                {(clientOrders ?? []).map((o) => (
                  <SelectItem key={o.id} value={String(o.id)} className="font-cairo">
                    #{o.id} - {o.concrete_type ?? ""} (متبقي: {fmt(Number(o.amount_remaining) || 0)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-cairo">المبلغ (ج.م) *</Label>
              <Input type="number" value={payForm.amount} onChange={(e) => setField("amount", e.target.value)} className="font-cairo" min={0} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">طريقة الدفع</Label>
              <Select value={payForm.payment_method} onValueChange={(v) => setField("payment_method", v)}>
                <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="font-cairo">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Check-specific fields */}
          {isCheck && (
            <div className="grid grid-cols-2 gap-4 p-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30">
              <div className="space-y-1.5">
                <Label className="font-cairo text-xs">رقم الشيك *</Label>
                <Input
                  value={payForm.check_number}
                  onChange={(e) => setField("check_number", e.target.value)}
                  className="font-cairo h-8 text-sm"
                  placeholder="رقم الشيك"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo text-xs">تاريخ صرف الشيك</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start font-cairo gap-2 h-8 text-sm", !checkDateCleared && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {checkDateCleared ? format(checkDateCleared, "yyyy/MM/dd") : "اختر التاريخ"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={checkDateCleared} onSelect={setCheckDateCleared} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="font-cairo">تاريخ الدفع</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start font-cairo gap-2", !paymentDate && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4" />
                  {paymentDate ? format(paymentDate, "yyyy/MM/dd") : "اختر التاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="font-cairo">ملاحظات</Label>
            <Textarea value={payForm.notes} onChange={(e) => setField("notes", e.target.value)} className="font-cairo" rows={2} />
          </div>
        </div>
        <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t space-y-2">
          <Button
            onClick={handleSubmit}
            disabled={paymentMutation.isPending}
            className="w-full font-cairo gap-2 text-white font-bold text-lg"
            style={{ background: "#28A745", padding: "16px" }}
          >
            {paymentMutation.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            {paymentMutation.isPending ? "جاري الحفظ..." : "تسجيل الدفعة ✅"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full font-cairo">إلغاء</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
