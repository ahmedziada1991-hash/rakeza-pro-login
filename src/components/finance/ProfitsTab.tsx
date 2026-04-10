import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

function toAmount(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  return 0;
}

export function ProfitsTab() {
  const [monthOffset, setMonthOffset] = useState(0);
  const currentMonth = useMemo(() => subMonths(new Date(), monthOffset), [monthOffset]);
  const prevMonth = useMemo(() => subMonths(currentMonth, 1), [currentMonth]);

  const fetchMonthData = async (month: Date) => {
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");

    const { data: orders, error } = await supabase
      .from("pour_orders")
      .select("id, client_id, station_id, scheduled_date, created_at, quantity_m3, total_agreed_amount, station_total_amount, concrete_type, status")
      .eq("status", "done")
      .gte("scheduled_date", start)
      .lte("scheduled_date", end)
      .order("scheduled_date", { ascending: false });

    if (error) {
      console.error("[ProfitsTab] failed to load pour_orders", error);
      return [];
    }

    return orders ?? [];
  };

  const { data: currentOrders, isLoading: loadingCurrent } = useQuery({
    queryKey: ["finance-profits", format(currentMonth, "yyyy-MM")],
    queryFn: () => fetchMonthData(currentMonth),
  });

  const { data: prevOrders, isLoading: loadingPrev } = useQuery({
    queryKey: ["finance-profits", format(prevMonth, "yyyy-MM")],
    queryFn: () => fetchMonthData(prevMonth),
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-names-profits"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name");
      return new Map((data ?? []).map((c) => [c.id, c.name]));
    },
  });

  const { data: stations } = useQuery({
    queryKey: ["stations-names-profits"],
    queryFn: async () => {
      const { data } = await supabase.from("stations").select("id, name");
      return new Map((data ?? []).map((s) => [s.id, s.name]));
    },
  });

  const calcTotals = (orders: any[]) => {
    let revenue = 0, cost = 0;
    orders.forEach((o) => {
      revenue += toAmount(o.total_agreed_amount);
      cost += toAmount(o.station_total_amount);
    });
    return { revenue, cost, profit: revenue - cost, count: orders.length };
  };

  const current = calcTotals(currentOrders ?? []);
  const prev = calcTotals(prevOrders ?? []);
  const isLoading = loadingCurrent || loadingPrev;

  const profitChange = prev.profit !== 0 ? ((current.profit - prev.profit) / Math.abs(prev.profit)) * 100 : 0;

  useEffect(() => {
    console.log("[ProfitsTab] calculated totals", {
      debugMode: "without-month-filter",
      revenue: current.revenue,
      cost: current.cost,
      profit: current.profit,
      count: current.count,
      sampleOrders: (currentOrders ?? []).slice(0, 5).map((order: any) => ({
        id: order.id,
        scheduled_date: order.scheduled_date,
        total_agreed_amount: order.total_agreed_amount,
        station_total_amount: order.station_total_amount,
      })),
    });
  }, [currentOrders]);

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: String(i), label: format(d, "MMMM yyyy", { locale: ar }) };
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-cairo font-bold text-foreground">تحليل الأرباح</h3>
        <Select value={String(monthOffset)} onValueChange={(v) => setMonthOffset(Number(v))}>
          <SelectTrigger className="w-48 font-cairo"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value} className="font-cairo">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs font-cairo text-muted-foreground">إيرادات البيع</p>
          <p className="font-cairo font-bold text-primary text-lg">{fmt(current.revenue)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs font-cairo text-muted-foreground">تكلفة الشراء</p>
          <p className="font-cairo font-bold text-orange-600 text-lg">{fmt(current.cost)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs font-cairo text-muted-foreground">صافي الربح</p>
          <p className={`font-cairo font-bold text-lg ${current.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(current.profit)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xs font-cairo text-muted-foreground">مقارنة بالشهر السابق</p>
          <div className="flex items-center justify-center gap-1">
            {profitChange >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownRight className="h-4 w-4 text-destructive" />}
            <p className={`font-cairo font-bold text-lg ${profitChange >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {Math.abs(Math.round(profitChange))}%
            </p>
          </div>
        </CardContent></Card>
      </div>

      {/* Comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-cairo text-sm">مقارنة مع الشهر السابق</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-cairo text-right">البند</TableHead>
                  <TableHead className="font-cairo text-right">الشهر الحالي</TableHead>
                  <TableHead className="font-cairo text-right">الشهر السابق</TableHead>
                  <TableHead className="font-cairo text-right">الفرق</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: "عدد الصبات", curr: current.count, prev: prev.count, isMoney: false },
                  { label: "الإيرادات", curr: current.revenue, prev: prev.revenue, isMoney: true },
                  { label: "التكلفة", curr: current.cost, prev: prev.cost, isMoney: true },
                  { label: "الربح", curr: current.profit, prev: prev.profit, isMoney: true },
                ].map((row) => {
                  const diff = row.curr - row.prev;
                  return (
                    <TableRow key={row.label}>
                      <TableCell className="font-cairo font-medium">{row.label}</TableCell>
                      <TableCell className="font-cairo">{row.isMoney ? fmt(row.curr) : row.curr}</TableCell>
                      <TableCell className="font-cairo text-muted-foreground">{row.isMoney ? fmt(row.prev) : row.prev}</TableCell>
                      <TableCell className={`font-cairo font-semibold ${diff >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {diff >= 0 ? "+" : ""}{row.isMoney ? fmt(diff) : diff}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Per-order profit breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-cairo text-sm">تفاصيل ربح كل صبة</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!(currentOrders ?? []).length ? (
            <p className="text-center text-muted-foreground font-cairo py-8 text-sm">لا توجد صبات مكتملة</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-cairo text-right">التاريخ</TableHead>
                    <TableHead className="font-cairo text-right">العميل</TableHead>
                    <TableHead className="font-cairo text-right">المحطة</TableHead>
                    <TableHead className="font-cairo text-right">الكمية</TableHead>
                    <TableHead className="font-cairo text-right">سعر البيع</TableHead>
                    <TableHead className="font-cairo text-right">سعر الشراء</TableHead>
                    <TableHead className="font-cairo text-right">ربح الصبة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(currentOrders ?? []).map((o: any) => {
                    const sell = toAmount(o.total_agreed_amount);
                    const buy = toAmount(o.station_total_amount);
                    const profit = sell - buy;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-cairo text-xs">{o.scheduled_date ?? o.created_at?.split("T")[0] ?? "—"}</TableCell>
                        <TableCell className="font-cairo text-xs">{clients?.get(o.client_id) ?? "—"}</TableCell>
                        <TableCell className="font-cairo text-xs">{stations?.get(o.station_id) ?? "—"}</TableCell>
                        <TableCell className="font-cairo">{o.quantity_m3 ?? "—"} م³</TableCell>
                        <TableCell className="font-cairo">{fmt(sell)}</TableCell>
                        <TableCell className="font-cairo text-orange-600">{fmt(buy)}</TableCell>
                        <TableCell className={`font-cairo font-semibold ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {fmt(profit)}
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
    </div>
  );
}
