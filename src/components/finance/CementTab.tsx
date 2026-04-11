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
import { ArrowDown, ArrowUp, CalendarIcon, Loader2, Pencil, Trash2, TrendingUp } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "كاش",
  concrete_deduction: "خصم من خرسانة",
  mixed: "مختلط",
};

export function CementTab() {
  const queryClient = useQueryClient();
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "purchase" | "sale"; record: any } | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [editingSale, setEditingSale] = useState<any>(null);

  // Stock form
  const [stockForm, setStockForm] = useState({
    supplier_id: "", quantity_tons: "", price_per_ton: "", destination_station_id: "", notes: "",
  });
  const [stockDate, setStockDate] = useState<Date | undefined>(new Date());

  // Sale form
  const [saleForm, setSaleForm] = useState({
    purchase_id: "", station_id: "", quantity_tons: "", price_per_ton: "",
    payment_method: "cash", cash_amount: "", concrete_deduction_amount: "", notes: "",
  });
  const [saleDate, setSaleDate] = useState<Date | undefined>(new Date());

  // --- Queries ---
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

  // Incoming purchases from supplier_accounts
  const { data: purchases, isLoading: loadingPurchases } = useQuery({
    queryKey: ["cement-purchases"],
    queryFn: async () => {
      const { data } = await supabase
        .from("supplier_accounts" as any)
        .select("*")
        .eq("transaction_type", "purchase")
        .order("created_at", { ascending: false });
      // Get supplier names
      const supIds = [...new Set((data ?? []).map((d: any) => d.supplier_id))];
      const { data: sups } = supIds.length
        ? await supabase.from("suppliers").select("id, name").in("id", supIds)
        : { data: [] };
      const supMap = new Map((sups ?? []).map((s: any) => [s.id, s.name]));
      // Deduplicate by id
      const seen = new Set<string>();
      return (data ?? [])
        .filter((d: any) => {
          if (seen.has(String(d.id))) return false;
          seen.add(String(d.id));
          return true;
        })
        .map((d: any) => ({ ...d, supplier_name: supMap.get(d.supplier_id) ?? "—" }));
    },
  });

  // Outgoing sales from station_accounts where transaction_type = 'cement'
  const { data: sales, isLoading: loadingSales } = useQuery({
    queryKey: ["cement-sales-station"],
    queryFn: async () => {
      const { data } = await supabase
        .from("station_accounts" as any)
        .select("*")
        .eq("transaction_type", "cement")
        .order("created_at", { ascending: false });
      const stIds = [...new Set((data ?? []).map((d: any) => d.station_id))];
      const { data: sts } = stIds.length
        ? await supabase.from("stations").select("id, name").in("id", stIds)
        : { data: [] };
      const stMap = new Map((sts ?? []).map((s: any) => [s.id, s.name]));
      return (data ?? []).map((d: any) => ({ ...d, station_name: stMap.get(d.station_id) ?? "—" }));
    },
  });

  // Selected purchase for sale form
  const selectedPurchase = useMemo(() => {
    if (!saleForm.purchase_id || !purchases) return null;
    return purchases.find((p: any) => String(p.id) === saleForm.purchase_id) ?? null;
  }, [saleForm.purchase_id, purchases]);

  // When selecting a purchase, auto-fill station & quantity
  const handlePurchaseSelect = (purchaseId: string) => {
    const p = (purchases ?? []).find((x: any) => String(x.id) === purchaseId);
    if (p) {
      // Try to find station by destination_name
      const matchedStation = (stations ?? []).find((s: any) => s.name === p.destination_name);
      setSaleForm((f) => ({
        ...f,
        purchase_id: purchaseId,
        station_id: matchedStation ? String(matchedStation.id) : "",
        quantity_tons: String(p.quantity_tons ?? ""),
        price_per_ton: "",
      }));
    } else {
      setSaleForm((f) => ({ ...f, purchase_id: purchaseId }));
    }
  };

  // Inventory summary
  const inventory = useMemo(() => {
    const totalIn = (purchases ?? []).reduce((s: number, r: any) => s + (Number(r.quantity_tons) || 0), 0);
    const totalOut = (sales ?? []).reduce((s: number, r: any) => s + (Number(r.cement_tons) || Number(r.quantity_tons) || 0), 0);
    const totalInValue = (purchases ?? []).reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);
    const totalOutValue = (sales ?? []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    return { totalIn, totalOut, current: totalIn - totalOut, totalInValue, totalOutValue, profit: totalOutValue - totalInValue };
  }, [purchases, sales]);

  // Calculate profit per sale
  const salesWithProfit = useMemo(() => {
    if (!sales || !purchases) return [];
    return (sales ?? []).map((s: any) => {
      const qty = Number(s.cement_tons) || Number(s.quantity_tons) || 0;
      const salePrice = Number(s.price_per_ton) || (qty > 0 ? Number(s.amount) / qty : 0);

      // Purchase price: first try cement_price_per_ton from station_accounts
      let purchasePrice = Number(s.cement_price_per_ton) || 0;

      // Fallback: match supplier_accounts by destination_name = station name and closest date
      if (!purchasePrice && s.station_name) {
        const matchingPurchases = (purchases ?? []).filter(
          (p: any) => p.destination_name === s.station_name
        );
        if (matchingPurchases.length > 0) {
          const saleDate = new Date(s.created_at).getTime();
          matchingPurchases.sort(
            (a: any, b: any) =>
              Math.abs(new Date(a.created_at).getTime() - saleDate) -
              Math.abs(new Date(b.created_at).getTime() - saleDate)
          );
          purchasePrice = Number(matchingPurchases[0].price_per_ton) || 0;
        }
      }

      const profit = (salePrice - purchasePrice) * qty;
      return { ...s, profit, purchasePrice, salePrice, displayQty: qty };
    });
  }, [sales, purchases]);

  // --- Mutations ---
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["cement-purchases"] });
    queryClient.invalidateQueries({ queryKey: ["cement-sales-station"] });
    queryClient.invalidateQueries({ queryKey: ["cement-stock-incoming"] });
    queryClient.invalidateQueries({ queryKey: ["cement-sales-outgoing"] });
    queryClient.invalidateQueries({ queryKey: ["finance-suppliers-tab"] });
    queryClient.invalidateQueries({ queryKey: ["finance-stations-tab"] });
    queryClient.invalidateQueries({ queryKey: ["finance-profits"] });
    queryClient.invalidateQueries({ queryKey: ["supplier-statement"] });
  };

  const deletePurchaseMutation = useMutation({
    mutationFn: async (record: any) => {
      // Delete from supplier_accounts (the main record shown in table)
      const { error: e1 } = await supabase.from("supplier_accounts" as any).delete().eq("id", record.id);
      if (e1) throw e1;
      // Delete matching cement_stock record
      await supabase.from("cement_stock" as any)
        .delete()
        .eq("supplier_id", record.supplier_id)
        .eq("created_at", record.created_at);
    },
    onSuccess: () => { invalidateAll(); toast({ title: "تم حذف سجل الوارد بنجاح" }); },
    onError: (err: any) => toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" }),
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (record: any) => {
      // Delete from station_accounts (the main record shown in table)
      const { error: e1 } = await supabase.from("station_accounts" as any).delete().eq("id", record.id);
      if (e1) throw e1;
      // Delete matching cement_sales record
      await supabase.from("cement_sales" as any)
        .delete()
        .eq("station_id", record.station_id)
        .eq("created_at", record.created_at);
    },
    onSuccess: () => { invalidateAll(); toast({ title: "تم حذف سجل البيع بنجاح" }); },
    onError: (err: any) => toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" }),
  });

  const addStockMutation = useMutation({
    mutationFn: async () => {
      const qty = Number(stockForm.quantity_tons);
      const ppt = Number(stockForm.price_per_ton);
      const total = qty * ppt;
      const destStation = (stations ?? []).find((s: any) => String(s.id) === stockForm.destination_station_id);

      if (editingPurchase) {
        // UPDATE mode
        const { error: saErr } = await supabase.from("supplier_accounts" as any).update({
          supplier_id: Number(stockForm.supplier_id),
          quantity_tons: qty,
          price_per_ton: ppt,
          total_amount: total,
          destination_name: destStation?.name || null,
          notes: stockForm.notes || null,
        }).eq("id", editingPurchase.id);
        if (saErr) throw saErr;

        // Update cement_stock by matching supplier_id + created_at
        await supabase.from("cement_stock" as any).update({
          supplier_id: Number(stockForm.supplier_id),
          quantity_tons: qty,
          price_per_ton: ppt,
          stock_date: stockDate ? format(stockDate, "yyyy-MM-dd") : null,
          notes: stockForm.notes || null,
        }).eq("supplier_id", editingPurchase.supplier_id).eq("created_at", editingPurchase.created_at);
      } else {
        // INSERT mode
        const { error: saErr } = await supabase.from("supplier_accounts" as any).insert({
          supplier_id: Number(stockForm.supplier_id),
          transaction_type: "purchase",
          quantity_tons: qty,
          price_per_ton: ppt,
          total_amount: total,
          destination_name: destStation?.name || null,
          notes: stockForm.notes || null,
        });
        if (saErr) throw saErr;

        const { error: csErr } = await supabase.from("cement_stock").insert({
          supplier_id: Number(stockForm.supplier_id),
          quantity_tons: qty,
          price_per_ton: ppt,
          stock_date: stockDate ? format(stockDate, "yyyy-MM-dd") : null,
          notes: stockForm.notes || null,
        });
        if (csErr) throw csErr;
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: editingPurchase ? "تم التعديل بنجاح" : "تم تسجيل الوارد بنجاح" });
      setStockDialogOpen(false);
      setEditingPurchase(null);
      setStockForm({ supplier_id: "", quantity_tons: "", price_per_ton: "", destination_station_id: "", notes: "" });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const addSaleMutation = useMutation({
    mutationFn: async () => {
      const qty = Number(saleForm.quantity_tons);
      const ppt = Number(saleForm.price_per_ton);
      const total = qty * ppt;
      const purchasePrice = selectedPurchase ? Number(selectedPurchase.price_per_ton) : 0;

      if (editingSale) {
        // UPDATE mode
        const { error: stErr } = await supabase.from("station_accounts" as any).update({
          station_id: Number(saleForm.station_id),
          quantity_tons: qty,
          price_per_ton: ppt,
          amount: total,
          cement_price_per_ton: purchasePrice,
          payment_method: saleForm.payment_method,
          notes: saleForm.notes || null,
        }).eq("id", editingSale.id);
        if (stErr) throw stErr;

        // Update cement_sales by matching station_id + created_at
        await supabase.from("cement_sales" as any).update({
          station_id: Number(saleForm.station_id),
          quantity_tons: qty,
          price_per_ton: ppt,
          sale_price_per_ton: ppt,
          payment_method: saleForm.payment_method,
          cash_amount: saleForm.payment_method === "mixed" ? Number(saleForm.cash_amount) || 0 : (saleForm.payment_method === "cash" ? total : 0),
          concrete_deduction_amount: saleForm.payment_method === "mixed" ? Number(saleForm.concrete_deduction_amount) || 0 : (saleForm.payment_method === "concrete_deduction" ? total : 0),
          sale_date: saleDate ? format(saleDate, "yyyy-MM-dd") : null,
          notes: saleForm.notes || null,
        }).eq("station_id", editingSale.station_id).eq("created_at", editingSale.created_at);
      } else {
        // INSERT mode
        const stationPayload: any = {
          station_id: Number(saleForm.station_id),
          transaction_type: "cement",
          quantity_tons: qty,
          price_per_ton: ppt,
          amount: total,
          cement_source_type: "purchased",
          cement_price_per_ton: purchasePrice,
          payment_method: saleForm.payment_method,
          notes: saleForm.notes || null,
        };
        const { error: stErr } = await supabase.from("station_accounts" as any).insert(stationPayload);
        if (stErr) throw stErr;

        if (saleForm.payment_method === "concrete_deduction" || saleForm.payment_method === "mixed") {
          const deductAmt = saleForm.payment_method === "concrete_deduction"
            ? total
            : Number(saleForm.concrete_deduction_amount) || 0;
          if (deductAmt > 0) {
            const { error: deductErr } = await supabase.from("station_accounts" as any).insert({
              station_id: Number(saleForm.station_id),
              transaction_type: "payment",
              amount: deductAmt,
              payment_method: "concrete_deduction",
              notes: "خصم تلقائي مقابل أسمنت",
            });
            if (deductErr) throw deductErr;
          }
        }

        const { error: csErr } = await supabase.from("cement_sales").insert({
          station_id: Number(saleForm.station_id),
          quantity_tons: qty,
          price_per_ton: ppt,
          sale_price_per_ton: ppt,
          payment_method: saleForm.payment_method,
          cash_amount: saleForm.payment_method === "mixed" ? Number(saleForm.cash_amount) || 0 : (saleForm.payment_method === "cash" ? total : 0),
          concrete_deduction_amount: saleForm.payment_method === "mixed" ? Number(saleForm.concrete_deduction_amount) || 0 : (saleForm.payment_method === "concrete_deduction" ? total : 0),
          sale_date: saleDate ? format(saleDate, "yyyy-MM-dd") : null,
          notes: saleForm.notes || null,
        });
        if (csErr) throw csErr;
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: editingSale ? "تم التعديل بنجاح" : "تم تسجيل البيع بنجاح" });
      setSaleDialogOpen(false);
      setEditingSale(null);
      setSaleForm({ purchase_id: "", station_id: "", quantity_tons: "", price_per_ton: "", payment_method: "cash", cash_amount: "", concrete_deduction_amount: "", notes: "" });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const saleTotal = useMemo(() => {
    const qty = Number(saleForm.quantity_tons) || 0;
    const ppt = Number(saleForm.price_per_ton) || 0;
    return qty * ppt;
  }, [saleForm.quantity_tons, saleForm.price_per_ton]);

  const stockTotal = useMemo(() => {
    const qty = Number(stockForm.quantity_tons) || 0;
    const ppt = Number(stockForm.price_per_ton) || 0;
    return qty * ppt;
  }, [stockForm.quantity_tons, stockForm.price_per_ton]);

  // Edit handlers
  const handleEditPurchase = (r: any) => {
    const matchedStation = (stations ?? []).find((s: any) => s.name === r.destination_name);
    setStockForm({
      supplier_id: String(r.supplier_id),
      quantity_tons: String(r.quantity_tons ?? ""),
      price_per_ton: String(r.price_per_ton ?? ""),
      destination_station_id: matchedStation ? String(matchedStation.id) : "",
      notes: r.notes ?? "",
    });
    setStockDate(r.created_at ? new Date(r.created_at) : new Date());
    setEditingPurchase(r);
    setStockDialogOpen(true);
  };

  const handleEditSale = (r: any) => {
    setSaleForm({
      purchase_id: "",
      station_id: String(r.station_id),
      quantity_tons: String(r.cement_tons ?? r.quantity_tons ?? ""),
      price_per_ton: String(r.price_per_ton ?? (r.amount && (r.cement_tons || r.quantity_tons) ? Number(r.amount) / (Number(r.cement_tons) || Number(r.quantity_tons)) : "")),
      payment_method: r.payment_method ?? "cash",
      cash_amount: String(r.cash_amount ?? ""),
      concrete_deduction_amount: String(r.concrete_deduction_amount ?? ""),
      notes: r.notes ?? "",
    });
    setSaleDate(r.created_at ? new Date(r.created_at) : new Date());
    setEditingSale(r);
    setSaleDialogOpen(true);
  };
  const isLoading = loadingPurchases || loadingSales;

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

      {/* Incoming Purchases Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-cairo text-sm flex items-center gap-2">
            <ArrowDown className="h-4 w-4 text-emerald-600" /> حركات الوارد (من الموردين)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!(purchases ?? []).length ? (
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
                    <TableHead className="font-cairo text-right">الوجهة</TableHead>
                     <TableHead className="font-cairo text-right">ملاحظات</TableHead>
                     <TableHead className="w-10"></TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {(purchases ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-cairo text-xs">{r.created_at ? format(new Date(r.created_at), "yyyy/MM/dd") : "—"}</TableCell>
                      <TableCell className="font-cairo text-xs">{r.supplier_name}</TableCell>
                      <TableCell className="font-cairo">{r.quantity_tons}</TableCell>
                      <TableCell className="font-cairo">{fmt(Number(r.price_per_ton))}</TableCell>
                      <TableCell className="font-cairo font-medium">{fmt(Number(r.total_amount))}</TableCell>
                      <TableCell className="font-cairo text-xs">{r.destination_name ?? "—"}</TableCell>
                      <TableCell className="font-cairo text-xs text-muted-foreground">{r.notes ?? "—"}</TableCell>
                      <TableCell className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => handleEditPurchase(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "purchase", record: r })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
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
        <CardHeader className="pb-2">
          <CardTitle className="font-cairo text-sm flex items-center gap-2">
            <ArrowUp className="h-4 w-4 text-orange-600" /> حركات الصادر (بيع للمحطات)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!salesWithProfit.length ? (
            <p className="text-center text-muted-foreground font-cairo py-8 text-sm">لا توجد حركات صادر</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-cairo text-right">التاريخ</TableHead>
                    <TableHead className="font-cairo text-right">المحطة</TableHead>
                    <TableHead className="font-cairo text-right">الكمية (طن)</TableHead>
                    <TableHead className="font-cairo text-right">سعر الشراء</TableHead>
                    <TableHead className="font-cairo text-right">سعر البيع</TableHead>
                    <TableHead className="font-cairo text-right">الإجمالي</TableHead>
                    <TableHead className="font-cairo text-right">الربح</TableHead>
                     <TableHead className="font-cairo text-right">طريقة الدفع</TableHead>
                     <TableHead className="w-10"></TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {salesWithProfit.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-cairo text-xs">{r.created_at ? format(new Date(r.created_at), "yyyy/MM/dd") : "—"}</TableCell>
                      <TableCell className="font-cairo text-xs">{r.station_name}</TableCell>
                      <TableCell className="font-cairo">{r.displayQty}</TableCell>
                      <TableCell className="font-cairo text-xs">{fmt(r.purchasePrice)}</TableCell>
                      <TableCell className="font-cairo text-xs">{fmt(r.salePrice)}</TableCell>
                      <TableCell className="font-cairo font-medium">{fmt(Number(r.amount))}</TableCell>
                      <TableCell>
                        <Badge variant={r.profit >= 0 ? "default" : "destructive"} className="font-cairo text-[10px]">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {fmt(r.profit)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-cairo text-[10px]">
                          {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => handleEditSale(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "sale", record: r })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
      <Dialog open={stockDialogOpen} onOpenChange={(open) => { setStockDialogOpen(open); if (!open) { setEditingPurchase(null); setStockForm({ supplier_id: "", quantity_tons: "", price_per_ton: "", destination_station_id: "", notes: "" }); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-cairo text-right">{editingPurchase ? "تعديل سجل وارد" : "تسجيل وارد أسمنت"}</DialogTitle></DialogHeader>
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
            {stockTotal > 0 && (
              <div className="bg-muted rounded-md p-2 text-center">
                <span className="font-cairo text-sm text-muted-foreground">الإجمالي: </span>
                <span className="font-cairo font-bold text-primary">{fmt(stockTotal)}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="font-cairo">الوجهة (المحطة)</Label>
              <Select value={stockForm.destination_station_id} onValueChange={(v) => setStockForm((f) => ({ ...f, destination_station_id: v }))}>
                <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر المحطة" /></SelectTrigger>
                <SelectContent>
                  {(stations ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)} className="font-cairo">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {editingPurchase ? "حفظ التعديل" : "تسجيل"}
            </Button>
            <Button variant="outline" onClick={() => setStockDialogOpen(false)} className="font-cairo">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Sale Dialog */}
      <Dialog open={saleDialogOpen} onOpenChange={(open) => { setSaleDialogOpen(open); if (!open) { setEditingSale(null); setSaleForm({ purchase_id: "", station_id: "", quantity_tons: "", price_per_ton: "", payment_method: "cash", cash_amount: "", concrete_deduction_amount: "", notes: "" }); } }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle className="font-cairo text-right">{editingSale ? "تعديل سجل بيع" : "تسجيل بيع أسمنت لمحطة"}</DialogTitle></DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 pl-1">
            {/* Select Purchase */}
            <div className="space-y-1.5">
              <Label className="font-cairo">اختر النقلة (الوارد) *</Label>
              <Select value={saleForm.purchase_id} onValueChange={handlePurchaseSelect}>
                <SelectTrigger className="font-cairo"><SelectValue placeholder="اختر النقلة" /></SelectTrigger>
                <SelectContent>
                  {(purchases ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)} className="font-cairo text-xs">
                      {p.supplier_name} — {p.quantity_tons} طن — {p.created_at ? format(new Date(p.created_at), "yyyy/MM/dd") : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPurchase && (
                <p className="text-xs font-cairo text-muted-foreground">
                  سعر الشراء: {fmt(Number(selectedPurchase.price_per_ton))} / طن
                </p>
              )}
            </div>

            {/* Station */}
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
                <Label className="font-cairo">سعر البيع (ج.م/طن) *</Label>
                <Input type="number" value={saleForm.price_per_ton} onChange={(e) => setSaleForm((f) => ({ ...f, price_per_ton: e.target.value }))} className="font-cairo" min={0} />
              </div>
            </div>

            {saleTotal > 0 && (
              <div className="bg-muted rounded-md p-2 text-center space-y-1">
                <div>
                  <span className="font-cairo text-sm text-muted-foreground">الإجمالي: </span>
                  <span className="font-cairo font-bold text-primary">{fmt(saleTotal)}</span>
                </div>
                {selectedPurchase && (
                  <div>
                    <span className="font-cairo text-xs text-muted-foreground">الربح المتوقع: </span>
                    <span className={`font-cairo text-xs font-bold ${(Number(saleForm.price_per_ton) - Number(selectedPurchase.price_per_ton)) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {fmt((Number(saleForm.price_per_ton) - Number(selectedPurchase.price_per_ton)) * Number(saleForm.quantity_tons))}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label className="font-cairo">طريقة الدفع</Label>
              <Select value={saleForm.payment_method} onValueChange={(v) => setSaleForm((f) => ({ ...f, payment_method: v }))}>
                <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash" className="font-cairo">كاش</SelectItem>
                  <SelectItem value="concrete_deduction" className="font-cairo">خصم من خرسانة</SelectItem>
                  <SelectItem value="mixed" className="font-cairo">مختلط (كاش + خصم)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {saleForm.payment_method === "mixed" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-cairo">مبلغ كاش</Label>
                  <Input type="number" value={saleForm.cash_amount} onChange={(e) => setSaleForm((f) => ({ ...f, cash_amount: e.target.value }))} className="font-cairo" min={0} />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-cairo">خصم خرسانة</Label>
                  <Input type="number" value={saleForm.concrete_deduction_amount} onChange={(e) => setSaleForm((f) => ({ ...f, concrete_deduction_amount: e.target.value }))} className="font-cairo" min={0} />
                </div>
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
              if (!saleForm.purchase_id) { toast({ title: "اختر النقلة", variant: "destructive" }); return; }
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-cairo text-right">هل أنت متأكد من حذف هذا السجل؟</AlertDialogTitle>
            <AlertDialogDescription className="font-cairo text-right">
              سيتم حذف السجل والسجلات المرتبطة به نهائياً ولا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <AlertDialogAction
              className="font-cairo bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePurchaseMutation.isPending || deleteSaleMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "purchase") deletePurchaseMutation.mutate(deleteTarget.record);
                else deleteSaleMutation.mutate(deleteTarget.record);
                setDeleteTarget(null);
              }}
            >
              {(deletePurchaseMutation.isPending || deleteSaleMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              حذف
            </AlertDialogAction>
            <AlertDialogCancel className="font-cairo">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
