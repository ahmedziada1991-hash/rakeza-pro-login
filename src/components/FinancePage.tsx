import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Search, Banknote, TrendingUp, AlertCircle } from "lucide-react";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "كاش",
  bank_transfer: "تحويل بنكي",
  check: "شيك",
  online: "أونلاين",
};

export function FinancePage() {
  const [search, setSearch] = useState("");

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
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      const clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]));

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
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      const clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]));

      return [...map.entries()]
        .map(([id, v]) => ({ id, name: clientMap.get(id) ?? "—", ...v }))
        .sort((a, b) => b.remaining - a.remaining);
    },
  });

  const isLoading = loadingPayments || loadingSummary;

  // Totals
  const totals = useMemo(() => {
    if (!clientSummary) return { total: 0, paid: 0, remaining: 0 };
    return clientSummary.reduce(
      (acc, c) => ({
        total: acc.total + c.total,
        paid: acc.paid + c.paid,
        remaining: acc.remaining + c.remaining,
      }),
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-cairo font-bold text-foreground">الماليات</h2>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
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
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
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
              <Input
                placeholder="بحث..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9 font-cairo h-9"
              />
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
    </div>
  );
}
