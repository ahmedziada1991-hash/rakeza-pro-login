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
import { Search, ArrowRight, Download, Send, Pencil, Trash2 } from "lucide-react";
import { generateStatementPDF, sendStatementWhatsApp } from "@/lib/statement-pdf";
import { toast } from "sonner";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "كاش", bank_transfer: "تحويل بنكي", check: "شيك", online: "أونلاين",
  cement: "أسمنت", concrete_deduction: "خصم خرسانة", mixed: "مختلط",
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
  totalCost: number;
  totalPaid: number;
  cementBalance: number;
  finalBalance: number;
}

export function StationsTab() {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedStation, setSelectedStation] = useState<StationSummary | null>(null);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [deleteRecordId, setDeleteRecordId] = useState<number | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["finance-stations-tab"],
    queryFn: async () => {
      const { data: stations } = await supabase
        .from("stations")
        .select("id, name")
        .order("name");

      const { data: txns } = await supabase
        .from("station_accounts" as any)
        .select("station_id, transaction_type, amount, quantity_m3, cement_tons, cement_price_per_ton")
        .order("created_at", { ascending: false });

      const map = new Map<number, StationSummary>();
      (stations ?? []).forEach((s: any) => {
        map.set(s.id, {
          id: s.id, name: s.name,
          totalPours: 0, totalCost: 0, totalPaid: 0, cementBalance: 0, finalBalance: 0,
        });
      });

      (txns ?? []).forEach((t: any) => {
        const acc = map.get(t.station_id);
        if (!acc) return;
        const amt = Number(t.amount) || 0;
        const type = t.transaction_type;
        if (type === "concrete") {
          acc.totalPours++;
          acc.totalCost += amt;
        } else if (type === "payment" || type === "دفعة") {
          acc.totalPaid += amt;
        } else if (type === "cement" || type === "أسمنت" || type === "cement_sale" || type === "cement_deduction") {
          acc.cementBalance += amt;
        }
      });

      map.forEach((acc) => {
        acc.finalBalance = acc.totalCost - acc.totalPaid - acc.cementBalance;
      });

      return [...map.values()].filter(a => a.totalPours > 0 || a.totalPaid > 0 || a.cementBalance > 0).sort((a, b) => b.finalBalance - a.finalBalance);
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
    if (editRecord.transaction_type === "cement" || editRecord.transaction_type === "cement_sale" || editRecord.transaction_type === "cement_deduction") {
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
  const filtered = (accounts ?? []).filter((a) => a.name.includes(search));

  // Deduplicate pours
  const poursAll = (statement ?? []).filter((t: any) => t.transaction_type === "concrete");
  const seen = new Set<number>();
  const pours = poursAll.filter((t: any) => {
    if (!t.pour_order_id) return true;
    if (seen.has(t.pour_order_id)) return false;
    seen.add(t.pour_order_id);
    return true;
  });
  const payments = (statement ?? []).filter((t: any) => t.transaction_type === "payment" || t.transaction_type === "دفعة");
  const cementSales = (statement ?? []).filter((t: any) => t.transaction_type === "cement" || t.transaction_type === "أسمنت" || t.transaction_type === "cement_sale" || t.transaction_type === "cement_deduction");

  // Recalculate totals from statement data
  const statementTotals = (() => {
    if (!statement || !statement.length) return null;
    let totalCost = 0, totalPaid = 0, cementBalance = 0;
    const seenPour = new Set<number>();
    (statement as any[]).forEach((t: any) => {
      const amt = Number(t.amount) || 0;
      if (t.transaction_type === "concrete") {
        if (t.pour_order_id && seenPour.has(t.pour_order_id)) return;
        if (t.pour_order_id) seenPour.add(t.pour_order_id);
        totalCost += amt;
      } else if (t.transaction_type === "payment" || t.transaction_type === "دفعة") {
        totalPaid += amt;
      } else if (t.transaction_type === "cement" || t.transaction_type === "أسمنت" || t.transaction_type === "cement_sale" || t.transaction_type === "cement_deduction") {
        cementBalance += amt;
      }
    });
    return { totalCost, totalPaid, cementBalance, finalBalance: totalCost - totalPaid - cementBalance };
  })();

  const handlePrint = () => { window.print(); };

  const handleWhatsAppPDF = (station: StationSummary) => {
    const totals = statementTotals ?? station;
    const transactions: { date: string; description: string; amount: number }[] = [];

    pours.forEach((t: any) => {
      transactions.push({
        date: t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—",
        description: `Concrete - ${t.quantity_m3 ?? 0} m³ (${t.client_name || extractClientName(t.notes)})`,
        amount: Number(t.amount) || 0,
      });
    });

    cementSales.forEach((t: any) => {
      transactions.push({
        date: t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—",
        description: `Cement - ${t.cement_tons ?? 0} ton`,
        amount: -(Number(t.amount) || 0),
      });
    });

    payments.forEach((t: any) => {
      transactions.push({
        date: t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—",
        description: `Payment`,
        amount: -(Number(t.amount) || 0),
      });
    });

    transactions.sort((a, b) => a.date.localeCompare(b.date));

    generateStatementPDF({
      entityName: station.name,
      entityType: "محطة",
      transactions,
      totalDebt: totals.totalCost,
      totalPaid: totals.totalPaid + totals.cementBalance,
      balance: totals.finalBalance,
    });

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

        {/* Summary cards */}
        <div style={{ background: "#F8F9FA" }} className="px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs font-cairo text-muted-foreground">مديونية خرسانة</p>
                <p className="font-cairo font-bold text-lg" style={{ color: "#DC2626" }}>{fmt(totals.totalCost)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs font-cairo text-muted-foreground">المدفوع</p>
                <p className="font-cairo font-bold text-lg" style={{ color: "#16A34A" }}>{fmt(totals.totalPaid)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs font-cairo text-muted-foreground">خصم أسمنت</p>
                <p className="font-cairo font-bold text-lg" style={{ color: "#F59E0B" }}>{fmt(totals.cementBalance)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs font-cairo text-muted-foreground">الرصيد النهائي</p>
                <p className="font-cairo font-bold text-lg" style={{ color: "#1B3A6B" }}>{fmt(totals.finalBalance)}</p>
              </CardContent>
            </Card>
          </div>
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

        {/* Cement Sales */}
        {cementSales.length > 0 && (
          <div className="px-5 py-4">
            <h3 className="font-cairo font-bold mb-3" style={{ color: "#1B3A6B", fontSize: 16 }}>مبيعات الأسمنت</h3>
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#1B3A6B" }}>
                    {["التاريخ", "الكمية (طن)", "سعر الطن", "الإجمالي", ...(isAdmin ? [""] : [])].map((h, idx) => (
                      <th key={idx} className="font-cairo text-white text-right px-3 py-2.5 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cementSales.map((t: any, i: number) => (
                    <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#F0F4FF", borderBottom: "1px solid #E5E7EB" }}>
                      <td className="font-cairo px-3 py-2.5 text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">{t.cement_tons ?? "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">{t.cement_price_per_ton ? fmt(Number(t.cement_price_per_ton)) : "—"}</td>
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
          <Button onClick={handlePrint} className="w-full font-cairo gap-2 text-white" style={{ background: "#1B3A6B" }}>
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
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-cairo text-right">المحطة</TableHead>
                <TableHead className="font-cairo text-right">عدد الصبات</TableHead>
                {isAdmin && <TableHead className="font-cairo text-right">مديونية خرسانة</TableHead>}
                {isAdmin && <TableHead className="font-cairo text-right">المدفوع</TableHead>}
                {isAdmin && <TableHead className="font-cairo text-right">خصم أسمنت</TableHead>}
                {isAdmin && <TableHead className="font-cairo text-right">الرصيد النهائي</TableHead>}
                <TableHead className="font-cairo text-right">نسبة السداد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const pct = a.totalCost > 0 ? Math.round(((a.totalPaid + a.cementBalance) / a.totalCost) * 100) : 0;
                return (
                  <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedStation(a)}>
                    <TableCell className="font-cairo font-medium text-primary underline-offset-2 hover:underline">{a.name}</TableCell>
                    <TableCell className="font-cairo">{a.totalPours}</TableCell>
                    {isAdmin && <TableCell className="font-cairo">{fmt(a.totalCost)}</TableCell>}
                    {isAdmin && <TableCell className="font-cairo text-chart-2">{fmt(a.totalPaid)}</TableCell>}
                    {isAdmin && <TableCell className="font-cairo text-chart-4">{fmt(a.cementBalance)}</TableCell>}
                    {isAdmin && <TableCell className={`font-cairo font-semibold ${a.finalBalance > 0 ? "text-destructive" : "text-chart-2"}`}>{fmt(a.finalBalance)}</TableCell>}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-chart-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
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
    </div>
  );
}
