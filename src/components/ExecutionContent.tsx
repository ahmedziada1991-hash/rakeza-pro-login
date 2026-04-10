import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Phone, MessageCircle, Play, CheckCircle2, Banknote,
  ClipboardList, Clock, Loader2, StickyNote, Building2, User, Users
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  scheduled: { label: "مجدولة", color: "bg-chart-1/15 text-chart-1 border-chart-1/30", icon: Clock },
  in_progress: { label: "جارية", color: "bg-chart-4/15 text-chart-4 border-chart-4/30", icon: Loader2 },
  done: { label: "منتهية", color: "bg-chart-2/15 text-chart-2 border-chart-2/30", icon: CheckCircle2 },
};

const PAYMENT_METHODS = [
  { value: "cash", label: "كاش" },
  { value: "check", label: "شيك" },
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "cement", label: "أسمنت" },
];

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

export function ExecutionContent() {
  const queryClient = useQueryClient();
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cash", notes: "" });
  const [noteDialog, setNoteDialog] = useState<any>(null);
  const [noteText, setNoteText] = useState("");

  const today = format(new Date(), "yyyy-MM-dd");

  // Fetch today's pour orders
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["execution-orders", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pour_orders")
        .select("*")
        .eq("scheduled_date", today)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch clients for mapping
  const clientIds = [...new Set(orders.map((o: any) => o.client_id).filter(Boolean))];
  const { data: clients = [] } = useQuery({
    queryKey: ["execution-clients", clientIds],
    queryFn: async () => {
      if (!clientIds.length) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone, status, assigned_to, salesperson_name")
        .in("id", clientIds);
      if (error) throw error;
      return data || [];
    },
    enabled: clientIds.length > 0,
  });

  // Fetch follow-up user names for assigned_to
  const assignedIds = [...new Set(clients.filter((c: any) => c.assigned_to).map((c: any) => c.assigned_to))];
  const { data: followerProfiles = [] } = useQuery({
    queryKey: ["follower-profiles", assignedIds],
    queryFn: async () => {
      if (!assignedIds.length) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", assignedIds);
      if (error) throw error;
      return data || [];
    },
    enabled: assignedIds.length > 0,
  });

  const getClient = (id: number) => clients.find((c: any) => c.id === id);
  const getFollowerName = (userId: string) =>
    followerProfiles.find((p: any) => p.id === userId)?.full_name || "";

  // Start pour
  const startPour = useMutation({
    mutationFn: async (orderId: number) => {
      const { error } = await supabase
        .from("pour_orders")
        .update({ status: "in_progress" } as any)
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["execution-orders"] });
      toast({ title: "تم", description: "تم تسجيل بداية الصبة" });
    },
  });

  // End pour
  const endPour = useMutation({
    mutationFn: async (orderId: number) => {
      const { error } = await supabase
        .from("pour_orders")
        .update({ status: "done" } as any)
        .eq("id", orderId);
      if (error) throw error;

      // Insert notification for admin
      await supabase.from("notifications").insert({
        title: "صبة مكتملة",
        message: `تم إتمام صبة رقم #${orderId}`,
        type: "pour_complete",
        is_read: false,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["execution-orders"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "تم", description: "تم تسجيل انتهاء الصبة وتحديث الماليات" });
    },
  });

  // Register payment
  const registerPayment = useMutation({
    mutationFn: async ({ orderId, amount, method, notes }: { orderId: number; amount: number; method: string; notes: string }) => {
      // Get order details
      const { data: order, error: oErr } = await supabase
        .from("pour_orders")
        .select("client_id, amount_paid, amount_remaining")
        .eq("id", orderId)
        .single();
      if (oErr) throw oErr;

      // Insert payment
      const { error: pErr } = await supabase.from("payments").insert({
        client_id: order.client_id,
        pour_order_id: orderId,
        amount,
        payment_method: method,
        notes,
        payment_date: new Date().toISOString().split("T")[0],
      } as any);
      if (pErr) throw pErr;

      // Update order financials
      const newPaid = (order.amount_paid || 0) + amount;
      const newRemaining = (order.amount_remaining || 0) - amount;
      const { error: uErr } = await supabase
        .from("pour_orders")
        .update({ amount_paid: newPaid, amount_remaining: Math.max(0, newRemaining) } as any)
        .eq("id", orderId);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["execution-orders"] });
      setPayDialog(null);
      setPayForm({ amount: "", method: "cash", notes: "" });
      toast({ title: "تم التحصيل", description: "تم تسجيل المبلغ بنجاح" });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في تسجيل التحصيل", variant: "destructive" });
    },
  });

  // Save notes
  const saveNotes = useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: number; notes: string }) => {
      const { error } = await supabase
        .from("pour_orders")
        .update({ notes } as any)
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["execution-orders"] });
      setNoteDialog(null);
      setNoteText("");
      toast({ title: "تم", description: "تم حفظ الملاحظات" });
    },
  });

  const stats = {
    total: orders.length,
    scheduled: orders.filter((o: any) => o.status === "scheduled" || o.status === "pending").length,
    inProgress: orders.filter((o: any) => o.status === "in_progress").length,
    done: orders.filter((o: any) => o.status === "done").length,
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-cairo font-bold text-foreground">صبات اليوم</h2>
        <p className="text-sm text-muted-foreground font-cairo">
          {format(new Date(), "EEEE d MMMM yyyy", { locale: ar })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <ClipboardList className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground font-cairo">إجمالي الصبات</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 text-chart-1 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{stats.scheduled}</p>
            <p className="text-xs text-muted-foreground font-cairo">مجدولة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Loader2 className="h-5 w-5 text-chart-4 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{stats.inProgress}</p>
            <p className="text-xs text-muted-foreground font-cairo">جارية</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 text-chart-2 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{stats.done}</p>
            <p className="text-xs text-muted-foreground font-cairo">منتهية</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders list */}
      {isLoading ? (
        <div className="text-center p-8 text-muted-foreground font-cairo">جاري التحميل...</div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-cairo">لا توجد صبات مجدولة اليوم</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order: any) => {
            const client = getClient(order.client_id);
            const status = STATUS_MAP[order.status] || STATUS_MAP.scheduled;
            const isFromFollowup = client?.status === "execution" && client?.assigned_to;

            return (
              <Card key={order.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-cairo font-bold text-foreground">
                          {client?.name || `عميل #${order.client_id}`}
                        </span>
                      </div>
                      {client?.phone && (
                        <p className="text-xs text-muted-foreground" dir="ltr">{client.phone}</p>
                      )}
                    </div>
                    <Badge className={cn("font-cairo", status.color)}>
                      {status.label}
                    </Badge>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground font-cairo text-xs">المحطة</p>
                      <p className="font-cairo flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {order.station_name || "—"}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground font-cairo text-xs">الكمية</p>
                      <p className="font-cairo font-semibold">{order.quantity_m3} م³</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground font-cairo text-xs">نوع الخرسانة</p>
                      <p className="font-cairo">{order.concrete_type || "—"}</p>
                    </div>
                    {order.pour_method && (
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground font-cairo text-xs">طريقة الصب</p>
                        <p className="font-cairo">{order.pour_method}</p>
                      </div>
                    )}
                    {order.cement_content && (
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground font-cairo text-xs">المحتوى</p>
                        <p className="font-cairo">{order.cement_content}</p>
                      </div>
                    )}
                    {order.strength && (
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground font-cairo text-xs">الجهد</p>
                        <p className="font-cairo">{order.strength}</p>
                      </div>
                    )}
                  </div>

                  {/* Financial info */}
                  <div className="flex flex-wrap gap-3 text-xs font-cairo bg-muted/50 rounded-md p-2">
                    <span>الإجمالي: <strong>{fmt(order.total_agreed_amount || 0)}</strong></span>
                    <span>المحصّل: <strong className="text-chart-2">{fmt(order.amount_paid || 0)}</strong></span>
                    <span>المتبقي: <strong className="text-destructive">{fmt(order.amount_remaining || 0)}</strong></span>
                  </div>

                  {/* Salesperson / follower info */}
                  <div className="flex flex-wrap gap-3 text-xs">
                    {client?.salesperson_name && (
                      <span className="font-cairo text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> البائع: {client.salesperson_name}
                      </span>
                    )}
                    {isFromFollowup && (
                      <span className="font-cairo text-primary flex items-center gap-1">
                        <Users className="h-3 w-3" /> المتابع: {getFollowerName(client.assigned_to)}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                    {client?.phone && (
                      <>
                        <Button size="sm" variant="outline" className="font-cairo text-xs gap-1" asChild>
                          <a href={`tel:${client.phone}`}>
                            <Phone className="h-3 w-3" /> اتصال
                          </a>
                        </Button>
                        <Button size="sm" variant="outline" className="font-cairo text-xs gap-1" asChild>
                          <a href={`https://wa.me/${client.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener">
                            <MessageCircle className="h-3 w-3" /> واتساب
                          </a>
                        </Button>
                      </>
                    )}

                    {(order.status === "scheduled" || order.status === "pending") && (
                      <Button
                        size="sm"
                        className="font-cairo text-xs gap-1"
                        onClick={() => startPour.mutate(order.id)}
                        disabled={startPour.isPending}
                      >
                        <Play className="h-3 w-3" /> بداية الصبة
                      </Button>
                    )}

                    {order.status === "in_progress" && (
                      <Button
                        size="sm"
                        className="font-cairo text-xs gap-1 bg-chart-2 hover:bg-chart-2/90"
                        onClick={() => endPour.mutate(order.id)}
                        disabled={endPour.isPending}
                      >
                        <CheckCircle2 className="h-3 w-3" /> انتهاء الصبة
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="font-cairo text-xs gap-1"
                      onClick={() => { setPayDialog(order); setPayForm({ amount: "", method: "cash", notes: "" }); }}
                    >
                      <Banknote className="h-3 w-3" /> تحصيل
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="font-cairo text-xs gap-1"
                      onClick={() => { setNoteDialog(order); setNoteText(order.notes || ""); }}
                    >
                      <StickyNote className="h-3 w-3" /> ملاحظات
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Payment Dialog */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-cairo">تسجيل تحصيل</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="font-cairo">المبلغ</Label>
              <Input
                type="number"
                value={payForm.amount}
                onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                className="font-cairo"
              />
            </div>
            <div>
              <Label className="font-cairo">طريقة الدفع</Label>
              <Select value={payForm.method} onValueChange={(v) => setPayForm((f) => ({ ...f, method: v }))}>
                <SelectTrigger className="font-cairo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="font-cairo">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea
                value={payForm.notes}
                onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                className="font-cairo"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="font-cairo"
              disabled={!payForm.amount || registerPayment.isPending}
              onClick={() => {
                if (payDialog) {
                  registerPayment.mutate({
                    orderId: payDialog.id,
                    amount: parseFloat(payForm.amount),
                    method: payForm.method,
                    notes: payForm.notes,
                  });
                }
              }}
            >
              {registerPayment.isPending ? "جاري الحفظ..." : "حفظ التحصيل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={!!noteDialog} onOpenChange={(o) => !o && setNoteDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-cairo">ملاحظات الصبة</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="font-cairo min-h-[100px]"
            placeholder="أدخل الملاحظات هنا..."
          />
          <DialogFooter>
            <Button
              className="font-cairo"
              disabled={saveNotes.isPending}
              onClick={() => {
                if (noteDialog) {
                  saveNotes.mutate({ orderId: noteDialog.id, notes: noteText });
                }
              }}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
