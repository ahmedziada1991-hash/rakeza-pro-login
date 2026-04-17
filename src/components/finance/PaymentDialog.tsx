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
  Dialog, DialogContent, DialogHeader, DialogTitle,
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

const STATION_PAYMENT_METHODS = [
  { value: "cash", label: "كاش" },
  { value: "check", label: "شيك" },
  { value: "account_deduction", label: "خصم من حساب" },
  { value: "bank_transfer", label: "تحويل بنكي" },
];

const CEMENT_PAYMENT_METHODS = [
  { value: "cash", label: "كاش" },
  { value: "concrete_deduction", label: "خصم من خرسانة" },
  { value: "mixed", label: "مختلط (كاش + خصم)" },
];

const PAYMENT_TYPES = [
  { value: "client", label: "دفعة عميل" },
  { value: "station", label: "دفعة محطة" },
];

const STATION_TRANSACTION_TYPES = [
  { value: "payment", label: "دفع خرسانة" },
  { value: "cement_payment", label: "تحصيل أسمنت" },
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
    station_id: "",
    station_transaction_type: "payment",
    pour_order_id: "",
    amount: "",
    payment_method: "cash",
    payment_type: "client",
    notes: "",
    check_number: "",
    cash_amount: "",
    deduction_amount: "",
  });
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [checkDateCleared, setCheckDateCleared] = useState<Date | undefined>(undefined);

  const isStation = payForm.payment_type === "station";

  const { data: clients } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
      return data ?? [];
    },
  });

  const { data: stations } = useQuery({
    queryKey: ["stations-select"],
    queryFn: async () => {
      const { data } = await supabase.from("stations").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: clientOrders } = useQuery({
    queryKey: ["client-orders", payForm.client_id],
    enabled: !!payForm.client_id && !isStation,
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
      const amount = Math.abs(Number(payForm.amount) || 0);
      const isCheck = payForm.payment_method === "check";

      if (isStation) {
        // --- Station payment ---
        const stationId = Number(payForm.station_id);
        const selectedStation = (stations ?? []).find((s) => s.id === stationId);
        const stationName = selectedStation?.name || "محطة";
        const isCement = payForm.station_transaction_type === "cement_payment";
        const isMixed = isCement && payForm.payment_method === "mixed";
        const isConcreteDeduction = isCement && payForm.payment_method === "concrete_deduction";

        if (isMixed) {
          const cashAmt = Math.abs(Number(payForm.cash_amount) || 0);
          const deductAmt = Math.abs(Number(payForm.deduction_amount) || 0);

          // Cash record
          if (cashAmt > 0) {
            const { error } = await supabase.from("station_accounts" as any).insert({
              station_id: stationId,
              transaction_type: "cement_payment",
              amount: cashAmt,
              payment_method: "cash",
              notes: payForm.notes || null,
            });
            if (error) throw error;
          }

          // Concrete deduction record
          if (deductAmt > 0) {
            const { error } = await supabase.from("station_accounts" as any).insert({
              station_id: stationId,
              transaction_type: "cement_payment",
              amount: deductAmt,
              payment_method: "concrete_deduction",
              notes: payForm.notes ? `${payForm.notes} (خصم من خرسانة)` : "خصم من خرسانة",
            });
            if (error) throw error;

            // Deduct from concrete debt
            const { error: deductError } = await supabase.from("station_accounts" as any).insert({
              station_id: stationId,
              transaction_type: "payment",
              amount: deductAmt,
              payment_method: "concrete_deduction",
              notes: "خصم تلقائي مقابل تحصيل أسمنت",
            });
            if (deductError) throw deductError;
          }
        } else {
          const stationPayload: any = {
            station_id: stationId,
            transaction_type: payForm.station_transaction_type,
            amount,
            payment_method: payForm.payment_method,
            notes: payForm.notes || null,
          };

          if (isCheck) {
            stationPayload.check_number = payForm.check_number || null;
            stationPayload.check_date_cleared = checkDateCleared ? format(checkDateCleared, "yyyy-MM-dd") : null;
          }

          const { error } = await supabase.from("station_accounts" as any).insert(stationPayload);
          if (error) throw error;

          // If concrete deduction for cement, also deduct from concrete debt
          if (isConcreteDeduction) {
            const { error: deductError } = await supabase.from("station_accounts" as any).insert({
              station_id: stationId,
              transaction_type: "payment",
              amount,
              payment_method: "concrete_deduction",
              notes: "خصم تلقائي مقابل تحصيل أسمنت",
            });
            if (deductError) throw deductError;
          }
        }

        // Check notification for station
        if (isCheck && checkDateCleared && user?.id) {
          const checkNum = payForm.check_number || "—";
          await supabase.from("notifications").insert({
            user_id: user.id,
            type: "check_clearance",
            title: "موعد صرف شيك 📅",
            body: `شيك رقم ${checkNum} للمحطة ${stationName} بمبلغ ${amount.toLocaleString("ar-EG")} ج.م — موعد الصرف اليوم`,
            metadata: { station_id: stationId, check_number: checkNum, amount },
            is_read: false,
            scheduled_date: format(checkDateCleared, "yyyy-MM-dd"),
          } as any);
        }
      } else {
        // --- Client payment (existing logic) ---
        const clientId = Number(payForm.client_id);
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

        const accountPayload: any = {
          client_id: clientId,
          transaction_type: "payment",
          amount,
          payment_method: payForm.payment_method,
          notes: payForm.notes || null,
          pour_order_id: payForm.pour_order_id ? Number(payForm.pour_order_id) : null,
        };

        if (isCheck) {
          accountPayload.check_number = payForm.check_number || null;
          accountPayload.check_date_cleared = checkDateCleared ? format(checkDateCleared, "yyyy-MM-dd") : null;
        }

        await supabase.from("client_accounts" as any).insert(accountPayload);

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
      }
    },
    onSuccess: async () => {
      // Invalidate ALL finance-related queries and force immediate refetch of active ones
      const keys = [
        "finance-payments", "finance-client-summary", "finance-clients-tab",
        "finance-stations-tab", "finance-profits", "finance-cement-profit",
        "finance-suppliers-tab", "orders-list", "execution-orders",
        "client-statement-pours", "client-statement-payments", "client-statement-totals",
        "client-statement-pour-accounts", "station-statement", "station-cement-sales",
        "supplier-statement", "notifications", "cement-purchases",
        "cement-sales-station", "cement-stock-all", "cement-sales-linkage",
        "suppliers-list", "clients-names-profits", "stations-names-profits",
        "client-orders",
      ];
      await Promise.all(
        keys.map((k) =>
          queryClient.invalidateQueries({ queryKey: [k], refetchType: "active" })
        )
      );
      toast({ title: "تم تسجيل الدفعة بنجاح ✅" });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setPayForm({ client_id: "", station_id: "", station_transaction_type: "payment", pour_order_id: "", amount: "", payment_method: "cash", payment_type: "client", notes: "", check_number: "", cash_amount: "", deduction_amount: "" });
    setPaymentDate(new Date());
    setCheckDateCleared(undefined);
  }

  const setField = (k: string, v: string) => setPayForm((f) => ({ ...f, [k]: v }));

  // Sanitize numeric input: force positive (Math.abs) and reject non-numeric/negative signs
  const setAmountField = (k: "amount" | "cash_amount" | "deduction_amount", v: string) => {
    if (v === "") {
      setPayForm((f) => ({ ...f, [k]: "" }));
      return;
    }
    const n = Number(v);
    if (Number.isNaN(n)) return;
    const positive = Math.abs(n);
    setPayForm((f) => ({ ...f, [k]: String(positive) }));
  };

  function handleSubmit() {
    if (isStation) {
      if (!payForm.station_id) { toast({ title: "اختر المحطة", variant: "destructive" }); return; }
    } else {
      if (!payForm.client_id) { toast({ title: "اختر العميل", variant: "destructive" }); return; }
    }
    const isCementMixed = isStation && payForm.station_transaction_type === "cement_payment" && payForm.payment_method === "mixed";
    if (isCementMixed) {
      const cashAmt = Number(payForm.cash_amount) || 0;
      const deductAmt = Number(payForm.deduction_amount) || 0;
      if (cashAmt + deductAmt <= 0) { toast({ title: "أدخل المبالغ", variant: "destructive" }); return; }
    } else {
      if (!payForm.amount || Number(payForm.amount) <= 0) { toast({ title: "أدخل المبلغ", variant: "destructive" }); return; }
    }
    if (payForm.payment_method === "check" && !payForm.check_number) {
      toast({ title: "أدخل رقم الشيك", variant: "destructive" }); return;
    }
    // Validate payment doesn't exceed remaining for client payments with selected order
    if (!isStation && payForm.pour_order_id) {
      const selectedOrder = (clientOrders ?? []).find((o) => String(o.id) === payForm.pour_order_id);
      if (selectedOrder) {
        const remaining = Number(selectedOrder.amount_remaining) || 0;
        const amount = Number(payForm.amount) || 0;
        if (amount > remaining) {
          toast({ title: "المبلغ أكبر من المتبقي", description: `المتبقي على هذا الطلب: ${fmt(remaining)}`, variant: "destructive" });
          return;
        }
      }
    }
    paymentMutation.mutate();
  }

  const isCheck = payForm.payment_method === "check";
  const isCement = isStation && payForm.station_transaction_type === "cement_payment";
  const activeMethods = isCement ? CEMENT_PAYMENT_METHODS : isStation ? STATION_PAYMENT_METHODS : PAYMENT_METHODS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-cairo text-right">تسجيل دفعة جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Payment Type */}
          <div className="space-y-1.5">
            <Label className="font-cairo">نوع الدفعة</Label>
            <Select value={payForm.payment_type} onValueChange={(v) => { setField("payment_type", v); setField("client_id", ""); setField("station_id", ""); setField("pour_order_id", ""); setField("payment_method", "cash"); }}>
              <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="font-cairo">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isStation ? (
            <>
              {/* Station select */}
              <div className="space-y-1.5">
                <Label className="font-cairo">المحطة *</Label>
                <Select value={payForm.station_id} onValueChange={(v) => setField("station_id", v)}>
                  <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر المحطة" /></SelectTrigger>
                  <SelectContent>
                    {(stations ?? []).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)} className="font-cairo">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Station transaction type */}
              <div className="space-y-1.5">
                <Label className="font-cairo">نوع المعاملة *</Label>
                <Select value={payForm.station_transaction_type} onValueChange={(v) => { setField("station_transaction_type", v); setField("payment_method", "cash"); setField("cash_amount", ""); setField("deduction_amount", ""); }}>
                  <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATION_TRANSACTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="font-cairo">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground font-cairo">
                  {payForm.station_transaction_type === "payment" ? "ركيزة بتدفع للمحطة مقابل خرسانة" : "المحطة بتدفع لركيزة مقابل أسمنت"}
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Client select */}
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

              {/* Order select */}
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
            </>
          )}

          {/* Amount & Payment method */}
          <div className="grid grid-cols-2 gap-4">
            {payForm.payment_method !== "mixed" && (
              <div className="space-y-1.5">
                <Label className="font-cairo">المبلغ (ج.م) *</Label>
                <Input type="number" value={payForm.amount} onChange={(e) => setAmountField("amount", e.target.value)} className="font-cairo" min={0} step="any" inputMode="decimal" />
              </div>
            )}
            <div className={cn("space-y-1.5", payForm.payment_method === "mixed" && "col-span-2")}>
              <Label className="font-cairo">طريقة الدفع</Label>
              <Select value={payForm.payment_method} onValueChange={(v) => { setField("payment_method", v); if (v === "mixed") { setField("amount", ""); } }}>
                <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeMethods.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="font-cairo">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Mixed payment fields */}
          {payForm.payment_method === "mixed" && (
            <div className="grid grid-cols-2 gap-4 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
              <div className="space-y-1.5">
                <Label className="font-cairo text-xs">مبلغ كاش (ج.م)</Label>
                <Input type="number" value={payForm.cash_amount} onChange={(e) => setAmountField("cash_amount", e.target.value)} className="font-cairo h-8 text-sm" min={0} step="any" inputMode="decimal" placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo text-xs">خصم من خرسانة (ج.م)</Label>
                <Input type="number" value={payForm.deduction_amount} onChange={(e) => setAmountField("deduction_amount", e.target.value)} className="font-cairo h-8 text-sm" min={0} step="any" inputMode="decimal" placeholder="0" />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground font-cairo">
                الإجمالي: {fmt((Number(payForm.cash_amount) || 0) + (Number(payForm.deduction_amount) || 0))}
              </p>
            </div>
          )}

          {/* Check fields */}
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

          {/* Payment date */}
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

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="font-cairo">ملاحظات</Label>
            <Textarea value={payForm.notes} onChange={(e) => setField("notes", e.target.value)} className="font-cairo" rows={2} />
          </div>
        </div>
        <div className="shrink-0 pt-4 border-t space-y-2">
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
