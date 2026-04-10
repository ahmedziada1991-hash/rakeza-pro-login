import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ArrowRight, Download, Send } from "lucide-react";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "كاش", bank_transfer: "تحويل بنكي", check: "شيك", online: "أونلاين", cement: "أسمنت",
};

interface ClientSummary {
  id: number;
  name: string;
  phone: string | null;
  totalPours: number;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
}

export function ClientsTab() {
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["finance-clients-tab"],
    queryFn: async () => {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, phone")
        .order("name");

      const { data: txns } = await supabase
        .from("client_accounts" as any)
        .select("client_id, transaction_type, amount")
        .order("created_at", { ascending: false });

      const map = new Map<number, ClientSummary>();
      (clients ?? []).forEach((c: any) => {
        map.set(c.id, {
          id: c.id, name: c.name, phone: c.phone,
          totalPours: 0, totalAmount: 0, totalPaid: 0, remaining: 0,
        });
      });

      (txns ?? []).forEach((t: any) => {
        const acc = map.get(t.client_id);
        if (!acc) return;
        const amt = Number(t.amount) || 0;
        if (t.transaction_type === "pour" || t.transaction_type === "صبة") {
          acc.totalPours++;
          acc.totalAmount += amt;
        } else if (t.transaction_type === "payment" || t.transaction_type === "دفعة" || t.transaction_type === "تحصيل") {
          acc.totalPaid += amt;
        }
      });

      map.forEach((acc) => { acc.remaining = acc.totalAmount - acc.totalPaid; });
      return [...map.values()].filter(a => a.totalPours > 0 || a.totalPaid > 0).sort((a, b) => b.remaining - a.remaining);
    },
  });

  // Statement data for selected client
  const { data: pourOrders, isLoading: loadingPours } = useQuery({
    queryKey: ["client-statement-pours", selectedClient?.id],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data } = await supabase
        .from("pour_orders")
        .select("*")
        .eq("client_id", selectedClient!.id)
        .order("scheduled_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ["client-statement-payments", selectedClient?.id],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_accounts" as any)
        .select("*")
        .eq("client_id", selectedClient!.id)
        .in("transaction_type", ["payment", "دفعة", "تحصيل"])
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Fetch all client_accounts to compute accurate totals
  const { data: allClientTxns } = useQuery({
    queryKey: ["client-statement-totals", selectedClient?.id],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_accounts" as any)
        .select("transaction_type, amount")
        .eq("client_id", selectedClient!.id);
      return data ?? [];
    },
  });

  // Compute totals from client_accounts
  const statementTotals = (() => {
    if (!allClientTxns) return null;
    let totalAmount = 0;
    let totalPaid = 0;
    (allClientTxns as any[]).forEach((t: any) => {
      const amt = Number(t.amount) || 0;
      if (t.transaction_type === "pour" || t.transaction_type === "صبة") {
        totalAmount += amt;
      } else if (t.transaction_type === "payment" || t.transaction_type === "دفعة" || t.transaction_type === "تحصيل") {
        totalPaid += amt;
      }
    });
    return { totalAmount, totalPaid, remaining: totalAmount - totalPaid };
  })();

  const filtered = (accounts ?? []).filter((a) => a.name.includes(search));

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = (client: ClientSummary) => {
    const phone = (client.phone || "").replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(`السلام عليكم 👋\nمرفق كشف حساب من شركة ركيزة لتوريد الخرسانة الجاهزة 🏗️\nالعميل: ${client.name}\nالمتبقي: ${fmt(client.remaining)}`);
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  // ──── Full-page statement view ────
  if (selectedClient) {
    const isLoadingData = loadingPours || loadingPayments;
    const todayStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

    return (
      <div dir="rtl" className="min-h-screen print:p-0" style={{ background: "#fff" }}>
        {/* Header */}
        <div style={{ background: "#1B3A6B" }} className="w-full px-5 py-5">
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div>
              <h1 className="font-cairo font-bold text-white" style={{ fontSize: 28 }}>شركة ركيزة</h1>
              <p className="text-white/80 font-cairo" style={{ fontSize: 14 }}>لتوريد الخرسانة الجاهزة | جمهورية مصر العربية</p>
              <p className="text-white font-cairo mt-1" style={{ fontSize: 16 }}>كشف حساب عميل</p>
            </div>
            <div className="text-left space-y-1">
              <p className="text-white font-cairo" style={{ fontSize: 14 }}>العميل: {selectedClient.name}</p>
              {selectedClient.phone && (
                <p className="text-white/80 font-cairo" style={{ fontSize: 13 }}>الهاتف: {selectedClient.phone}</p>
              )}
              <p className="text-white/80 font-cairo" style={{ fontSize: 13 }}>التاريخ: {todayStr}</p>
            </div>
          </div>
        </div>
        {/* Gold stripe */}
        <div style={{ background: "#F5A623", height: 4 }} />

        {/* Summary cards */}
        <div style={{ background: "#F8F9FA" }} className="px-5 py-4">
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs font-cairo text-muted-foreground">إجمالي المديونية</p>
                <p className="font-cairo font-bold text-lg" style={{ color: "#DC2626" }}>{fmt(statementTotals?.totalAmount ?? selectedClient.totalAmount)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs font-cairo text-muted-foreground">إجمالي المدفوع</p>
                <p className="font-cairo font-bold text-lg" style={{ color: "#16A34A" }}>{fmt(statementTotals?.totalPaid ?? selectedClient.totalPaid)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs font-cairo text-muted-foreground">المتبقي</p>
                <p className="font-cairo font-bold text-lg" style={{ color: "#1B3A6B" }}>{fmt(statementTotals?.remaining ?? selectedClient.remaining)}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Pours table */}
        <div className="px-5 py-4">
          <h3 className="font-cairo font-bold mb-3" style={{ color: "#1B3A6B", fontSize: 16 }}>الصبات</h3>
          {isLoadingData ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !(pourOrders || []).length ? (
            <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا توجد صبات</p>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#1B3A6B" }}>
                    {["التاريخ", "الكمية (م³)", "السعر/م³", "الإجمالي", "الحالة"].map((h) => (
                      <th key={h} className="font-cairo text-white text-right px-3 py-2.5 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(pourOrders || []).map((p: any, i: number) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#F0F4FF", borderBottom: "1px solid #E5E7EB" }}>
                      <td className="font-cairo px-3 py-2.5 text-xs">{p.scheduled_date || "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">{p.quantity_m3 ?? "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">{p.price_per_m3 ? fmt(Number(p.price_per_m3)) : "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs font-bold">{p.total_agreed_amount ? fmt(Number(p.total_agreed_amount)) : "—"}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">
                        <Badge variant="outline" className="text-[10px]">
                          {p.status === "done" ? "تم" : p.status === "in_progress" ? "جاري" : p.status === "scheduled" ? "مجدول" : p.status || "—"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payments table */}
        <div className="px-5 py-4">
          <h3 className="font-cairo font-bold mb-3" style={{ color: "#1B3A6B", fontSize: 16 }}>المدفوعات</h3>
          {isLoadingData ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !(payments || []).length ? (
            <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا توجد مدفوعات</p>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#1B3A6B" }}>
                    {["التاريخ", "المبلغ", "طريقة الدفع", "ملاحظات"].map((h) => (
                      <th key={h} className="font-cairo text-white text-right px-3 py-2.5 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(payments || []).map((t: any, i: number) => (
                    <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#F0F4FF", borderBottom: "1px solid #E5E7EB" }}>
                      <td className="font-cairo px-3 py-2.5 text-xs">{t.payment_date ?? (t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—")}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs font-bold" style={{ color: "#16A34A" }}>{fmt(Number(t.amount) || 0)}</td>
                      <td className="font-cairo px-3 py-2.5 text-xs">
                        <Badge variant="outline" className="text-[10px]">{METHOD_LABELS[t.payment_method] ?? t.payment_method ?? "—"}</Badge>
                      </td>
                      <td className="font-cairo px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[120px]">{t.notes ?? "—"}</td>
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

        {/* Action buttons - hidden in print */}
        <div className="flex flex-col gap-3 px-5 py-5 border-t print:hidden">
          <Button onClick={handlePrint} className="w-full font-cairo gap-2 text-white" style={{ background: "#1B3A6B" }}>
            <Download className="h-4 w-4" />
            تحميل PDF
          </Button>
          <Button onClick={() => handleWhatsApp(selectedClient)} className="w-full font-cairo gap-2 text-white" style={{ background: "#28A745" }}>
            <Send className="h-4 w-4" />
            إرسال واتساب
          </Button>
          <Button variant="outline" onClick={() => setSelectedClient(null)} className="w-full font-cairo gap-2">
            <ArrowRight className="h-4 w-4" />
            رجوع للقائمة
          </Button>
        </div>
      </div>
    );
  }

  // ──── Client list view ────
  if (isLoading) {
    return <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث عن عميل..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 font-cairo h-9" />
      </div>

      {!filtered.length ? (
        <p className="text-center text-muted-foreground font-cairo py-12">لا توجد بيانات</p>
      ) : (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-cairo text-right">العميل</TableHead>
                <TableHead className="font-cairo text-right">عدد الصبات</TableHead>
                <TableHead className="font-cairo text-right">إجمالي المبيعات</TableHead>
                <TableHead className="font-cairo text-right">المدفوع</TableHead>
                <TableHead className="font-cairo text-right">المتبقي</TableHead>
                <TableHead className="font-cairo text-right">نسبة التحصيل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const pct = a.totalAmount > 0 ? Math.round((a.totalPaid / a.totalAmount) * 100) : 0;
                return (
                  <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedClient(a)}>
                    <TableCell className="font-cairo font-medium text-primary underline-offset-2 hover:underline">{a.name}</TableCell>
                    <TableCell className="font-cairo">{a.totalPours}</TableCell>
                    <TableCell className="font-cairo">{fmt(a.totalAmount)}</TableCell>
                    <TableCell className="font-cairo text-chart-2">{fmt(a.totalPaid)}</TableCell>
                    <TableCell className="font-cairo text-destructive font-semibold">{fmt(a.remaining)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-chart-2 rounded-full" style={{ width: `${pct}%` }} />
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
