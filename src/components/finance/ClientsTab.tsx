import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, ChevronLeft } from "lucide-react";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

interface ClientAccount {
  id: number;
  name: string;
  totalOrders: number;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  orders: any[];
  payments: any[];
}

export function ClientsTab() {
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientAccount | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["finance-clients-tab"],
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("pour_orders")
        .select("id, client_id, pour_date, quantity_m3, agreed_price_per_m3, total_agreed_amount, concrete_type, status")
        .order("pour_date", { ascending: false });

      const { data: payments } = await supabase
        .from("payments")
        .select("id, client_id, pour_order_id, amount, payment_method, payment_date, notes, created_at")
        .order("created_at", { ascending: false });

      const { data: clients } = await supabase
        .from("clients")
        .select("id, name");

      const clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]));
      const map = new Map<number, ClientAccount>();

      (orders ?? []).forEach((o) => {
        if (!map.has(o.client_id)) {
          map.set(o.client_id, {
            id: o.client_id,
            name: clientMap.get(o.client_id) ?? "—",
            totalOrders: 0,
            totalAmount: 0,
            totalPaid: 0,
            remaining: 0,
            orders: [],
            payments: [],
          });
        }
        const acc = map.get(o.client_id)!;
        acc.totalOrders++;
        acc.totalAmount += Number(o.total_agreed_amount) || 0;
        acc.orders.push(o);
      });

      (payments ?? []).forEach((p) => {
        if (!map.has(p.client_id)) return;
        const acc = map.get(p.client_id)!;
        acc.totalPaid += Number(p.amount) || 0;
        acc.payments.push(p);
      });

      map.forEach((acc) => {
        acc.remaining = acc.totalAmount - acc.totalPaid;
      });

      return [...map.values()].sort((a, b) => b.remaining - a.remaining);
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
                    <TableCell className="font-cairo">{a.totalOrders}</TableCell>
                    <TableCell className="font-cairo">{fmt(a.totalAmount)}</TableCell>
                    <TableCell className="font-cairo text-emerald-600">{fmt(a.totalPaid)}</TableCell>
                    <TableCell className="font-cairo text-destructive font-semibold">{fmt(a.remaining)}</TableCell>
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

      {/* Client Statement Dialog */}
      <Dialog open={!!selectedClient} onOpenChange={(o) => !o && setSelectedClient(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-cairo text-right flex items-center gap-2">
              <ChevronLeft className="h-4 w-4" />
              كشف حساب: {selectedClient?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="p-3 text-center">
                  <p className="text-xs font-cairo text-muted-foreground">إجمالي المبيعات</p>
                  <p className="font-cairo font-bold text-primary">{fmt(selectedClient.totalAmount)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 text-center">
                  <p className="text-xs font-cairo text-muted-foreground">المدفوع</p>
                  <p className="font-cairo font-bold text-emerald-600">{fmt(selectedClient.totalPaid)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 text-center">
                  <p className="text-xs font-cairo text-muted-foreground">المتبقي</p>
                  <p className="font-cairo font-bold text-destructive">{fmt(selectedClient.remaining)}</p>
                </CardContent></Card>
              </div>

              {/* Orders */}
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
                          <TableHead className="font-cairo text-right">سعر البيع</TableHead>
                          <TableHead className="font-cairo text-right">الإجمالي</TableHead>
                          <TableHead className="font-cairo text-right">الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedClient.orders.map((o: any) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-cairo text-xs">{o.pour_date ?? "—"}</TableCell>
                            <TableCell className="font-cairo text-xs">{o.concrete_type ?? "—"}</TableCell>
                            <TableCell className="font-cairo">{o.quantity_m3 ?? "—"}</TableCell>
                            <TableCell className="font-cairo">{fmt(Number(o.agreed_price_per_m3) || 0)}</TableCell>
                            <TableCell className="font-cairo font-medium">{fmt(Number(o.total_agreed_amount) || 0)}</TableCell>
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

              {/* Payments */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="font-cairo text-sm">المدفوعات</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!selectedClient.payments.length ? (
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
                          {selectedClient.payments.map((p: any) => (
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
