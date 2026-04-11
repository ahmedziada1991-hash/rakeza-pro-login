import { useState } from "react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Search, ChevronLeft, Plus, CalendarIcon, Loader2, Send, Pencil, Trash2 } from "lucide-react";
import { generateStatementPDF, sendStatementWhatsApp } from "@/lib/statement-pdf";
import { useAuth } from "@/contexts/AuthContext";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "كاش", bank_transfer: "تحويل بنكي", check: "شيك",
};

interface SupplierSummary {
  id: number;
  name: string;
  phone: string | null;
  totalPurchases: number;
  totalPaid: number;
  remaining: number;
}

export function SuppliersTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierSummary | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", address: "" });
  const [payForm, setPayForm] = useState({ supplier_id: "", amount: "", payment_method: "cash", notes: "" });
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["finance-suppliers-tab"],
    queryFn: async () => {
      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("id, name, phone")
        .eq("status", "active")
        .order("name");

      const { data: txns } = await supabase
        .from("supplier_accounts" as any)
        .select("supplier_id, transaction_type, total_amount")
        .order("created_at", { ascending: false });

      const map = new Map<number, SupplierSummary>();
      (suppliers ?? []).forEach((s: any) => {
        map.set(s.id, {
          id: s.id, name: s.name, phone: s.phone,
          totalPurchases: 0, totalPaid: 0, remaining: 0,
        });
      });

      (txns ?? []).forEach((t: any) => {
        const acc = map.get(t.supplier_id);
        if (!acc) return;
        const amt = Number(t.total_amount) || 0;
        if (t.transaction_type === "purchase" || t.transaction_type === "شراء" || t.transaction_type === "inbound") {
          acc.totalPurchases += amt;
        } else if (t.transaction_type === "payment" || t.transaction_type === "دفعة") {
          acc.totalPaid += amt;
        }
      });

      map.forEach((acc) => { acc.remaining = acc.totalPurchases - acc.totalPaid; });
      return [...map.values()].sort((a, b) => b.remaining - a.remaining);
    },
  });

  const { data: statement, isLoading: loadingStatement } = useQuery({
    queryKey: ["supplier-statement", selectedSupplier?.id],
    enabled: !!selectedSupplier,
    queryFn: async () => {
      const { data } = await supabase
        .from("supplier_accounts" as any)
        .select("*")
        .eq("supplier_id", selectedSupplier!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: suppliersList } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").eq("status", "active").order("name");
      return data ?? [];
    },
  });

  const addSupplierMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("suppliers").insert({
        name: supplierForm.name,
        phone: supplierForm.phone || null,
        address: supplierForm.address || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-suppliers-tab"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-list"] });
      toast({ title: "تم إضافة المورد بنجاح" });
      setAddDialogOpen(false);
      setSupplierForm({ name: "", phone: "", address: "" });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("supplier_payments").insert({
        supplier_id: Number(payForm.supplier_id),
        amount: Number(payForm.amount),
        payment_method: payForm.payment_method,
        payment_date: paymentDate ? format(paymentDate, "yyyy-MM-dd") : null,
        notes: payForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-suppliers-tab"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-statement"] });
      toast({ title: "تم تسجيل الدفعة بنجاح" });
      setPayDialogOpen(false);
      setPayForm({ supplier_id: "", amount: "", payment_method: "cash", notes: "" });
      setPaymentDate(new Date());
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const filtered = (accounts ?? []).filter((a) => a.name.includes(search));

  if (isLoading) {
    return <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  const purchases = (statement ?? []).filter((t: any) => t.transaction_type === "purchase" || t.transaction_type === "شراء" || t.transaction_type === "inbound");
  const payments = (statement ?? []).filter((t: any) => t.transaction_type === "payment" || t.transaction_type === "دفعة");

  // Full-page supplier statement
  if (selectedSupplier) {
    const todayStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

    return (
      <div className="min-h-screen -m-4 sm:-m-6" style={{ background: "#F8F9FA" }}>
        {/* Header */}
        <div className="w-full px-4 py-4" style={{ background: "#1B3A6B" }}>
          <div className="flex items-start justify-between">
            <div className="text-left">
              <p className="font-cairo text-white/80 text-xs">{todayStr}</p>
              <p className="font-cairo text-white font-bold text-sm mt-1">{selectedSupplier.name}</p>
            </div>
            <div className="text-right">
              <h1 className="font-cairo text-white font-bold text-lg">شركة ركيزة</h1>
              <p className="font-cairo text-white/80 text-xs">كشف حساب مورد</p>
            </div>
          </div>
        </div>
        <div className="w-full h-1" style={{ background: "#F5A623" }} />

        <div className="p-4 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg p-3 text-center" style={{ background: "white", border: "1px solid #eee" }}>
              <p className="font-cairo text-[10px] text-gray-500">إجمالي المشتريات</p>
              <p className="font-cairo font-bold text-sm" style={{ color: "#DC2626" }}>{fmt(selectedSupplier.totalPurchases)}</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: "white", border: "1px solid #eee" }}>
              <p className="font-cairo text-[10px] text-gray-500">إجمالي المدفوع</p>
              <p className="font-cairo font-bold text-sm" style={{ color: "#16A34A" }}>{fmt(selectedSupplier.totalPaid)}</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: "white", border: "1px solid #eee" }}>
              <p className="font-cairo text-[10px] text-gray-500">المتبقي</p>
              <p className="font-cairo font-bold text-sm" style={{ color: "#1B3A6B" }}>{fmt(selectedSupplier.remaining)}</p>
            </div>
          </div>

          {/* Purchases Section */}
          <div className="rounded-lg overflow-hidden" style={{ background: "white", border: "1px solid #eee" }}>
            <div className="px-3 py-2" style={{ background: "#1B3A6B" }}>
              <h3 className="font-cairo text-white text-sm font-bold">مشتريات الأسمنت</h3>
            </div>
            {loadingStatement ? (
              <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !purchases.length ? (
              <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا توجد مشتريات</p>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-cairo text-right text-xs">التاريخ</TableHead>
                      <TableHead className="font-cairo text-right text-xs">الكمية (طن)</TableHead>
                      <TableHead className="font-cairo text-right text-xs">سعر الطن</TableHead>
                      <TableHead className="font-cairo text-right text-xs">الإجمالي</TableHead>
                      <TableHead className="font-cairo text-right text-xs">الوجهة</TableHead>
                      <TableHead className="font-cairo text-right text-xs">ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-cairo text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—"}</TableCell>
                        <TableCell className="font-cairo text-xs">{t.quantity_tons ?? "—"}</TableCell>
                        <TableCell className="font-cairo text-xs">{t.price_per_ton ? fmt(Number(t.price_per_ton)) : "—"}</TableCell>
                        <TableCell className="font-cairo text-xs font-medium">{fmt(Number(t.total_amount) || 0)}</TableCell>
                        <TableCell className="font-cairo text-xs">{t.destination_name ?? "—"}</TableCell>
                        <TableCell className="font-cairo text-xs text-muted-foreground truncate max-w-[100px]">{t.notes ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Payments Section */}
          <div className="rounded-lg overflow-hidden" style={{ background: "white", border: "1px solid #eee" }}>
            <div className="px-3 py-2" style={{ background: "#1B3A6B" }}>
              <h3 className="font-cairo text-white text-sm font-bold">المدفوعات</h3>
            </div>
            {loadingStatement ? (
              <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !payments.length ? (
              <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا توجد مدفوعات</p>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-cairo text-right text-xs">التاريخ</TableHead>
                      <TableHead className="font-cairo text-right text-xs">المبلغ</TableHead>
                      <TableHead className="font-cairo text-right text-xs">الطريقة</TableHead>
                      <TableHead className="font-cairo text-right text-xs">رقم الشيك</TableHead>
                      <TableHead className="font-cairo text-right text-xs">ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-cairo text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—"}</TableCell>
                        <TableCell className="font-cairo text-xs font-medium" style={{ color: "#16A34A" }}>{fmt(Number(t.total_amount) || 0)}</TableCell>
                        <TableCell><Badge variant="outline" className="font-cairo text-[10px]">{METHOD_LABELS[t.payment_method] ?? t.payment_method ?? "—"}</Badge></TableCell>
                        <TableCell className="font-cairo text-xs">{t.check_number ?? "—"}</TableCell>
                        <TableCell className="font-cairo text-xs text-muted-foreground truncate max-w-[100px]">{t.notes ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="w-full h-1 rounded" style={{ background: "#F5A623" }} />
          <p className="text-center font-cairo text-xs text-gray-400">شركة ركيزة لتوريد الخرسانة الجاهزة</p>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 pb-4">
            <Button variant="outline" onClick={() => setSelectedSupplier(null)} className="font-cairo flex-1">
              <ChevronLeft className="h-4 w-4 ml-1" />
              رجوع
            </Button>
            <Button
              onClick={() => {
                const transactions: { date: string; description: string; amount: number }[] = [];
                purchases.forEach((t: any) => {
                  transactions.push({
                    date: t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—",
                    description: `Purchase - ${t.quantity_tons ?? 0} ton`,
                    amount: Number(t.total_amount) || 0,
                  });
                });
                payments.forEach((t: any) => {
                  transactions.push({
                    date: t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—",
                    description: `Payment (${METHOD_LABELS[t.payment_method] ?? t.payment_method ?? "—"})`,
                    amount: -(Number(t.total_amount) || 0),
                  });
                });
                transactions.sort((a, b) => a.date.localeCompare(b.date));
                generateStatementPDF({
                  entityName: selectedSupplier.name,
                  entityType: "مورد",
                  phone: selectedSupplier.phone,
                  transactions,
                  totalDebt: selectedSupplier.totalPurchases,
                  totalPaid: selectedSupplier.totalPaid,
                  balance: selectedSupplier.remaining,
                });
              }}
              variant="outline"
              className="font-cairo flex-1"
            >
              تحميل PDF
            </Button>
            <Button
              onClick={() => {
                const transactions: { date: string; description: string; amount: number }[] = [];
                purchases.forEach((t: any) => {
                  transactions.push({
                    date: t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—",
                    description: `Purchase - ${t.quantity_tons ?? 0} ton`,
                    amount: Number(t.total_amount) || 0,
                  });
                });
                payments.forEach((t: any) => {
                  transactions.push({
                    date: t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—",
                    description: `Payment (${METHOD_LABELS[t.payment_method] ?? t.payment_method ?? "—"})`,
                    amount: -(Number(t.total_amount) || 0),
                  });
                });
                transactions.sort((a, b) => a.date.localeCompare(b.date));
                generateStatementPDF({
                  entityName: selectedSupplier.name,
                  entityType: "مورد",
                  phone: selectedSupplier.phone,
                  transactions,
                  totalDebt: selectedSupplier.totalPurchases,
                  totalPaid: selectedSupplier.totalPaid,
                  balance: selectedSupplier.remaining,
                });
                setTimeout(() => sendStatementWhatsApp(selectedSupplier.phone, selectedSupplier.name), 500);
              }}
              className="font-cairo flex-1 text-white gap-1"
              style={{ background: "#28A745" }}
            >
              <Send className="h-4 w-4" />
              واتساب
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث عن مورد..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 font-cairo h-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPayDialogOpen(true)} className="font-cairo gap-1">
            <Plus className="h-3.5 w-3.5" /> تسجيل دفعة
          </Button>
          <Button size="sm" onClick={() => setAddDialogOpen(true)} className="font-cairo gap-1">
            <Plus className="h-3.5 w-3.5" /> إضافة مورد
          </Button>
        </div>
      </div>

      {!filtered.length ? (
        <p className="text-center text-muted-foreground font-cairo py-12">لا يوجد موردين</p>
      ) : (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-cairo text-right">المورد</TableHead>
                <TableHead className="font-cairo text-right">الهاتف</TableHead>
                <TableHead className="font-cairo text-right">إجمالي المشتريات</TableHead>
                <TableHead className="font-cairo text-right">المدفوع</TableHead>
                <TableHead className="font-cairo text-right">المتبقي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedSupplier(a)}>
                  <TableCell className="font-cairo font-medium text-primary underline-offset-2 hover:underline">{a.name}</TableCell>
                  <TableCell className="font-cairo text-xs text-muted-foreground">{a.phone ?? "—"}</TableCell>
                  <TableCell className="font-cairo">{fmt(a.totalPurchases)}</TableCell>
                  <TableCell className="font-cairo text-chart-2">{fmt(a.totalPaid)}</TableCell>
                  <TableCell className="font-cairo text-destructive font-semibold">{fmt(a.remaining)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Supplier Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-cairo text-right">إضافة مورد جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="font-cairo">اسم المورد *</Label>
              <Input value={supplierForm.name} onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))} className="font-cairo" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">الهاتف</Label>
              <Input value={supplierForm.phone} onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))} className="font-cairo" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">العنوان</Label>
              <Input value={supplierForm.address} onChange={(e) => setSupplierForm((f) => ({ ...f, address: e.target.value }))} className="font-cairo" />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button onClick={() => { if (!supplierForm.name) { toast({ title: "أدخل اسم المورد", variant: "destructive" }); return; } addSupplierMutation.mutate(); }} disabled={addSupplierMutation.isPending} className="font-cairo gap-1">
              {addSupplierMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              إضافة
            </Button>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="font-cairo">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-cairo text-right">تسجيل دفعة لمورد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="font-cairo">المورد *</Label>
              <Select value={payForm.supplier_id} onValueChange={(v) => setPayForm((f) => ({ ...f, supplier_id: v }))}>
                <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>
                  {(suppliersList ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)} className="font-cairo">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">المبلغ *</Label>
              <Input type="number" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} className="font-cairo" min={0} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">طريقة الدفع</Label>
              <Select value={payForm.payment_method} onValueChange={(v) => setPayForm((f) => ({ ...f, payment_method: v }))}>
                <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash" className="font-cairo">كاش</SelectItem>
                  <SelectItem value="bank_transfer" className="font-cairo">تحويل بنكي</SelectItem>
                  <SelectItem value="check" className="font-cairo">شيك</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">التاريخ</Label>
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
              <Textarea value={payForm.notes} onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))} className="font-cairo" rows={2} />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button onClick={() => {
              if (!payForm.supplier_id) { toast({ title: "اختر المورد", variant: "destructive" }); return; }
              if (!payForm.amount || Number(payForm.amount) <= 0) { toast({ title: "أدخل المبلغ", variant: "destructive" }); return; }
              payMutation.mutate();
            }} disabled={payMutation.isPending} className="font-cairo gap-1">
              {payMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              تسجيل
            </Button>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} className="font-cairo">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
