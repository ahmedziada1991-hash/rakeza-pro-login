import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, ChevronLeft } from "lucide-react";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

interface StationAccount {
  id: number;
  name: string;
  totalOrders: number;
  totalCost: number;
  totalPaid: number;
  remaining: number;
  cementBalance: number; // cement sold to this station (deducted from concrete debt)
  finalBalance: number; // totalCost - totalPaid - cementBalance
  orders: any[];
  payments: any[];
  cementSales: any[];
}

export function StationsTab() {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const [search, setSearch] = useState("");
  const [selectedStation, setSelectedStation] = useState<StationAccount | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["finance-stations-tab"],
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("pour_orders")
        .select("id, station_id, client_id, pour_date, quantity_m3, station_price_per_m3, station_total_amount, concrete_type, status")
        .not("station_id", "is", null)
        .order("pour_date", { ascending: false });

      // Get station payments (payment_type = 'station' or linked)
      const { data: payments } = await supabase
        .from("payments")
        .select("id, client_id, pour_order_id, amount, payment_method, payment_date, notes, created_at, payment_type")
        .eq("payment_type", "station")
        .order("created_at", { ascending: false });

      const { data: stations } = await supabase
        .from("stations")
        .select("id, name");

      // Cement sales to stations
      let cementSales: any[] = [];
      try {
        const { data } = await supabase
          .from("cement_sales")
          .select("id, station_id, quantity_tons, price_per_ton, total_amount, payment_method, cash_amount, concrete_deduction_amount, sale_date")
          .order("sale_date", { ascending: false });
        cementSales = data ?? [];
      } catch { /* table may not exist yet */ }

      const stationMap = new Map((stations ?? []).map((s) => [s.id, s.name]));
      const map = new Map<number, StationAccount>();

      (orders ?? []).forEach((o) => {
        const sid = o.station_id;
        if (!sid) return;
        if (!map.has(sid)) {
          map.set(sid, {
            id: sid,
            name: stationMap.get(sid) ?? "—",
            totalOrders: 0, totalCost: 0, totalPaid: 0,
            remaining: 0, cementBalance: 0, finalBalance: 0,
            orders: [], payments: [], cementSales: [],
          });
        }
        const acc = map.get(sid)!;
        acc.totalOrders++;
        acc.totalCost += Number(o.station_total_amount) || 0;
        acc.orders.push(o);
      });

      // Map payments to stations via pour_orders
      const orderStationMap = new Map<number, number>();
      (orders ?? []).forEach((o) => { if (o.station_id) orderStationMap.set(o.id, o.station_id); });

      (payments ?? []).forEach((p) => {
        const sid = p.pour_order_id ? orderStationMap.get(p.pour_order_id) : null;
        if (sid && map.has(sid)) {
          const acc = map.get(sid)!;
          acc.totalPaid += Number(p.amount) || 0;
          acc.payments.push(p);
        }
      });

      // Cement balance per station (concrete_deduction_amount reduces concrete debt)
      cementSales.forEach((cs) => {
        const sid = cs.station_id;
        if (!map.has(sid)) {
          // Station exists in cement but not in orders - create entry
          map.set(sid, {
            id: sid, name: stationMap.get(sid) ?? "—",
            totalOrders: 0, totalCost: 0, totalPaid: 0,
            remaining: 0, cementBalance: 0, finalBalance: 0,
            orders: [], payments: [], cementSales: [],
          });
        }
        const acc = map.get(sid)!;
        acc.cementBalance += Number(cs.concrete_deduction_amount) || 0;
        acc.cementSales.push(cs);
      });

      map.forEach((acc) => {
        acc.remaining = acc.totalCost - acc.totalPaid;
        acc.finalBalance = acc.remaining - acc.cementBalance;
      });

      return [...map.values()].sort((a, b) => b.finalBalance - a.finalBalance);
    },
  });

  const filtered = (accounts ?? []).filter((a) => a.name.includes(search));

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
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
                {isAdmin && <TableHead className="font-cairo text-right">إجمالي التكلفة</TableHead>}
                {isAdmin && <TableHead className="font-cairo text-right">المدفوع</TableHead>}
                {isAdmin && <TableHead className="font-cairo text-right">المتبقي</TableHead>}
                <TableHead className="font-cairo text-right">نسبة السداد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const pct = a.totalCost > 0 ? Math.round((a.totalPaid / a.totalCost) * 100) : 0;
                return (
                  <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedStation(a)}>
                    <TableCell className="font-cairo font-medium text-primary underline-offset-2 hover:underline">{a.name}</TableCell>
                    <TableCell className="font-cairo">{a.totalOrders}</TableCell>
                    {isAdmin && <TableCell className="font-cairo">{fmt(a.totalCost)}</TableCell>}
                    {isAdmin && <TableCell className="font-cairo text-emerald-600">{fmt(a.totalPaid)}</TableCell>}
                    {isAdmin && <TableCell className="font-cairo text-destructive font-semibold">{fmt(a.remaining)}</TableCell>}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
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

      {/* Station Statement Dialog */}
      <Dialog open={!!selectedStation} onOpenChange={(o) => !o && setSelectedStation(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-cairo text-right flex items-center gap-2">
              <ChevronLeft className="h-4 w-4" />
              كشف حساب: {selectedStation?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedStation && (
            <div className="space-y-4">
              {isAdmin && (
                <div className="grid grid-cols-3 gap-3">
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs font-cairo text-muted-foreground">إجمالي التكلفة</p>
                    <p className="font-cairo font-bold text-primary">{fmt(selectedStation.totalCost)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs font-cairo text-muted-foreground">المدفوع</p>
                    <p className="font-cairo font-bold text-emerald-600">{fmt(selectedStation.totalPaid)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs font-cairo text-muted-foreground">المتبقي</p>
                    <p className="font-cairo font-bold text-destructive">{fmt(selectedStation.remaining)}</p>
                  </CardContent></Card>
                </div>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="font-cairo text-sm">الصبات</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-cairo text-right">التاريخ</TableHead>
                          <TableHead className="font-cairo text-right">النوع</TableHead>
                          <TableHead className="font-cairo text-right">الكمية (م³)</TableHead>
                          {isAdmin && <TableHead className="font-cairo text-right">سعر الشراء</TableHead>}
                          {isAdmin && <TableHead className="font-cairo text-right">الإجمالي</TableHead>}
                          <TableHead className="font-cairo text-right">الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedStation.orders.map((o: any) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-cairo text-xs">{o.pour_date ?? "—"}</TableCell>
                            <TableCell className="font-cairo text-xs">{o.concrete_type ?? "—"}</TableCell>
                            <TableCell className="font-cairo">{o.quantity_m3 ?? "—"}</TableCell>
                            {isAdmin && <TableCell className="font-cairo">{fmt(Number(o.station_price_per_m3) || 0)}</TableCell>}
                            {isAdmin && <TableCell className="font-cairo font-medium">{fmt(Number(o.station_total_amount) || 0)}</TableCell>}
                            <TableCell>
                              <Badge variant="outline" className="font-cairo text-[10px]">{o.status ?? "—"}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {isAdmin && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="font-cairo text-sm">المدفوعات</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {!selectedStation.payments.length ? (
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
                            {selectedStation.payments.map((p: any) => (
                              <TableRow key={p.id}>
                                <TableCell className="font-cairo text-xs">{p.payment_date ?? new Date(p.created_at).toLocaleDateString("ar-EG")}</TableCell>
                                <TableCell className="font-cairo text-emerald-600 font-medium">{fmt(Number(p.amount))}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-cairo text-[10px]">
                                    {{ cash: "كاش", bank_transfer: "تحويل بنكي", check: "شيك", online: "أونلاين" }[p.payment_method] ?? p.payment_method}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-cairo text-xs text-muted-foreground truncate max-w-[150px]">{p.notes ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
