import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { CalendarIcon, FileText, Loader2 } from "lucide-react";

const CONCRETE_TYPES = ["B200", "B250", "B300", "B350", "B400", "B450", "B500"];

const STATUS_OPTIONS = [
  { value: "pending", label: "في الانتظار" },
  { value: "scheduled", label: "مجدول" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "done", label: "مكتمل" },
  { value: "cancelled", label: "ملغي" },
];

export function OrderForm({ orderId }: { orderId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(orderId);
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [form, setForm] = useState({
    client_id: "",
    station_name: "",
    concrete_type: "",
    quantity_m3: "",
    agreed_price_per_m3: "",
    purchase_price: "",
    cement_content: "",
    address: "",
    status: "pending",
    notes: "",
    special_conditions: "",
    aggregate_type: "",
    special_additives: "",
  });
  const [loaded, setLoaded] = useState(false);

  // Load existing order for edit
  const { data: existingOrder } = useQuery({
    queryKey: ["order-edit", orderId],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pour_orders")
        .select("*")
        .eq("id", Number(orderId))
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Populate form when order loads
  if (existingOrder && !loaded) {
    setForm({
      client_id: String(existingOrder.client_id ?? ""),
      station_name: existingOrder.station_name ?? "",
      concrete_type: existingOrder.concrete_type ?? "",
      quantity_m3: String(existingOrder.quantity_m3 ?? ""),
      agreed_price_per_m3: String(existingOrder.agreed_price_per_m3 ?? ""),
      purchase_price: String((existingOrder as any).purchase_price ?? ""),
      cement_content: String(existingOrder.cement_content ?? ""),
      address: existingOrder.address ?? "",
      status: existingOrder.status ?? "pending",
      notes: existingOrder.notes ?? "",
      special_conditions: existingOrder.special_conditions ?? "",
      aggregate_type: existingOrder.aggregate_type ?? "",
      special_additives: existingOrder.special_additives ?? "",
    });
    if (existingOrder.scheduled_date) {
      setScheduledDate(new Date(existingOrder.scheduled_date));
    }
    setLoaded(true);
  }

  const { data: clients } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      return data ?? [];
    },
  });

  const { data: stations } = useQuery({
    queryKey: ["stations-select"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stations")
        .select("id, name")
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const quantity = Number(form.quantity_m3) || 0;
  const price = Number(form.agreed_price_per_m3) || 0;
  const total = quantity * price;

  const purchasePrice = Number(form.purchase_price) || 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const selectedStation = stations?.find((s) => s.name === form.station_name);
      const stationId = selectedStation?.id ?? null;
      const clientName = clients?.find((c) => String(c.id) === form.client_id)?.name ?? "";

      const payload = {
        client_id: Number(form.client_id),
        station_name: form.station_name || null,
        station_id: stationId,
        concrete_type: form.concrete_type || null,
        quantity_m3: quantity || null,
        agreed_quantity_m3: quantity || null,
        agreed_price_per_m3: price || null,
        total_agreed_amount: total || null,
        purchase_price: purchasePrice || null,
        cement_content: Number(form.cement_content) || null,
        address: form.address || null,
        status: form.status,
        notes: form.notes || null,
        special_conditions: form.special_conditions || null,
        aggregate_type: form.aggregate_type || null,
        special_additives: form.special_additives || null,
        scheduled_date: scheduledDate ? format(scheduledDate, "yyyy-MM-dd") : null,
        created_by_role: "admin",
      };
      if (isEdit) {
        const { error } = await supabase.from("pour_orders").update(payload).eq("id", Number(orderId));
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("pour_orders").insert({ ...payload, amount_paid: 0, amount_remaining: total || null }).select("id").single();
        if (error) throw error;

        const dateStr = scheduledDate ? format(scheduledDate, "yyyy-MM-dd") : null;

        // Insert into client_accounts with duplicate protection
        if (Number(form.client_id) && quantity > 0) {
          const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
          const { data: existing } = await supabase
            .from("client_accounts")
            .select("id")
            .eq("client_id", Number(form.client_id))
            .eq("transaction_type", "pour")
            .eq("amount", total)
            .gte("created_at", fiveSecondsAgo)
            .limit(1);

          if (!existing || existing.length === 0) {
            const { error: clientErr } = await supabase.from("client_accounts").insert({
              client_id: Number(form.client_id),
              client_name: clientName,
              transaction_type: "pour",
              amount: total,
              station_name: form.station_name || null,
              pour_order_id: data.id,
              notes: `صبة ${form.concrete_type} - ${quantity} م³`,
            });
            if (clientErr) {
              console.error("client_accounts insert error:", clientErr);
              toast({ title: "تحذير", description: "تم إنشاء الطلب لكن فشل تسجيله في حساب العميل", variant: "destructive" });
            }
          } else {
            console.warn("Duplicate client_accounts entry prevented");
          }
        }

        // Insert into station_accounts if station selected
        if (stationId && quantity > 0) {
          const stationAmount = purchasePrice > 0 ? quantity * purchasePrice : total;
          const { error: stationErr } = await supabase.from("station_accounts").insert({
            station_id: stationId,
            station_name: form.station_name,
            transaction_type: "concrete",
            amount: stationAmount,
            pour_order_id: data.id,
            notes: `صبة ${form.concrete_type} - عميل: ${clientName}`,
          });
          if (stationErr) {
            console.error("station_accounts insert error:", stationErr);
            toast({ title: "تحذير", description: "تم إنشاء الطلب لكن فشل تسجيله في حساب المحطة", variant: "destructive" });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders-stats"] });
      queryClient.invalidateQueries({ queryKey: ["recent-orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-list"] });
      toast({ title: isEdit ? "تم تحديث الطلب بنجاح" : "تم إنشاء الطلب بنجاح" });
      navigate("/dashboard/admin/orders");
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id) {
      toast({ title: "اختر العميل", variant: "destructive" });
      return;
    }
    if (!form.concrete_type) {
      toast({ title: "اختر نوع الخرسانة", variant: "destructive" });
      return;
    }
    if (!quantity) {
      toast({ title: "أدخل الكمية", variant: "destructive" });
      return;
    }
    mutation.mutate();
  }

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-cairo font-bold text-foreground">{isEdit ? "تعديل طلب الصب" : "إنشاء طلب صب جديد"}</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="shadow-[var(--shadow-card)] border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-cairo text-base">بيانات الطلب</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Client & Station */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-cairo">العميل *</Label>
                <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
                  <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>
                    {(clients ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)} className="font-cairo">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">المحطة</Label>
                <Select value={form.station_name} onValueChange={(v) => set("station_name", v)}>
                  <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر المحطة" /></SelectTrigger>
                  <SelectContent>
                    {(stations ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.name} className="font-cairo">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Concrete Type & Quantity */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="font-cairo">نوع الخرسانة *</Label>
                <Select value={form.concrete_type} onValueChange={(v) => set("concrete_type", v)}>
                  <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                  <SelectContent>
                    {CONCRETE_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="font-cairo">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">الكمية (م³) *</Label>
                <Input
                  type="number"
                  value={form.quantity_m3}
                  onChange={(e) => set("quantity_m3", e.target.value)}
                  className="font-cairo"
                  min={0}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">محتوى الأسمنت (كجم)</Label>
                <Input
                  type="number"
                  value={form.cement_content}
                  onChange={(e) => set("cement_content", e.target.value)}
                  className="font-cairo"
                  min={0}
                />
              </div>
            </div>

            {/* Price & Total */}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-cairo">سعر المتر (ج.م) </Label>
                <Input
                  type="number"
                  value={form.agreed_price_per_m3}
                  onChange={(e) => set("agreed_price_per_m3", e.target.value)}
                  className="font-cairo"
                  min={0}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">سعر الشراء من المحطة (ج.م)</Label>
                <Input
                  type="number"
                  value={form.purchase_price}
                  onChange={(e) => set("purchase_price", e.target.value)}
                  className="font-cairo"
                  min={0}
                  placeholder="سري - للأدمن فقط"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-cairo">الإجمالي (ج.م)</Label>
                <Input
                  value={total ? total.toLocaleString("ar-EG") : "—"}
                  className="font-cairo bg-muted"
                  disabled
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">الحالة</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="font-cairo">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date & Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-cairo">تاريخ الصب</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start font-cairo gap-2", !scheduledDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="h-4 w-4" />
                      {scheduledDate ? format(scheduledDate, "yyyy/MM/dd") : "اختر التاريخ"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduledDate}
                      onSelect={setScheduledDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">العنوان / الموقع</Label>
                <Input
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  className="font-cairo"
                  placeholder="عنوان موقع الصب"
                />
              </div>
            </div>

            {/* Extra fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-cairo">نوع الركام</Label>
                <Input
                  value={form.aggregate_type}
                  onChange={(e) => set("aggregate_type", e.target.value)}
                  className="font-cairo"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">إضافات خاصة</Label>
                <Input
                  value={form.special_additives}
                  onChange={(e) => set("special_additives", e.target.value)}
                  className="font-cairo"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-cairo">شروط خاصة</Label>
                <Textarea
                  value={form.special_conditions}
                  onChange={(e) => set("special_conditions", e.target.value)}
                  className="font-cairo"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">ملاحظات</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  className="font-cairo"
                  rows={3}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/dashboard/admin/orders")}
                className="font-cairo"
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="font-cairo gap-1">
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {mutation.isPending ? "جاري الحفظ..." : isEdit ? "حفظ التعديلات" : "إنشاء الطلب"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
