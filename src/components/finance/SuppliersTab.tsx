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
import { toast } from "@/hooks/use-toast";
import { Search, ChevronLeft, Plus, CalendarIcon, Loader2 } from "lucide-react";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "كاش",
  bank_transfer: "تحويل بنكي",
  check: "شيك",
};

interface SupplierAccount {
  id: number;
  name: string;
  phone: string | null;
  totalPurchases: number;
  totalPaid: number;
  remaining: number;
  purchases: any[];
  payments: any[];
}

export function SuppliersTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierAccount | null>(null);
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

      const { data: stocks } = await supabase
        .from("cement_stock")
        .select("id, supplier_id, quantity_tons, price_per_ton, total_amount, stock_date, notes")
        .order("stock_date", { ascending: false });

      const { data: payments } = await supabase
        .from("supplier_payments")
        .select("id, supplier_id, amount, payment_method, payment_date, notes, created_at")
        .order("created_at", { ascending: false });

      const map = new Map<number, SupplierAccount>();
      (suppliers ?? []).forEach((s) => {
        map.set(s.id, {
          id: s.id, name: s.name, phone: s.phone,
          totalPurchases: 0, totalPaid: 0, remaining: 0,
          purchases: [], payments: [],
        });
      });

      (stocks ?? []).forEach((st) => {
        const acc = map.get(st.supplier_id);
        if (!acc) return;
        acc.totalPurchases += Number(st.total_amount) || 0;
        acc.purchases.push(st);
      });

      (payments ?? []).forEach((p) => {
        const acc = map.get(p.supplier_id);
        if (!acc) return;
        acc.totalPaid += Number(p.amount) || 0;
        acc.payments.push(p);
      });

      map.forEach((acc) => { acc.remaining = acc.totalPurchases - acc.totalPaid; });
      return [...map.values()].sort((a, b) => b.remaining - a.remaining);
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
                  <TableCell className="font-cairo text-emerald-600">{fmt(a.totalPaid)}</TableCell>
                  <TableCell className="font-cairo text-destructive font-semibold">{fmt(a.remaining)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Supplier Statement Dialog */}
      <Dialog open={!!selectedSupplier} onOpenChange={(o) => !o && setSelectedSupplier(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-cairo text-right flex items-center gap-2">
              <ChevronLeft className="h-4 w-4" />
              كشف حساب: {selectedSupplier?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedSupplier && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="p-3 text-center">
                  <p className="text-xs font-cairo text-muted-foreground">إجمالي المشتريات</p>
                  <p className="font-cairo font-bold text-primary">{fmt(selectedSupplier.totalPurchases)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 text-center">
                  <p className="text-xs font-cairo text-muted-foreground">المدفوع</p>
                  <p className="font-cairo font-bold text-emerald-600">{fmt(selectedSupplier.totalPaid)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 text-center">
                  <p className="text-xs font-cairo text-muted-foreground">المتبقي</p>
                  <p className="font-cairo font-bold text-destructive">{fmt(selectedSupplier.remaining)}</p>
                </CardContent></Card>
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="font-cairo text-sm">المشتريات (أسمنت)</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {!selectedSupplier.purchases.length ? (
                    <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا توجد مشتريات</p>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="font-cairo text-right">التاريخ</TableHead>
                            <TableHead className="font-cairo text-right">الكمية (طن)</TableHead>
                            <TableHead className="font-cairo text-right">سعر الطن</TableHead>
                            <TableHead className="font-cairo text-right">الإجمالي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedSupplier.purchases.map((p: any) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-cairo text-xs">{p.stock_date ?? "—"}</TableCell>
                              <TableCell className="font-cairo">{p.quantity_tons}</TableCell>
                              <TableCell className="font-cairo">{fmt(Number(p.price_per_ton))}</TableCell>
                              <TableCell className="font-cairo font-medium">{fmt(Number(p.total_amount))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="font-cairo text-sm">المدفوعات</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {!selectedSupplier.payments.length ? (
                    <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا توجد مدفوعات</p>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="font-cairo text-right">التاريخ</TableHead>
                            <TableHead className="font-cairo text-right">المبلغ</TableHead>
                            <TableHead className="font-cairo text-right">الطريقة</TableHead>
                            <TableHead className="font-cairo text-right">ملاحظات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedSupplier.payments.map((p: any) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-cairo text-xs">{p.payment_date ?? new Date(p.created_at).toLocaleDateString("ar-EG")}</TableCell>
                              <TableCell className="font-cairo text-emerald-600 font-medium">{fmt(Number(p.amount))}</TableCell>
                              <TableCell><Badge variant="outline" className="font-cairo text-[10px]">{METHOD_LABELS[p.payment_method] ?? p.payment_method}</Badge></TableCell>
                              <TableCell className="font-cairo text-xs text-muted-foreground truncate max-w-[150px]">{p.notes ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
