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

const METHOD_LABELS: Record<string, string> = {
  cash: "كاش", bank_transfer: "تحويل بنكي", check: "شيك", online: "أونلاين",
  cement: "أسمنت", concrete_deduction: "خصم خرسانة", mixed: "مختلط",
};

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
  const [search, setSearch] = useState("");
  const [selectedStation, setSelectedStation] = useState<StationSummary | null>(null);

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
        if (type === "pour" || type === "صبة" || type === "concrete") {
          acc.totalPours++;
          acc.totalCost += amt;
        } else if (type === "payment" || type === "دفعة") {
          acc.totalPaid += amt;
        } else if (type === "cement" || type === "أسمنت" || type === "cement_sale") {
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

  const filtered = (accounts ?? []).filter((a) => a.name.includes(search));

  if (isLoading) {
    return <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  const pours = (statement ?? []).filter((t: any) => t.transaction_type === "pour" || t.transaction_type === "صبة" || t.transaction_type === "concrete");
  const payments = (statement ?? []).filter((t: any) => t.transaction_type === "payment" || t.transaction_type === "دفعة");
  const cementSales = (statement ?? []).filter((t: any) => t.transaction_type === "cement" || t.transaction_type === "أسمنت" || t.transaction_type === "cement_sale");

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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs font-cairo text-muted-foreground">مديونية خرسانة</p>
                    <p className="font-cairo font-bold text-primary">{fmt(selectedStation.totalCost)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs font-cairo text-muted-foreground">المدفوع</p>
                    <p className="font-cairo font-bold text-chart-2">{fmt(selectedStation.totalPaid)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs font-cairo text-muted-foreground">خصم أسمنت</p>
                    <p className="font-cairo font-bold text-chart-4">{fmt(selectedStation.cementBalance)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-xs font-cairo text-muted-foreground">الرصيد النهائي</p>
                    <p className={`font-cairo font-bold ${selectedStation.finalBalance > 0 ? "text-destructive" : "text-chart-2"}`}>{fmt(selectedStation.finalBalance)}</p>
                  </CardContent></Card>
                </div>
              )}

              {/* Pours */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="font-cairo text-sm">صبات الخرسانة</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {loadingStatement ? (
                    <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : !pours.length ? (
                    <p className="text-center text-muted-foreground font-cairo py-6 text-sm">لا توجد صبات</p>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="font-cairo text-right">التاريخ</TableHead>
                            <TableHead className="font-cairo text-right">العميل</TableHead>
                            <TableHead className="font-cairo text-right">الكمية (م³)</TableHead>
                            {isAdmin && <TableHead className="font-cairo text-right">سعر الشراء</TableHead>}
                            {isAdmin && <TableHead className="font-cairo text-right">الإجمالي</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pours.map((t: any) => (
                            <TableRow key={t.id}>
                              <TableCell className="font-cairo text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—"}</TableCell>
                              <TableCell className="font-cairo text-xs">{t.client_name ?? "—"}</TableCell>
                              <TableCell className="font-cairo">{t.quantity_m3 ?? "—"}</TableCell>
                              {isAdmin && <TableCell className="font-cairo">{t.price_per_m3 ? fmt(Number(t.price_per_m3)) : "—"}</TableCell>}
                              {isAdmin && <TableCell className="font-cairo font-medium">{fmt(Number(t.amount) || 0)}</TableCell>}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Cement Sales */}
              {isAdmin && cementSales.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="font-cairo text-sm">مبيعات أسمنت للمحطة</CardTitle></CardHeader>
                  <CardContent className="p-0">
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
                          {cementSales.map((t: any) => (
                            <TableRow key={t.id}>
                              <TableCell className="font-cairo text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—"}</TableCell>
                              <TableCell className="font-cairo">{t.cement_tons ?? "—"}</TableCell>
                              <TableCell className="font-cairo">{t.cement_price_per_ton ? fmt(Number(t.cement_price_per_ton)) : "—"}</TableCell>
                              <TableCell className="font-cairo font-medium">{fmt(Number(t.amount) || 0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payments */}
              {isAdmin && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="font-cairo text-sm">المدفوعات</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    {!payments.length ? (
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
                            {payments.map((t: any) => (
                              <TableRow key={t.id}>
                                <TableCell className="font-cairo text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—"}</TableCell>
                                <TableCell className="font-cairo text-chart-2 font-medium">{fmt(Number(t.amount) || 0)}</TableCell>
                                <TableCell><Badge variant="outline" className="font-cairo text-[10px]">{METHOD_LABELS[t.payment_method] ?? t.payment_method ?? "—"}</Badge></TableCell>
                                <TableCell className="font-cairo text-xs text-muted-foreground truncate max-w-[150px]">{t.notes ?? "—"}</TableCell>
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
