import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { FileText, Plus, Search, CalendarIcon, X, Trash2 } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  done: { label: "مكتمل", variant: "default" },
  in_progress: { label: "قيد التنفيذ", variant: "secondary" },
  scheduled: { label: "مجدول", variant: "outline" },
  pending: { label: "في الانتظار", variant: "outline" },
  cancelled: { label: "ملغي", variant: "destructive" },
  problem: { label: "مشكلة", variant: "destructive" },
};

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

export function OrdersList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pour_orders")
        .select("id, client_id, concrete_type, quantity_m3, total_agreed_amount, amount_paid, amount_remaining, status, station_name, scheduled_date, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data?.length) return [];

      const clientIds = [...new Set(data.map((o) => o.client_id))];
      const { data: clients } = await supabase.from("clients").select("id, name").in("id", clientIds);
      const clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]));

      return data.map((o) => ({ ...o, client_name: clientMap.get(o.client_id) ?? "—" }));
    },
  });

  // Unique clients for filter
  const clientOptions = useMemo(() => {
    if (!orders) return [];
    const seen = new Map<number, string>();
    orders.forEach((o) => { if (!seen.has(o.client_id)) seen.set(o.client_id, o.client_name); });
    return [...seen.entries()].map(([id, name]) => ({ id: String(id), name }));
  }, [orders]);

  // Filtered
  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (clientFilter !== "all" && String(o.client_id) !== clientFilter) return false;
      if (dateFrom) {
        const d = new Date(o.scheduled_date ?? o.created_at);
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = new Date(o.scheduled_date ?? o.created_at);
        if (d > dateTo) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          o.client_name.toLowerCase().includes(q) ||
          (o.concrete_type ?? "").toLowerCase().includes(q) ||
          (o.station_name ?? "").toLowerCase().includes(q) ||
          String(o.id).includes(q)
        );
      }
      return true;
    });
  }, [orders, statusFilter, clientFilter, dateFrom, dateTo, search]);

  const hasFilters = statusFilter !== "all" || clientFilter !== "all" || dateFrom || dateTo || search;

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setClientFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  }
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      // Cascading delete: remove related records first
      await supabase.from("client_accounts" as any).delete().eq("pour_order_id", id);
      await supabase.from("station_accounts" as any).delete().eq("pour_order_id", id);
      await supabase.from("payments" as any).delete().eq("pour_order_id", id);
      const { error } = await supabase.from("pour_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders-list"] });
      queryClient.invalidateQueries({ queryKey: ["orders-stats"] });
      queryClient.invalidateQueries({ queryKey: ["finance-clients-tab"] });
      queryClient.invalidateQueries({ queryKey: ["finance-stations-tab"] });
      queryClient.invalidateQueries({ queryKey: ["finance-profits"] });
      toast({ title: "تم حذف الطلب بنجاح" });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-cairo font-bold text-foreground">طلبات الصب</h2>
          <Badge variant="secondary" className="font-cairo">{orders?.length ?? 0}</Badge>
        </div>
        <Button onClick={() => navigate("/dashboard/admin/orders/new")} className="font-cairo gap-1">
          <Plus className="h-4 w-4" />
          طلب جديد
        </Button>
      </div>

      {/* Filters */}
      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو النوع أو المحطة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9 font-cairo h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="font-cairo h-9 w-[130px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-cairo">كل الحالات</SelectItem>
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="font-cairo">{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="font-cairo h-9 w-[160px]"><SelectValue placeholder="العميل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-cairo">كل العملاء</SelectItem>
                {clientOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="font-cairo">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DateFilter label="من" date={dateFrom} onChange={setDateFrom} />
            <DateFilter label="إلى" date={dateTo} onChange={setDateTo} />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="font-cairo gap-1 text-muted-foreground">
                <X className="h-3 w-3" /> مسح
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground font-cairo py-12">لا توجد نتائج</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-cairo text-right">#</TableHead>
                    <TableHead className="font-cairo text-right">العميل</TableHead>
                    <TableHead className="font-cairo text-right">النوع</TableHead>
                    <TableHead className="font-cairo text-right">الكمية</TableHead>
                    <TableHead className="font-cairo text-right">المحطة</TableHead>
                    <TableHead className="font-cairo text-right">الإجمالي</TableHead>
                    <TableHead className="font-cairo text-right">المدفوع</TableHead>
                    <TableHead className="font-cairo text-right">المتبقي</TableHead>
                    <TableHead className="font-cairo text-right">التاريخ</TableHead>
                    <TableHead className="font-cairo text-right">الحالة</TableHead>
                    <TableHead className="font-cairo text-right w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o: any) => {
                    const st = STATUS_MAP[o.status] ?? STATUS_MAP.pending;
                    return (
                      <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/dashboard/admin/orders/${o.id}/edit`)}>
                        <TableCell className="font-cairo text-muted-foreground">{o.id}</TableCell>
                        <TableCell className="font-cairo font-medium">{o.client_name}</TableCell>
                        <TableCell className="font-cairo">{o.concrete_type ?? "—"}</TableCell>
                        <TableCell className="font-cairo">{o.quantity_m3 ?? "—"} م³</TableCell>
                        <TableCell className="font-cairo">{o.station_name ?? "—"}</TableCell>
                        <TableCell className="font-cairo">{fmt(Number(o.total_agreed_amount) || 0)}</TableCell>
                        <TableCell className="font-cairo text-emerald-600">{fmt(Number(o.amount_paid) || 0)}</TableCell>
                        <TableCell className="font-cairo text-destructive font-semibold">
                          {Number(o.amount_remaining) > 0 ? fmt(Number(o.amount_remaining)) : "—"}
                        </TableCell>
                        <TableCell className="font-cairo text-xs text-muted-foreground">
                          {o.scheduled_date ?? new Date(o.created_at).toLocaleDateString("ar-EG")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={st.variant} className="font-cairo text-[11px]">{st.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleteId(o.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-cairo text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="font-cairo text-right">
              هل أنت متأكد من حذف الطلب رقم {deleteId}؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="font-cairo">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="font-cairo bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DateFilter({ label, date, onChange }: { label: string; date?: Date; onChange: (d?: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("font-cairo gap-1 h-9", !date && "text-muted-foreground")}>
          <CalendarIcon className="h-3.5 w-3.5" />
          {date ? `${label}: ${format(date, "MM/dd")}` : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => onChange(d ?? undefined)}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
