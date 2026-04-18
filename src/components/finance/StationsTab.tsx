import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, ArrowRight, Download, Send, Pencil, Trash2, Plus } from "lucide-react";
import { sendStatementWhatsApp } from "@/lib/statement-pdf";
import { generateStationStatementPDF, StationStatementPDFData } from "@/lib/station-statement-pdf";
import { toast } from "sonner";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "كاش", bank_transfer: "تحويل بنكي", check: "شيك", online: "أونلاين",
  cement: "أسمنت", concrete_deduction: "خصم خرسانة", mixed: "مختلط",
  deduction: "خصم من مديونية ركيزة",
  balance_only: "رصيد فقط", cash_full: "كاش كامل", cash_partial: "كاش جزئي",
  deduction_full: "خصم كامل من مديونيتي", deduction_partial: "خصم جزئي من مديونيتي",
};

function extractClientName(notes: string | null): string {
  if (!notes) return "—";
  const match = notes.match(/صبة عميل:\s*(.+)/);
  return match ? match[1].trim() : notes;
}

interface StationSummary {
  id: number;
  name: string;
  totalPours: number;
  totalCredit: number;   // على المحطة لركيزة (يزيد دين المحطة)
  totalDebit: number;    // على ركيزة للمحطة (يزيد دين ركيزة)
  finalBalance: number;  // = totalCredit - totalDebit
  // Legacy aggregates for backwards-compatible PDF/table fields
  totalCost: number;
  totalPaid: number;
  cementBalance: number;
}

// Debit/Credit model:
//  CREDIT (+) = على المحطة لركيزة → station owes Rakeza more (or Rakeza paid down its debt)
//  DEBIT  (−) = على ركيزة للمحطة → Rakeza owes station more (or station paid down its debt)
const CREDIT_TYPES = new Set([
  "cement_sale",          // بيع أسمنت  → المحطة عليها
  "cement_deduct",        // خصم مديونية ركيزة → بيقلل دين ركيزة = credit
  "rakeza_cash_payment",  // ركيزة دفعت كاش للمحطة → بيقلل دين ركيزة = credit
  "payment", "دفعة",       // legacy payment entries
]);
const DEBIT_TYPES = new Set([
  "concrete_purchase", "concrete", // شراء خرسانة → على ركيزة
  "cement_cash_paid",              // المحطة دفعت كاش للأسمنت → بيقلل دين المحطة = debit
  "cement_credit",                 // بيع أسمنت برصيد للمحطة → بيقلل دين المحطة = debit
]);

// Arabic labels for transaction types (used in unified ledger + dialog dropdown)
const TXN_LABELS_AR: Record<string, string> = {
  cement_sale: "بيع أسمنت للمحطة",
  concrete_purchase: "شراء خرسانة من المحطة",
  concrete: "شراء خرسانة من المحطة",
  cement_deduct: "خصم من مديونية ركيزة",
  cement_cash_paid: "المحطة دفعت كاش للأسمنت",
  cement_credit: "بيع أسمنت برصيد",
  rakeza_cash_payment: "ركيزة دفعت للمحطة",
  payment: "دفعة",
  دفعة: "دفعة",
  cement: "أسمنت",
  cement_payment: "دفعة أسمنت",
  cement_deduction: "خصم أسمنت",
};

// Transaction options for the unified add/edit form (with quantity hints)
const TXN_FORM_OPTIONS: Array<{ value: string; label: string; hasQty: "cement" | "concrete" | null }> = [
  { value: "cement_sale", label: "بيع أسمنت للمحطة", hasQty: "cement" },
  { value: "concrete_purchase", label: "شراء خرسانة من المحطة", hasQty: "concrete" },
  { value: "cement_deduct", label: "خصم من مديونية ركيزة", hasQty: null },
  { value: "cement_cash_paid", label: "المحطة دفعت كاش للأسمنت", hasQty: null },
  { value: "rakeza_cash_payment", label: "ركيزة دفعت للمحطة", hasQty: null },
];

// Direction helper
function txnDirection(type: string): "credit" | "debit" | null {
  if (CREDIT_TYPES.has(type)) return "credit";
  if (DEBIT_TYPES.has(type)) return "debit";
  return null;
}

// Legacy aliases used elsewhere in the file (for the per-section tables)
const DEBT_TYPES = new Set(["concrete_purchase", "concrete"]);
const DEDUCT_TYPES = new Set(["payment", "دفعة", "rakeza_cash_payment"]);
const CEMENT_DETAIL_TYPES = new Set(["cement_sale", "cement_deduct", "cement_credit", "cement_cash_paid", "cement", "أسمنت"]);

export function StationsTab() {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedStation, setSelectedStation] = useState<StationSummary | null>(null);
  const [deleteRecordId, setDeleteRecordId] = useState<number | null>(null);

  // Unified add/edit dialog
  type TxnForm = {
    id: number | null;
    transaction_type: string;
    quantity: string;
    unit_price: string;
    amount: string;
    txn_date: string; // yyyy-mm-dd
    notes: string;
  };
  const emptyTxn: TxnForm = {
    id: null,
    transaction_type: "cement_sale",
    quantity: "",
    unit_price: "",
    amount: "",
    txn_date: new Date().toISOString().slice(0, 10),
    notes: "",
  };
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [txnForm, setTxnForm] = useState<TxnForm>(emptyTxn);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["finance-stations-tab"],
    queryFn: async () => {
      const { data: stations } = await supabase
        .from("stations")
        .select("id, name")
        .order("name");

      const { data: txns } = await supabase
        .from("station_accounts" as any)
        .select("station_id, transaction_type, amount, quantity_m3, cement_tons, cement_price_per_ton, pour_order_id")
        .order("created_at", { ascending: false });

      const map = new Map<number, StationSummary>();
      (stations ?? []).forEach((s: any) => {
        map.set(s.id, {
          id: s.id, name: s.name,
          totalPours: 0,
          totalCredit: 0, totalDebit: 0,
          finalBalance: 0,
          totalCost: 0, totalPaid: 0, cementBalance: 0,
        });
      });

      // Deduplicate concrete pours by pour_order_id per station
      const seenPour = new Map<number, Set<number>>();
      (txns ?? []).forEach((t: any) => {
        const acc = map.get(t.station_id);
        if (!acc) return;
        const amt = Number(t.amount) || 0;
        const type = t.transaction_type;
        const dir = txnDirection(type);
        if (!dir) return;

        // Dedup pours by pour_order_id
        if (DEBT_TYPES.has(type) && t.pour_order_id) {
          if (!seenPour.has(t.station_id)) seenPour.set(t.station_id, new Set());
          const set = seenPour.get(t.station_id)!;
          if (set.has(t.pour_order_id)) return;
          set.add(t.pour_order_id);
        }
        if (DEBT_TYPES.has(type)) acc.totalPours++;

        if (dir === "credit") acc.totalCredit += amt;
        else acc.totalDebit += amt;
      });

      map.forEach((acc) => {
        // Single rule: balance = credits − debits
        // Positive => station owes Rakeza (green); Negative => Rakeza owes station (red)
        acc.finalBalance = acc.totalCredit - acc.totalDebit;
        // Legacy fields for PDF compatibility
        acc.totalCost = acc.totalDebit;
        acc.totalPaid = acc.totalCredit;
        acc.cementBalance = acc.totalCredit;
      });

      return [...map.values()]
        .filter(a => a.totalCredit > 0 || a.totalDebit > 0)
        .sort((a, b) => Math.abs(b.finalBalance) - Math.abs(a.finalBalance));
    },
  });

  const { data: statement, isLoading: loadingStatement } = useQuery({
    queryKey: ["station-statement", selectedStation?.id],
    enabled: !!selectedStation,
    queryFn: async () => {
      const { data } = await supabase
        .from("station_accounts" as any)
        .select("*")
        .eq("station_id", selectedStation!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: cementSalesData } = useQuery({
    queryKey: ["station-cement-sales", selectedStation?.id],
    enabled: !!selectedStation,
    queryFn: async () => {
      const { data } = await supabase
        .from("cement_sales" as any)
        .select("*")
        .eq("station_id", selectedStation!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const invalidateStation = () => {
    queryClient.invalidateQueries({ queryKey: ["station-statement", selectedStation?.id] });
    queryClient.invalidateQueries({ queryKey: ["station-cement-sales", selectedStation?.id] });
    queryClient.invalidateQueries({ queryKey: ["finance-stations-tab"] });
  };

  const handleEditRecord = async () => {
    if (!editRecord) return;
    const updateData: any = {
      amount: Number(editRecord.amount),
      notes: editRecord.notes || null,
      payment_method: editRecord.payment_method || null,
    };
    if (editRecord.transaction_type === "concrete") {
      updateData.quantity_m3 = editRecord.quantity_m3 ? Number(editRecord.quantity_m3) : null;
      updateData.price_per_m3 = editRecord.price_per_m3 ? Number(editRecord.price_per_m3) : null;
    }
    if (editRecord.transaction_type === "cement" || editRecord.transaction_type === "cement_sale") {
      updateData.cement_tons = editRecord.cement_tons ? Number(editRecord.cement_tons) : null;
      updateData.cement_price_per_ton = editRecord.cement_price_per_ton ? Number(editRecord.cement_price_per_ton) : null;
    }
    const { error } = await supabase.from("station_accounts" as any).update(updateData).eq("id", editRecord.id);
    if (error) {
      toast.error("فشل التحديث");
    } else {
      toast.success("تم التحديث بنجاح");
      invalidateStation();
    }
    setEditRecord(null);
  };

  const handleDeleteRecord = async () => {
    if (!deleteRecordId) return;
    const { error } = await supabase.from("station_accounts" as any).delete().eq("id", deleteRecordId);
    if (error) {
      toast.error("فشل الحذف");
    } else {
      toast.success("تم الحذف بنجاح");
      invalidateStation();
    }
    setDeleteRecordId(null);
  };

  const handleDeleteCementSale = async () => {
    if (!deleteCementSaleId) return;
    // Get the sale record first to find related station_accounts
    const { data: sale } = await supabase.from("cement_sales" as any).select("*").eq("id", deleteCementSaleId).single();
    if (sale) {
      // Delete related station_accounts by matching created_at and station_id
      await supabase.from("station_accounts" as any).delete()
        .eq("station_id", sale.station_id)
        .eq("created_at", sale.created_at);
    }
    // Delete the cement_sales record
    const { error } = await supabase.from("cement_sales" as any).delete().eq("id", deleteCementSaleId);
    if (error) {
      toast.error("فشل الحذف");
    } else {
      toast.success("تم الحذف بنجاح");
      invalidateStation();
    }
    setDeleteCementSaleId(null);
  };
  const filtered = (accounts ?? []).filter((a) => a.name.includes(search));

  // Deduplicate pours (treat both legacy "concrete" and new "concrete_purchase" as pours)
  const poursAll = (statement ?? []).filter((t: any) => DEBT_TYPES.has(t.transaction_type));
  const seen = new Set<number>();
  const pours = poursAll.filter((t: any) => {
    if (!t.pour_order_id) return true;
    if (seen.has(t.pour_order_id)) return false;
    seen.add(t.pour_order_id);
    return true;
  });
  const payments = (statement ?? []).filter((t: any) => DEDUCT_TYPES.has(t.transaction_type) && !CEMENT_DETAIL_TYPES.has(t.transaction_type));
  const cementSales = (statement ?? []).filter((t: any) => CEMENT_DETAIL_TYPES.has(t.transaction_type));

  // Recalculate totals from statement data using the new debit/credit rule
  const statementTotals = (() => {
    if (!statement || !statement.length) return null;
    let totalCredit = 0, totalDebit = 0;
    const seenPour = new Set<number>();
    (statement as any[]).forEach((t: any) => {
      const amt = Number(t.amount) || 0;
      const type = t.transaction_type;
      const dir = txnDirection(type);
      if (!dir) return;
      // Dedup pours by pour_order_id
      if (DEBT_TYPES.has(type) && t.pour_order_id) {
        if (seenPour.has(t.pour_order_id)) return;
        seenPour.add(t.pour_order_id);
      }
      if (dir === "credit") totalCredit += amt;
      else totalDebit += amt;
    });
    const finalBalance = totalCredit - totalDebit;
    return {
      totalCredit, totalDebit, finalBalance,
      totalCost: totalDebit,
      totalPaid: totalCredit,
      cementBalance: totalCredit,
    };
  })();

  // Build a unified ledger (date-sorted, cumulative balance) for the statement view
  const ledger = (() => {
    if (!statement) return [] as Array<any>;
    const seenPour = new Set<number>();
    const rows = (statement as any[])
      .filter((t: any) => {
        const dir = txnDirection(t.transaction_type);
        if (!dir) return false;
        if (DEBT_TYPES.has(t.transaction_type) && t.pour_order_id) {
          if (seenPour.has(t.pour_order_id)) return false;
          seenPour.add(t.pour_order_id);
        }
        return true;
      })
      .map((t: any) => ({
        ...t,
        _dir: txnDirection(t.transaction_type)!,
        _amount: Number(t.amount) || 0,
      }))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let running = 0;
    return rows.map((r) => {
      running += r._dir === "credit" ? r._amount : -r._amount;
      return { ...r, _running: running };
    });
  })();

  const buildStationPDFData = (station: StationSummary): StationStatementPDFData => {
    const totals = statementTotals ?? station;
    
    const pourRows = pours.map((t: any) => ({
      date: t.created_at ? new Date(t.created_at).toLocaleDateString("en-GB") : "—",
      clientName: t.client_name || extractClientName(t.notes),
      quantity: String(t.quantity_m3 ?? "—"),
      purchasePrice: t.price_per_m3 ? fmt(Number(t.price_per_m3)) : "—",
      total: fmt(Number(t.amount) || 0),
    }));

    const cementRows = (cementSalesData ?? []).map((s: any) => {
      const saleTotal = Number(s.total_amount) || (Number(s.quantity_tons) * Number(s.sale_price_per_ton || s.price_per_ton));
      const cashPaid = Number(s.cash_amount) || 0;
      const deducted = Number(s.concrete_deduction_amount) || 0;
      const remaining = saleTotal - cashPaid - deducted;
      return {
        date: s.created_at ? new Date(s.created_at).toLocaleDateString("en-GB") : "—",
        quantity: String(s.quantity_tons ?? "—"),
        pricePerTon: s.sale_price_per_ton ? fmt(Number(s.sale_price_per_ton)) : (s.price_per_ton ? fmt(Number(s.price_per_ton)) : "—"),
        total: fmt(saleTotal),
        paymentMethod: METHOD_LABELS[s.payment_method] ?? s.payment_method ?? "—",
        cashPaid: cashPaid > 0 ? fmt(cashPaid) : "—",
        deducted: deducted > 0 ? fmt(deducted) : "—",
        remaining: fmt(remaining),
        notes: s.notes ?? "—",
      };
    });

    const paymentRows = payments.map((t: any) => ({
      date: t.created_at ? new Date(t.created_at).toLocaleDateString("en-GB") : "—",
      amount: fmt(Number(t.amount) || 0),
      method: METHOD_LABELS[t.payment_method] ?? t.payment_method ?? "—",
      notes: t.notes ?? "—",
    }));

    return {
      stationName: station.name,
      totals: {
        totalCost: totals.totalCost,
        cementBalance: totals.cementBalance,
        totalPaid: totals.totalPaid,
        finalBalance: totals.finalBalance,
      },
      pours: pourRows,
      cementSales: cementRows,
      payments: paymentRows,
    };
  };

  const handleDownloadPDF = (station: StationSummary) => {
    const pdfData = buildStationPDFData(station);
    generateStationStatementPDF(pdfData);
  };

  const handleWhatsAppPDF = (station: StationSummary) => {
    const pdfData = buildStationPDFData(station);
    generateStationStatementPDF(pdfData);

    setTimeout(() => {
      sendStatementWhatsApp(null, station.name);
    }, 500);
  };

  // ──── Full-page statement view ────
  if (selectedStation) {
    const todayStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const totals = statementTotals ?? selectedStation;

    return (
      <div dir="rtl" className="min-h-screen print:p-0" style={{ background: "#fff" }}>
        {/* Header */}
        <div style={{ background: "#1B3A6B" }} className="w-full px-5 py-5">
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div>
              <h1 className="font-cairo font-bold text-white" style={{ fontSize: 28 }}>شركة ركيزة</h1>
              <p className="text-white/80 font-cairo" style={{ fontSize: 14 }}>لتوريد الخرسانة الجاهزة | جمهورية مصر العربية</p>
              <p className="text-white font-cairo mt-1" style={{ fontSize: 16 }}>كشف حساب محطة</p>
            </div>
            <div className="text-left space-y-1">
              <p className="text-white font-cairo" style={{ fontSize: 14 }}>المحطة: {selectedStation.name}</p>
              <p className="text-white/80 font-cairo" style={{ fontSize: 13 }}>التاريخ: {todayStr}</p>
            </div>
          </div>
        </div>
        {/* Gold stripe */}
        <div style={{ background: "#F5A623", height: 4 }} />

        {/* Summary cards (debit / credit / balance) */}
        <div style={{ background: "#F8F9FA" }} className="px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs font-cairo text-muted-foreground">على المحطة لركيزة (إجمالي دائن)</p>
                <p className="font-cairo font-bold text-lg text-chart-2">{fmt(totals.totalPaid)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs font-cairo text-muted-foreground">على ركيزة للمحطة (إجمالي مدين)</p>
                <p className="font-cairo font-bold text-lg text-destructive">{fmt(totals.totalCost)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs font-cairo text-muted-foreground">الرصيد النهائي</p>
                <p className={`font-cairo font-bold text-lg ${totals.finalBalance > 0 ? "text-chart-2" : totals.finalBalance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {fmt(Math.abs(totals.finalBalance))}
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    {totals.finalBalance > 0 ? "✅ المحطة مدينة لركيزة" : totals.finalBalance < 0 ? "❌ ركيزة مدينة للمحطة" : "متساوي"}
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Unified ledger (debit/credit + running balance) */}
        <div className="px-5 py-4">
          <h3 className="font-cairo font-bold mb-3" style={{ color: "#1B3A6B", fontSize: 16 }}>كشف الحساب التفصيلي (مدين/دائن)</h3>
          {loadingStatement ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !ledger.length ? (
            <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا توجد عمليات</p>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#1B3A6B" }}>
                    {["التاريخ", "نوع العملية", "مدين", "دائن", "الرصيد التراكمي"].map((h, idx) => (
                      <th key={idx} className="font-cairo text-white text-right px-3 py-2.5 text-xs whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((r: any, i: number) => (
                    <tr key={`${r.id}-${i}`} style={{ background: i % 2 === 0 ? "#fff" : "#F0F4FF", borderBottom: "1px solid #E5E7EB" }}>
                      <td className="font-cairo px-3 py-2.5 text-xs whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString("ar-EG") : "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">
                        <Badge variant="outline" className="text-[10px] font-cairo">
                          {TXN_LABELS_AR[r.transaction_type] ?? r.transaction_type}
                        </Badge>
                      </td>
                      <td className="font-cairo px-3 py-2.5 text-xs font-bold text-destructive">
                        {r._dir === "debit" ? fmt(r._amount) : "—"}
                      </td>
                      <td className="font-cairo px-3 py-2.5 text-xs font-bold text-chart-2">
                        {r._dir === "credit" ? fmt(r._amount) : "—"}
                      </td>
                      <td className={`font-cairo px-3 py-2.5 text-xs font-bold ${r._running > 0 ? "text-chart-2" : r._running < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {fmt(Math.abs(r._running))} {r._running > 0 ? "(دائن)" : r._running < 0 ? "(مدين)" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pours table */}
        <div className="px-5 py-4">
          <h3 className="font-cairo font-bold mb-3" style={{ color: "#1B3A6B", fontSize: 16 }}>صبات الخرسانة</h3>
          {loadingStatement ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !pours.length ? (
            <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا توجد صبات</p>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#1B3A6B" }}>
                    {["التاريخ", "اسم العميل", "الكمية (م³)", "سعر الشراء", "الإجمالي", ...(isAdmin ? [""] : [])].map((h, idx) => (
                      <th key={idx} className="font-cairo text-white text-right px-3 py-2.5 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pours.map((t: any, i: number) => (
                    <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#F0F4FF", borderBottom: "1px solid #E5E7EB" }}>
                      <td className="font-cairo px-3 py-2.5 text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">{t.client_name || extractClientName(t.notes)}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">{t.quantity_m3 ?? "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">{t.price_per_m3 ? fmt(Number(t.price_per_m3)) : "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs font-bold">{fmt(Number(t.amount) || 0)}</td>
                      {isAdmin && (
                        <td className="px-2 py-2.5 print:hidden">
                          <div className="flex gap-1">
                            <button onClick={() => setEditRecord({ ...t })} className="text-muted-foreground hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setDeleteRecordId(t.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cement Sales - from cement_sales table */}
        {(cementSalesData ?? []).length > 0 && (
          <div className="px-5 py-4">
            <h3 className="font-cairo font-bold mb-3" style={{ color: "#1B3A6B", fontSize: 16 }}>مبيعات الأسمنت</h3>
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#1B3A6B" }}>
                    {["التاريخ", "الكمية (طن)", "سعر الطن", "الإجمالي", "طريقة الدفع", "كاش مدفوع", "خصم من مديونية", "الرصيد المتبقي", "ملاحظات", ...(isAdmin ? [""] : [])].map((h, idx) => (
                      <th key={idx} className="font-cairo text-white text-right px-3 py-2.5 text-xs whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(cementSalesData ?? []).map((s: any, i: number) => {
                    const saleTotal = Number(s.total_amount) || (Number(s.quantity_tons) * Number(s.sale_price_per_ton || s.price_per_ton));
                    const cashPaid = Number(s.cash_amount) || 0;
                    const deducted = Number(s.concrete_deduction_amount) || 0;
                    const remaining = saleTotal - cashPaid - deducted;
                    return (
                      <tr key={s.id} style={{ background: i % 2 === 0 ? "#fff" : "#F0F4FF", borderBottom: "1px solid #E5E7EB" }}>
                        <td className="font-cairo px-3 py-2.5 text-xs whitespace-nowrap">{s.created_at ? new Date(s.created_at).toLocaleDateString("ar-EG") : "—"}</td>
                        <td className="font-cairo px-3 py-2.5 text-xs">{s.quantity_tons ?? "—"}</td>
                        <td className="font-cairo px-3 py-2.5 text-xs">{s.sale_price_per_ton ? fmt(Number(s.sale_price_per_ton)) : (s.price_per_ton ? fmt(Number(s.price_per_ton)) : "—")}</td>
                        <td className="font-cairo px-3 py-2.5 text-xs font-bold">{fmt(saleTotal)}</td>
                        <td className="font-cairo px-3 py-2.5 text-xs">
                          <Badge variant="outline" className="text-[10px] whitespace-nowrap">{METHOD_LABELS[s.payment_method] ?? s.payment_method ?? "—"}</Badge>
                        </td>
                        <td className="font-cairo px-3 py-2.5 text-xs" style={{ color: cashPaid > 0 ? "#16A34A" : undefined }}>{cashPaid > 0 ? fmt(cashPaid) : "—"}</td>
                        <td className="font-cairo px-3 py-2.5 text-xs" style={{ color: deducted > 0 ? "#F59E0B" : undefined }}>{deducted > 0 ? fmt(deducted) : "—"}</td>
                        <td className="font-cairo px-3 py-2.5 text-xs font-bold" style={{ color: remaining > 0 ? "#DC2626" : "#16A34A" }}>{fmt(remaining)}</td>
                        <td className="font-cairo px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[120px]">{s.notes ?? "—"}</td>
                        {isAdmin && (
                          <td className="px-2 py-2.5 print:hidden">
                            <div className="flex gap-1">
                              <button onClick={() => setEditRecord({ ...s, _source: "cement_sales" })} className="text-muted-foreground hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setDeleteCementSaleId(s.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payments */}
        <div className="px-5 py-4">
          <h3 className="font-cairo font-bold mb-3" style={{ color: "#1B3A6B", fontSize: 16 }}>المدفوعات</h3>
          {!payments.length ? (
            <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا توجد مدفوعات</p>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#1B3A6B" }}>
                    {["التاريخ", "المبلغ", "طريقة الدفع", "ملاحظات", ...(isAdmin ? [""] : [])].map((h, idx) => (
                      <th key={idx} className="font-cairo text-white text-right px-3 py-2.5 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((t: any, i: number) => (
                    <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#F0F4FF", borderBottom: "1px solid #E5E7EB" }}>
                      <td className="font-cairo px-3 py-2.5 text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs font-bold" style={{ color: "#16A34A" }}>{fmt(Number(t.amount) || 0)}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">
                        <Badge variant="outline" className="text-[10px]">{METHOD_LABELS[t.payment_method] ?? t.payment_method ?? "—"}</Badge>
                      </td>
                      <td className="font-cairo px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[120px]">{t.notes ?? "—"}</td>
                      {isAdmin && (
                        <td className="px-2 py-2.5 print:hidden">
                          <div className="flex gap-1">
                            <button onClick={() => setEditRecord({ ...t })} className="text-muted-foreground hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setDeleteRecordId(t.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ background: "#F5A623", height: 4 }} className="mt-4" />
        <div className="text-center py-3">
          <p className="font-cairo text-sm text-muted-foreground">شركة ركيزة لتوريد الخرسانة الجاهزة</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 px-5 py-5 border-t print:hidden">
          <Button onClick={() => handleDownloadPDF(selectedStation)} className="w-full font-cairo gap-2 text-white" style={{ background: "#1B3A6B" }}>
            <Download className="h-4 w-4" />
            تحميل PDF
          </Button>
          <Button onClick={() => handleWhatsAppPDF(selectedStation)} className="w-full font-cairo gap-2 text-white" style={{ background: "#28A745" }}>
            <Send className="h-4 w-4" />
            إرسال كشف حساب واتساب
          </Button>
          <Button variant="outline" onClick={() => setSelectedStation(null)} className="w-full font-cairo gap-2">
            <ArrowRight className="h-4 w-4" />
            رجوع للقائمة
          </Button>
        </div>

        {/* Edit Record Dialog */}
        <Dialog open={!!editRecord} onOpenChange={(open) => !open && setEditRecord(null)}>
          <DialogContent dir="rtl" className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="font-cairo text-right">تعديل السجل</DialogTitle></DialogHeader>
            {editRecord && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="font-cairo">المبلغ</Label>
                  <Input type="number" value={editRecord.amount} onChange={(e) => setEditRecord((r: any) => ({ ...r, amount: e.target.value }))} className="font-cairo" />
                </div>
                {editRecord.transaction_type === "concrete" && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="font-cairo">الكمية (م³)</Label>
                      <Input type="number" value={editRecord.quantity_m3 ?? ""} onChange={(e) => setEditRecord((r: any) => ({ ...r, quantity_m3: e.target.value }))} className="font-cairo" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-cairo">سعر الشراء/م³</Label>
                      <Input type="number" value={editRecord.price_per_m3 ?? ""} onChange={(e) => setEditRecord((r: any) => ({ ...r, price_per_m3: e.target.value }))} className="font-cairo" />
                    </div>
                  </>
                )}
                {(editRecord.transaction_type === "cement" || editRecord.transaction_type === "cement_sale" || editRecord.transaction_type === "cement_deduction") && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="font-cairo">الكمية (طن)</Label>
                      <Input type="number" value={editRecord.cement_tons ?? ""} onChange={(e) => setEditRecord((r: any) => ({ ...r, cement_tons: e.target.value }))} className="font-cairo" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-cairo">سعر الطن</Label>
                      <Input type="number" value={editRecord.cement_price_per_ton ?? ""} onChange={(e) => setEditRecord((r: any) => ({ ...r, cement_price_per_ton: e.target.value }))} className="font-cairo" />
                    </div>
                  </>
                )}
                {(editRecord.transaction_type === "payment" || editRecord.transaction_type === "دفعة") && (
                  <div className="space-y-1.5">
                    <Label className="font-cairo">طريقة الدفع</Label>
                    <Select value={editRecord.payment_method ?? ""} onValueChange={(v) => setEditRecord((r: any) => ({ ...r, payment_method: v }))}>
                      <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash" className="font-cairo">كاش</SelectItem>
                        <SelectItem value="bank_transfer" className="font-cairo">تحويل بنكي</SelectItem>
                        <SelectItem value="check" className="font-cairo">شيك</SelectItem>
                        <SelectItem value="concrete_deduction" className="font-cairo">خصم خرسانة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="font-cairo">ملاحظات</Label>
                  <Textarea value={editRecord.notes ?? ""} onChange={(e) => setEditRecord((r: any) => ({ ...r, notes: e.target.value }))} className="font-cairo" rows={2} />
                </div>
              </div>
            )}
            <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
              <Button onClick={handleEditRecord} className="font-cairo">حفظ التعديلات</Button>
              <Button variant="outline" onClick={() => setEditRecord(null)} className="font-cairo">إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteRecordId} onOpenChange={(open) => !open && setDeleteRecordId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-cairo">هل تريد حذف هذا السجل؟</AlertDialogTitle>
              <AlertDialogDescription className="font-cairo">سيتم حذف السجل نهائياً وتحديث الأرقام.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex gap-2">
              <AlertDialogCancel className="font-cairo">إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteRecord} className="font-cairo bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Cement Sale Confirmation */}
        <AlertDialog open={!!deleteCementSaleId} onOpenChange={(open) => !open && setDeleteCementSaleId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-cairo">هل أنت متأكد من حذف هذا السجل؟</AlertDialogTitle>
              <AlertDialogDescription className="font-cairo">سيتم حذف سجل بيع الأسمنت والسجلات المرتبطة في حساب المحطة نهائياً.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex gap-2">
              <AlertDialogCancel className="font-cairo">إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCementSale} className="font-cairo bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ──── Station list view ────
  if (isLoading) {
    return <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث عن محطة..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 font-cairo h-9" />
      </div>

      {!filtered.length ? (
        <p className="text-center text-muted-foreground font-cairo py-12">لا توجد بيانات</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((a) => {
            const isStationDebt = a.finalBalance > 0;   // station owes Rakeza (green ✅)
            const isRakezaDebt = a.finalBalance < 0;    // Rakeza owes station (red ❌)
            return (
              <Card
                key={a.id}
                className="cursor-pointer hover:shadow-md transition-shadow border-border/60"
                onClick={() => setSelectedStation(a)}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <h3 className="font-cairo font-bold text-primary text-base">{a.name}</h3>
                      <Badge variant="secondary" className="font-cairo text-[10px]">
                        {a.totalPours} صبة
                      </Badge>
                    </div>
                    <Badge
                      className={`font-cairo text-[10px] ${
                        isStationDebt
                          ? "bg-chart-2/15 text-chart-2 hover:bg-chart-2/15"
                          : isRakezaDebt
                          ? "bg-destructive/15 text-destructive hover:bg-destructive/15"
                          : "bg-muted text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {isStationDebt ? "✅ على المحطة" : isRakezaDebt ? "❌ على ركيزة" : "متساوي"}
                    </Badge>
                  </div>

                  {isAdmin && (
                    <>
                      {/* 2 buckets: credit / debit */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-chart-2/30 bg-chart-2/5 p-2">
                          <p className="text-[11px] font-cairo text-muted-foreground">على المحطة لركيزة (دائن)</p>
                          <p className="font-cairo font-bold text-sm text-chart-2">{fmt(a.totalCredit)}</p>
                        </div>
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                          <p className="text-[11px] font-cairo text-muted-foreground">على ركيزة للمحطة (مدين)</p>
                          <p className="font-cairo font-bold text-sm text-destructive">{fmt(a.totalDebit)}</p>
                        </div>
                      </div>

                      {/* Final balance */}
                      <div
                        className={`rounded-md p-2.5 border-2 ${
                          isStationDebt
                            ? "border-chart-2/40 bg-chart-2/10"
                            : isRakezaDebt
                            ? "border-destructive/40 bg-destructive/10"
                            : "border-muted bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-cairo font-semibold text-muted-foreground">الرصيد النهائي</p>
                          <p
                            className={`font-cairo font-bold text-base text-left ${
                              isStationDebt ? "text-chart-2" : isRakezaDebt ? "text-destructive" : "text-muted-foreground"
                            }`}
                          >
                            {fmt(Math.abs(a.finalBalance))}
                            <span className="block text-[10px] font-normal">
                              {isStationDebt ? "المحطة مدينة لركيزة" : isRakezaDebt ? "ركيزة مدينة للمحطة" : "متساوي"}
                            </span>
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
