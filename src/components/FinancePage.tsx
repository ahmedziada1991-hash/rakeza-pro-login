import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { CreditCard, Search, Banknote, TrendingUp, AlertCircle, Plus, CalendarIcon, Loader2 } from "lucide-react";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "كاش",
  bank_transfer: "تحويل بنكي",
  check: "شيك",
  online: "أونلاين",
};

const PAYMENT_METHODS = [
  { value: "cash", label: "كاش" },
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "check", label: "شيك" },
  { value: "online", label: "أونلاين" },
];

export function FinancePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    client_id: "",
    pour_order_id: "",
    amount: "",
    payment_method: "cash",
    notes: "",
  });
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());

  // Clients for select
  const { data: clients } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
      return data ?? [];
    },
  });

  // Orders for selected client
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

  // Payments with client name
  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ["finance-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, client_id, pour_order_id, amount, payment_method, payment_date, notes, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const clientIds = [...new Set(data.map((p) => p.client_id))];
      const { data: cls } = await supabase.from("clients").select("id, name").in("id", clientIds);
      const clientMap = new Map((cls ?? []).map((c) => [c.id, c.name]));

      return data.map((p) => ({ ...p, client_name: clientMap.get(p.client_id) ?? "—" }));
    },
  });

  // Client-level summary from pour_orders
  const { data: clientSummary, isLoading: loadingSummary } = useQuery({
    queryKey: ["finance-client-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pour_orders")
        .select("client_id, total_agreed_amount, amount_paid, amount_remaining");
      if (error) throw error;
      if (!data) return [];

      const map = new Map<number, { total: number; paid: number; remaining: number }>();
      data.forEach((o) => {
        const prev = map.get(o.client_id) ?? { total: 0, paid: 0, remaining: 0 };
        map.set(o.client_id, {
          total: prev.total + (Number(o.total_agreed_amount) || 0),
          paid: prev.paid + (Number(o.amount_paid) || 0),
          remaining: prev.remaining + (Number(o.amount_remaining) || 0),
        });
      });

      const clientIds = [...map.keys()];
      const { data: cls } = await supabase.from("clients").select("id, name").in("id", clientIds);
      const clientMap = new Map((cls ?? []).map((c) => [c.id, c.name]));

      return [...map.entries()]
        .map(([id, v]) => ({ id, name: clientMap.get(id) ?? "—", ...v }))
        .sort((a, b) => b.remaining - a.remaining);
    },
  });

  const isLoading = loadingPayments || loadingSummary;

  const totals = useMemo(() => {
    if (!clientSummary) return { total: 0, paid: 0, remaining: 0 };
    return clientSummary.reduce(
      (acc, c) => ({ total: acc.total + c.total, paid: acc.paid + c.paid, remaining: acc.remaining + c.remaining }),
      { total: 0, paid: 0, remaining: 0 },
    );
  }, [clientSummary]);

  const filteredPayments = (payments ?? []).filter(
    (p) =>
      p.client_name.includes(search) ||
      (p.notes ?? "").includes(search) ||
      String(p.pour_order_id).includes(search),
  );

  const summaryCards = [
    { title: "إجمالي الإيرادات", value: fmt(totals.total), icon: TrendingUp, color: "text-primary" },
    { title: "إجمالي المحصّل", value: fmt(totals.paid), icon: Banknote, color: "text-emerald-600" },
    { title: "إجمالي المتبقي", value: fmt(totals.remaining), icon: AlertCircle, color: "text-destructive" },
  ];

  // Create payment mutation
  const paymentMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(payForm.amount);
      const payload = {
        client_id: Number(payForm.client_id),
        pour_order_id: payForm.pour_order_id ? Number(payForm.pour_order_id) : null,
        amount,
        payment_method: payForm.payment_method,
        payment_date: paymentDate ? format(paymentDate, "yyyy-MM-dd") : null,
        notes: payForm.notes || null,
      };
      const { error } = await supabase.from("payments").insert(payload);
      if (error) throw error;

      // Update pour_order amounts if linked
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
      queryClient.invalidateQueries({ queryKey: ["orders-list"] });
      toast({ title: "تم تسجيل الدفعة بنجاح" });
      setDialogOpen(false);
      setPayForm({ client_id: "", pour_order_id: "", amount: "", payment_method: "cash", notes: "" });
      setPaymentDate(new Date());
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  function handlePaySubmit() {
    if (!payForm.client_id) { toast({ title: "اختر العميل", variant: "destructive" }); return; }
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast({ title: "أدخل المبلغ", variant: "destructive" }); return; }
    paymentMutation.mutate();
  }

  const setField = (k: string, v: string) => setPayForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-cairo font-bold text-foreground">الماليات</h2>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="font-cairo gap-1">
          <Plus className="h-4 w-4" />
          تسجيل دفعة
        </Button>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {summaryCards.map((c) => (
            <Card key={c.title} className="shadow-[var(--shadow-card)] border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${c.color}`}>
                  <c.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-cairo text-muted-foreground">{c.title}</p>
                  <p className={`text-lg font-cairo font-bold ${c.color}`}>{c.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Client Balance Table */}
      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="font-cairo text-base">أرصدة العملاء</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingSummary ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !clientSummary?.length ? (
            <p className="text-center text-muted-foreground font-cairo py-12">لا توجد بيانات</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-cairo text-right">العميل</TableHead>
                    <TableHead className="font-cairo text-right">إجمالي المتفق</TableHead>
                    <TableHead className="font-cairo text-right">المدفوع</TableHead>
                    <TableHead className="font-cairo text-right">المتبقي</TableHead>
                    <TableHead className="font-cairo text-right">نسبة التحصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientSummary.map((c) => {
                    const pct = c.total > 0 ? Math.round((c.paid / c.total) * 100) : 0;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-cairo font-medium">{c.name}</TableCell>
                        <TableCell className="font-cairo">{fmt(c.total)}</TableCell>
                        <TableCell className="font-cairo text-emerald-600">{fmt(c.paid)}</TableCell>
                        <TableCell className="font-cairo text-destructive font-semibold">{fmt(c.remaining)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-cairo text-muted-foreground">{pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments History */}
      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="font-cairo text-base">سجل المدفوعات</CardTitle>
            <div className="relative max-w-xs">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 font-cairo h-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingPayments ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !filteredPayments.length ? (
            <p className="text-center text-muted-foreground font-cairo py-12">لا توجد مدفوعات</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-cairo text-right">#</TableHead>
                    <TableHead className="font-cairo text-right">العميل</TableHead>
                    <TableHead className="font-cairo text-right">رقم الطلب</TableHead>
                    <TableHead className="font-cairo text-right">المبلغ</TableHead>
                    <TableHead className="font-cairo text-right">طريقة الدفع</TableHead>
                    <TableHead className="font-cairo text-right">التاريخ</TableHead>
                    <TableHead className="font-cairo text-right">ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-cairo text-muted-foreground">{p.id}</TableCell>
                      <TableCell className="font-cairo font-medium">{p.client_name}</TableCell>
                      <TableCell className="font-cairo">#{p.pour_order_id}</TableCell>
                      <TableCell className="font-cairo font-semibold text-emerald-600">{fmt(Number(p.amount))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-cairo text-[11px]">
                          {METHOD_LABELS[p.payment_method] ?? p.payment_method}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-cairo text-xs text-muted-foreground">
                        {p.payment_date ?? new Date(p.created_at).toLocaleDateString("ar-EG")}
                      </TableCell>
                      <TableCell className="font-cairo text-xs text-muted-foreground max-w-[200px] truncate">
                        {p.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo text-right">تسجيل دفعة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button onClick={handlePaySubmit} disabled={paymentMutation.isPending} className="font-cairo gap-1">
              {paymentMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {paymentMutation.isPending ? "جاري الحفظ..." : "تسجيل الدفعة"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="font-cairo">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
