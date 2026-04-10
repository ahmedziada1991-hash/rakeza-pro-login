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
import { Package, Plus, CalendarIcon, Loader2, ArrowDown, ArrowUp } from "lucide-react";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "كاش",
  concrete_deduction: "خصم من خرسانة",
  mixed: "مختلط",
};

export function CementTab() {
  const queryClient = useQueryClient();
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);

  const [stockForm, setStockForm] = useState({ supplier_id: "", quantity_tons: "", price_per_ton: "", notes: "" });
  const [stockDate, setStockDate] = useState<Date | undefined>(new Date());

  const [saleForm, setSaleForm] = useState({
    station_id: "", quantity_tons: "", price_per_ton: "",
    payment_method: "cash", cash_amount: "", concrete_deduction_amount: "", notes: "",
  });
  const [saleDate, setSaleDate] = useState<Date | undefined>(new Date());

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").eq("status", "active").order("name");
      return data ?? [];
    },
  });

  const { data: stations } = useQuery({
    queryKey: ["stations-list-cement"],
    queryFn: async () => {
      const { data } = await supabase.from("stations").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: incomingStock, isLoading: loadingStock } = useQuery({
    queryKey: ["cement-stock-incoming"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cement_stock")
        .select("id, supplier_id, quantity_tons, price_per_ton, total_amount, stock_date, notes")
        .order("stock_date", { ascending: false });

      const supplierIds = [...new Set((data ?? []).map((d) => d.supplier_id))];
      const { data: sups } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
      const supMap = new Map((sups ?? []).map((s) => [s.id, s.name]));

      return (data ?? []).map((d) => ({ ...d, supplier_name: supMap.get(d.supplier_id) ?? "—" }));
    },
  });

  const { data: outgoingSales, isLoading: loadingSales } = useQuery({
    queryKey: ["cement-sales-outgoing"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cement_sales")
        .select("id, station_id, quantity_tons, price_per_ton, total_amount, payment_method, cash_amount, concrete_deduction_amount, sale_date, notes")
        .order("sale_date", { ascending: false });

      const stationIds = [...new Set((data ?? []).map((d) => d.station_id))];
      const { data: sts } = await supabase.from("stations").select("id, name").in("id", stationIds);
      const stMap = new Map((sts ?? []).map((s) => [s.id, s.name]));

      return (data ?? []).map((d) => ({ ...d, station_name: stMap.get(d.station_id) ?? "—" }));
    },
  });

  const inventory = useMemo(() => {
    const totalIn = (incomingStock ?? []).reduce((s, r) => s + (Number(r.quantity_tons) || 0), 0);
    const totalOut = (outgoingSales ?? []).reduce((s, r) => s + (Number(r.quantity_tons) || 0), 0);
    const totalInValue = (incomingStock ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    const totalOutValue = (outgoingSales ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    return { totalIn, totalOut, current: totalIn - totalOut, totalInValue, totalOutValue, profit: totalOutValue - totalInValue };
  }, [incomingStock, outgoingSales]);

  const addStockMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cement_stock").insert({
        supplier_id: Number(stockForm.supplier_id),
        quantity_tons: Number(stockForm.quantity_tons),
        price_per_ton: Number(stockForm.price_per_ton),
        stock_date: stockDate ? format(stockDate, "yyyy-MM-dd") : null,
        notes: stockForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cement-stock-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["finance-suppliers-tab"] });
      toast({ title: "تم إضافة الوارد بنجاح" });
      setStockDialogOpen(false);
      setStockForm({ supplier_id: "", quantity_tons: "", price_per_ton: "", notes: "" });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const addSaleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cement_sales").insert({
        station_id: Number(saleForm.station_id),
        quantity_tons: Number(saleForm.quantity_tons),
        price_per_ton: Number(saleForm.price_per_ton),
        payment_method: saleForm.payment_method,
        cash_amount: Number(saleForm.cash_amount) || 0,
        concrete_deduction_amount: Number(saleForm.concrete_deduction_amount) || 0,
        sale_date: saleDate ? format(saleDate, "yyyy-MM-dd") : null,
        notes: saleForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cement-sales-outgoing"] });
      queryClient.invalidateQueries({ queryKey: ["finance-stations-tab"] });
      toast({ title: "تم تسجيل البيع بنجاح" });
      setSaleDialogOpen(false);
      setSaleForm({ station_id: "", quantity_tons: "", price_per_ton: "", payment_method: "cash", cash_amount: "", concrete_deduction_amount: "", notes: "" });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const isLoading = loadingStock || loadingSales;

  if (isLoading) {
    return <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Inventory Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs font-cairo text-muted-foreground">المخزون الحالي</p>
          <p className="font-cairo font-bold text-primary text-lg">{inventory.current.toLocaleString("ar-EG")} طن</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs font-cairo text-muted-foreground">إجمالي الوارد</p>
          <p className="font-cairo font-bold text-emerald-600">{inventory.totalIn.toLocaleString("ar-EG")} طن</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs font-cairo text-muted-foreground">إجمالي الصادر</p>
          <p className="font-cairo font-bold text-orange-600">{inventory.totalOut.toLocaleString("ar-EG")} طن</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs font-cairo text-muted-foreground">ربح الأسمنت</p>
          <p className={`font-cairo font-bold text-lg ${inventory.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(inventory.profit)}</p>
        </CardContent></Card>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={() => setStockDialogOpen(true)} className="font-cairo gap-1">
          <ArrowDown className="h-3.5 w-3.5" /> تسجيل وارد
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSaleDialogOpen(true)} className="font-cairo gap-1">
          <ArrowUp className="h-3.5 w-3.5" /> تسجيل صادر (بيع)
        </Button>
      </div>

      {/* Incoming Stock Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-cairo text-sm flex items-center gap-2"><ArrowDown className="h-4 w-4 text-emerald-600" /> حركات الوارد</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!(incomingStock ?? []).length ? (
            <p className="text-center text-muted-foreground font-cairo py-8 text-sm">لا توجد حركات وارد</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-cairo text-right">التاريخ</TableHead>
                    <TableHead className="font-cairo text-right">المورد</TableHead>
                    <TableHead className="font-cairo text-right">الكمية (طن)</TableHead>
                    <TableHead className="font-cairo text-right">سعر الطن</TableHead>
                    <TableHead className="font-cairo text-right">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(incomingStock ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-cairo text-xs">{r.stock_date ?? "—"}</TableCell>
                      <TableCell className="font-cairo text-xs">{r.supplier_name}</TableCell>
                      <TableCell className="font-cairo">{r.quantity_tons}</TableCell>
                      <TableCell className="font-cairo">{fmt(Number(r.price_per_ton))}</TableCell>
                      <TableCell className="font-cairo font-medium">{fmt(Number(r.total_amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outgoing Sales Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-cairo text-sm flex items-center gap-2"><ArrowUp className="h-4 w-4 text-orange-600" /> حركات الصادر (بيع للمحطات)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!(outgoingSales ?? []).length ? (
            <p className="text-center text-muted-foreground font-cairo py-8 text-sm">لا توجد حركات صادر</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-cairo text-right">التاريخ</TableHead>
                    <TableHead className="font-cairo text-right">المحطة</TableHead>
                    <TableHead className="font-cairo text-right">الكمية (طن)</TableHead>
                    <TableHead className="font-cairo text-right">سعر البيع</TableHead>
                    <TableHead className="font-cairo text-right">الإجمالي</TableHead>
                    <TableHead className="font-cairo text-right">طريقة الدفع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(outgoingSales ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-cairo text-xs">{r.sale_date ?? "—"}</TableCell>
                      <TableCell className="font-cairo text-xs">{r.station_name}</TableCell>
                      <TableCell className="font-cairo">{r.quantity_tons}</TableCell>
                      <TableCell className="font-cairo">{fmt(Number(r.price_per_ton))}</TableCell>
                      <TableCell className="font-cairo font-medium">{fmt(Number(r.total_amount))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-cairo text-[10px]">
                          {PAYMENT_METHOD_LABELS[r.payment_method] ?? r.payment_method}
                        </Badge>
                        {r.payment_method === "mixed" && (
                          <span className="text-[10px] font-cairo text-muted-foreground block mt-0.5">
                            كاش: {fmt(Number(r.cash_amount))} | خصم: {fmt(Number(r.concrete_deduction_amount))}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Stock Dialog */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-cairo text-right">تسجيل وارد أسمنت</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="font-cairo">المورد *</Label>
              <Select value={stockForm.supplier_id} onValueChange={(v) => setStockForm((f) => ({ ...f, supplier_id: v }))}>
                <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>
                  {(suppliers ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)} className="font-cairo">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-cairo">الكمية (طن) *</Label>
                <Input type="number" value={stockForm.quantity_tons} onChange={(e) => setStockForm((f) => ({ ...f, quantity_tons: e.target.value }))} className="font-cairo" min={0} />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">سعر الطن *</Label>
                <Input type="number" value={stockForm.price_per_ton} onChange={(e) => setStockForm((f) => ({ ...f, price_per_ton: e.target.value }))} className="font-cairo" min={0} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">التاريخ</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-cairo gap-2", !stockDate && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4" />
                    {stockDate ? format(stockDate, "yyyy/MM/dd") : "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={stockDate} onSelect={setStockDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea value={stockForm.notes} onChange={(e) => setStockForm((f) => ({ ...f, notes: e.target.value }))} className="font-cairo" rows={2} />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button onClick={() => {
              if (!stockForm.supplier_id) { toast({ title: "اختر المورد", variant: "destructive" }); return; }
              if (!stockForm.quantity_tons || Number(stockForm.quantity_tons) <= 0) { toast({ title: "أدخل الكمية", variant: "destructive" }); return; }
              if (!stockForm.price_per_ton || Number(stockForm.price_per_ton) <= 0) { toast({ title: "أدخل السعر", variant: "destructive" }); return; }
              addStockMutation.mutate();
            }} disabled={addStockMutation.isPending} className="font-cairo gap-1">
              {addStockMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              تسجيل
            </Button>
            <Button variant="outline" onClick={() => setStockDialogOpen(false)} className="font-cairo">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Sale Dialog */}
      <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-cairo text-right">تسجيل بيع أسمنت لمحطة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="font-cairo">المحطة *</Label>
              <Select value={saleForm.station_id} onValueChange={(v) => setSaleForm((f) => ({ ...f, station_id: v }))}>
                <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر المحطة" /></SelectTrigger>
                <SelectContent>
                  {(stations ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)} className="font-cairo">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-cairo">الكمية (طن) *</Label>
                <Input type="number" value={saleForm.quantity_tons} onChange={(e) => setSaleForm((f) => ({ ...f, quantity_tons: e.target.value }))} className="font-cairo" min={0} />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">سعر البيع *</Label>
                <Input type="number" value={saleForm.price_per_ton} onChange={(e) => setSaleForm((f) => ({ ...f, price_per_ton: e.target.value }))} className="font-cairo" min={0} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">طريقة الدفع</Label>
              <Select value={saleForm.payment_method} onValueChange={(v) => setSaleForm((f) => ({ ...f, payment_method: v }))}>
                <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash" className="font-cairo">كاش</SelectItem>
                  <SelectItem value="concrete_deduction" className="font-cairo">خصم من رصيد خرسانة</SelectItem>
                  <SelectItem value="mixed" className="font-cairo">مختلط (كاش + خصم)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(saleForm.payment_method === "cash" || saleForm.payment_method === "mixed") && (
              <div className="space-y-1.5">
                <Label className="font-cairo">المبلغ النقدي</Label>
                <Input type="number" value={saleForm.cash_amount} onChange={(e) => setSaleForm((f) => ({ ...f, cash_amount: e.target.value }))} className="font-cairo" min={0} />
              </div>
            )}
            {(saleForm.payment_method === "concrete_deduction" || saleForm.payment_method === "mixed") && (
              <div className="space-y-1.5">
                <Label className="font-cairo">مبلغ خصم الخرسانة</Label>
                <Input type="number" value={saleForm.concrete_deduction_amount} onChange={(e) => setSaleForm((f) => ({ ...f, concrete_deduction_amount: e.target.value }))} className="font-cairo" min={0} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="font-cairo">التاريخ</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-cairo gap-2", !saleDate && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4" />
                    {saleDate ? format(saleDate, "yyyy/MM/dd") : "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={saleDate} onSelect={setSaleDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea value={saleForm.notes} onChange={(e) => setSaleForm((f) => ({ ...f, notes: e.target.value }))} className="font-cairo" rows={2} />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button onClick={() => {
              if (!saleForm.station_id) { toast({ title: "اختر المحطة", variant: "destructive" }); return; }
              if (!saleForm.quantity_tons || Number(saleForm.quantity_tons) <= 0) { toast({ title: "أدخل الكمية", variant: "destructive" }); return; }
              if (!saleForm.price_per_ton || Number(saleForm.price_per_ton) <= 0) { toast({ title: "أدخل السعر", variant: "destructive" }); return; }
              addSaleMutation.mutate();
            }} disabled={addSaleMutation.isPending} className="font-cairo gap-1">
              {addSaleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              تسجيل
            </Button>
            <Button variant="outline" onClick={() => setSaleDialogOpen(false)} className="font-cairo">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
