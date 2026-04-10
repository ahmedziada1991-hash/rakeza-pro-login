import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

  // Get client list with summary from client_accounts
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

  // Fetch statement for selected client
  const { data: statement, isLoading: loadingStatement } = useQuery({
    queryKey: ["client-statement", selectedClient?.id],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_accounts" as any)
        .select("*")
        .eq("client_id", selectedClient!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = (accounts ?? []).filter((a) => a.name.includes(search));

  if (isLoading) {
    return <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  const pours = (statement ?? []).filter((t: any) => t.transaction_type === "pour" || t.transaction_type === "صبة");
  const payments = (statement ?? []).filter((t: any) => t.transaction_type === "payment" || t.transaction_type === "دفعة" || t.transaction_type === "تحصيل");

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
                  <p className="font-cairo font-bold text-chart-2">{fmt(selectedClient.totalPaid)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 text-center">
                  <p className="text-xs font-cairo text-muted-foreground">المتبقي</p>
                  <p className="font-cairo font-bold text-destructive">{fmt(selectedClient.remaining)}</p>
                </CardContent></Card>
              </div>

              {/* Pours */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="font-cairo text-sm">الصبات</CardTitle></CardHeader>
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
                            <TableHead className="font-cairo text-right">المحطة</TableHead>
                            <TableHead className="font-cairo text-right">الكمية (م³)</TableHead>
                            <TableHead className="font-cairo text-right">سعر البيع</TableHead>
                            <TableHead className="font-cairo text-right">الإجمالي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pours.map((t: any) => (
                            <TableRow key={t.id}>
                              <TableCell className="font-cairo text-xs">{t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—"}</TableCell>
                              <TableCell className="font-cairo text-xs">{t.station_name ?? "—"}</TableCell>
                              <TableCell className="font-cairo">{t.quantity_m3 ?? "—"}</TableCell>
                              <TableCell className="font-cairo">{t.price_per_m3 ? fmt(Number(t.price_per_m3)) : "—"}</TableCell>
                              <TableCell className="font-cairo font-medium">{fmt(Number(t.amount) || 0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payments */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="font-cairo text-sm">المدفوعات</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {loadingStatement ? (
                    <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : !payments.length ? (
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
                              <TableCell className="font-cairo text-xs">{t.payment_date ?? (t.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—")}</TableCell>
                              <TableCell className="font-cairo text-chart-2 font-medium">{fmt(Number(t.amount) || 0)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-cairo text-[10px]">
                                  {METHOD_LABELS[t.payment_method] ?? t.payment_method ?? "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-cairo text-xs text-muted-foreground truncate max-w-[150px]">{t.notes ?? "—"}</TableCell>
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
