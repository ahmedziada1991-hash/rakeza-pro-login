import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CalendarIcon, CheckCircle2, Banknote, ClipboardList, TrendingUp, Building2
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "كاش",
  check: "شيك",
  bank_transfer: "تحويل",
  cement: "أسمنت",
  online: "أونلاين",
};

export function ExecutionDailyReport() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Completed pours for the date
  const { data: completedOrders = [] } = useQuery({
    queryKey: ["exec-report-orders", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pour_orders")
        .select("*")
        .eq("scheduled_date", dateStr)
        .eq("status", "done")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // All orders for the date (for stats)
  const { data: allOrders = [] } = useQuery({
    queryKey: ["exec-report-all-orders", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pour_orders")
        .select("id, status, quantity_m3, total_agreed_amount")
        .eq("scheduled_date", dateStr);
      if (error) throw error;
      return data || [];
    },
  });

  // Payments for the date
  const { data: payments = [] } = useQuery({
    queryKey: ["exec-report-payments", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("payment_date", dateStr)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Client names
  const clientIds = [...new Set([
    ...completedOrders.map((o: any) => o.client_id),
    ...payments.map((p: any) => p.client_id),
  ].filter(Boolean))];

  const { data: clients = [] } = useQuery({
    queryKey: ["exec-report-clients", clientIds],
    queryFn: async () => {
      if (!clientIds.length) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      if (error) throw error;
      return data || [];
    },
    enabled: clientIds.length > 0,
  });

  const getClientName = (id: number) => clients.find((c: any) => c.id === id)?.name || `#${id}`;

  const totalCompleted = completedOrders.length;
  const totalQuantity = completedOrders.reduce((s: number, o: any) => s + (o.quantity_m3 || 0), 0);
  const totalRevenue = completedOrders.reduce((s: number, o: any) => s + (o.total_agreed_amount || 0), 0);
  const totalCollected = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const completionRate = allOrders.length > 0
    ? Math.round((totalCompleted / allOrders.length) * 100)
    : 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-cairo font-bold text-foreground">تقرير التنفيذ اليومي</h2>
          <p className="text-sm text-muted-foreground font-cairo">
            {format(selectedDate, "EEEE d MMMM yyyy", { locale: ar })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="font-cairo gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(selectedDate, "yyyy/MM/dd")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" className="font-cairo text-xs" onClick={() => setSelectedDate(new Date())}>
            اليوم
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 text-chart-2 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{totalCompleted}</p>
            <p className="text-xs text-muted-foreground font-cairo">صبة مكتملة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Building2 className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{totalQuantity}</p>
            <p className="text-xs text-muted-foreground font-cairo">م³ إجمالي</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 text-chart-4 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{fmt(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground font-cairo">إيرادات الصبات</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Banknote className="h-5 w-5 text-chart-2 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{fmt(totalCollected)}</p>
            <p className="text-xs text-muted-foreground font-cairo">تحصيلات اليوم</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ClipboardList className="h-5 w-5 text-chart-1 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{completionRate}%</p>
            <p className="text-xs text-muted-foreground font-cairo">نسبة الإنجاز</p>
          </CardContent>
        </Card>
      </div>

      {/* Completed Pours Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-cairo text-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-chart-2" />
            الصبات المكتملة ({totalCompleted})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {totalCompleted === 0 ? (
            <div className="p-8 text-center text-muted-foreground font-cairo">لا توجد صبات مكتملة</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right font-cairo">العميل</TableHead>
                    <TableHead className="text-right font-cairo">المحطة</TableHead>
                    <TableHead className="text-right font-cairo">النوع</TableHead>
                    <TableHead className="text-right font-cairo">الكمية</TableHead>
                    <TableHead className="text-right font-cairo hidden sm:table-cell">الإجمالي</TableHead>
                    <TableHead className="text-right font-cairo hidden sm:table-cell">المحصّل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedOrders.map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-cairo font-medium">{getClientName(o.client_id)}</TableCell>
                      <TableCell className="font-cairo text-muted-foreground">{o.station_name || "—"}</TableCell>
                      <TableCell className="font-cairo">{o.concrete_type || "—"}</TableCell>
                      <TableCell className="font-cairo font-semibold">{o.quantity_m3} م³</TableCell>
                      <TableCell className="font-cairo hidden sm:table-cell">{fmt(o.total_agreed_amount || 0)}</TableCell>
                      <TableCell className="font-cairo hidden sm:table-cell text-chart-2">{fmt(o.amount_paid || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-cairo text-lg flex items-center gap-2">
            <Banknote className="h-5 w-5 text-chart-2" />
            تحصيلات اليوم ({payments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground font-cairo">لا توجد تحصيلات</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right font-cairo">العميل</TableHead>
                    <TableHead className="text-right font-cairo">المبلغ</TableHead>
                    <TableHead className="text-right font-cairo">الطريقة</TableHead>
                    <TableHead className="text-right font-cairo hidden sm:table-cell">ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-cairo font-medium">{getClientName(p.client_id)}</TableCell>
                      <TableCell className="font-cairo font-semibold text-chart-2">{fmt(p.amount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-cairo">
                          {METHOD_LABELS[p.payment_method] || p.payment_method}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-cairo text-muted-foreground hidden sm:table-cell">
                        {p.notes || "—"}
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
