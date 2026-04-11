import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Search, Users } from "lucide-react";

interface Client {
  id: number;
  name: string;
  phone: string | null;
  area: string | null;
  project_type: string | null;
  size_m3: number | null;
  price: number | null;
  status: string;
  notes: string | null;
  is_converted: boolean;
  pour_status: string | null;
  assigned_sales_id: number | null;
  assigned_followup_id: number | null;
  created_at: string;
}

interface StaffUser {
  id: number;
  name: string;
  role: string;
}

interface Station {
  id: number;
  name: string;
}

interface PourFields {
  pour_exec_status: string; // "not_done" | "done"
  station_id: number | null;
  concrete_type: string;
  cement_content: number | null;
  actual_quantity: number | null;
  price_per_m3: number | null;
  amount_paid: number | null;
  scheduled_date: string;
}

type ClientForm = Omit<Client, "id" | "created_at" | "is_converted"> & PourFields;

const EMPTY_FORM: ClientForm = {
  name: "",
  phone: "",
  area: "",
  project_type: "",
  size_m3: null,
  price: null,
  status: "active",
  notes: "",
  pour_status: null,
  assigned_sales_id: null,
  assigned_followup_id: null,
  pour_exec_status: "not_done",
  station_id: null,
  concrete_type: "B350",
  cement_content: null,
  actual_quantity: null,
  price_per_m3: null,
  amount_paid: null,
  scheduled_date: new Date().toISOString().slice(0, 10),
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "نشط", variant: "default" },
  inactive: { label: "غير نشط", variant: "secondary" },
  blocked: { label: "محظور", variant: "destructive" },
};

const POUR_STATUS_MAP: Record<string, string> = {
  done: "مكتمل",
  in_progress: "قيد التنفيذ",
  scheduled: "مجدول",
  pending: "في الانتظار",
};

export function ClientsManagement() {
  const queryClient = useQueryClient();
  const { userRole, user } = useAuth();
  const isAdmin = userRole === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);

  useEffect(() => {
    if (searchParams.get("add") === "1") {
      setDialogOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch stations
  const { data: stations } = useQuery({
    queryKey: ["stations-list"],
    queryFn: async () => {
      const { data } = await supabase.from("stations").select("id, name").order("name");
      return (data ?? []) as Station[];
    },
  });

  // Fetch staff users (sales + followup)
  const { data: staffUsers } = useQuery({
    queryKey: ["staff-users-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("id, name, role")
        .in("role", ["sales", "followup"])
        .eq("active", true)
        .order("name");
      return (data ?? []) as StaffUser[];
    },
  });

  const salesUsers = (staffUsers ?? []).filter((u) => u.role === "sales");
  const followupUsers = (staffUsers ?? []).filter((u) => u.role === "followup");

  // Build a map of user id -> name for table display
  const staffMap = new Map<number, string>();
  (staffUsers ?? []).forEach((u) => staffMap.set(u.id, u.name));

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone, area, project_type, size_m3, price, status, notes, is_converted, pour_status, assigned_sales_id, assigned_followup_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const sendAssignmentNotifications = async (
    clientName: string,
    oldSalesId: string | number | null,
    newSalesId: string | number | null,
    oldFollowupId: string | number | null,
    newFollowupId: string | number | null,
  ) => {
    const notifications: any[] = [];

    // Notify new sales rep
    if (newSalesId && String(newSalesId) !== String(oldSalesId)) {
      notifications.push({
        user_id: String(newSalesId),
        title: "تعيين عميل جديد",
        message: `تم تعيينك كبائع للعميل: ${clientName}`,
        type: "assignment",
        is_read: false,
      });
    }

    // Notify new followup rep
    if (newFollowupId && String(newFollowupId) !== String(oldFollowupId)) {
      notifications.push({
        user_id: String(newFollowupId),
        title: "تعيين عميل جديد",
        message: `تم تعيينك كمتابع للعميل: ${clientName}`,
        type: "assignment",
        is_read: false,
      });
    }

    // Notify all admins
    if (notifications.length > 0) {
      const { data: admins } = await supabase
        .from("users")
        .select("id")
        .eq("role", "admin")
        .eq("active", true);

      const assigneeNames: string[] = [];
      if (newSalesId && String(newSalesId) !== String(oldSalesId)) {
        const name = staffMap.get(newSalesId as number) ?? "بائع";
        assigneeNames.push(`بائع: ${name}`);
      }
      if (newFollowupId && String(newFollowupId) !== String(oldFollowupId)) {
        const name = staffMap.get(newFollowupId as number) ?? "متابع";
        assigneeNames.push(`متابع: ${name}`);
      }

      (admins ?? []).forEach((admin: any) => {
        // Don't duplicate if admin is the one doing the assignment (current user)
        if (String(admin.id) !== String(user?.id)) {
          notifications.push({
            user_id: admin.id,
            title: "تعيين موظف لعميل",
            message: `تم تعيين ${assigneeNames.join(" و ")} للعميل: ${clientName}`,
            type: "assignment",
            is_read: false,
          });
        }
      });
    }

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications as any);
    }
  };

  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(client: Client) {
    setEditingClient(client);
    setForm({
      name: client.name,
      phone: client.phone ?? "",
      area: client.area ?? "",
      project_type: client.project_type ?? "",
      size_m3: client.size_m3,
      price: client.price,
      status: client.status,
      notes: client.notes ?? "",
      pour_status: client.pour_status,
      assigned_sales_id: client.assigned_sales_id,
      assigned_followup_id: client.assigned_followup_id,
      pour_exec_status: client.pour_status === "done" ? "done" : "not_done",
      station_id: null,
      concrete_type: "B350",
      cement_content: null,
      actual_quantity: null,
      price_per_m3: null,
      amount_paid: null,
      scheduled_date: new Date().toISOString().slice(0, 10),
    });
    // If client already has a pour, load existing pour data
    if (client.pour_status === "done") {
      supabase
        .from("pour_orders")
        .select("*")
        .eq("client_id", client.id)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data?.[0]) {
            const p = data[0] as any;
            setForm((f) => ({
              ...f,
              station_id: p.station_id,
              concrete_type: p.concrete_type || "B350",
              cement_content: p.cement_content,
              actual_quantity: p.actual_quantity_m3 || p.quantity_m3,
              price_per_m3: p.agreed_price_per_m3,
              amount_paid: p.amount_paid,
              scheduled_date: p.scheduled_date || f.scheduled_date,
            }));
          }
        });
    }
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingClient(null);
    setForm(EMPTY_FORM);
  }

  const pourTotal = useMemo(() => {
    return (form.actual_quantity || 0) * (form.price_per_m3 || 0);
  }, [form.actual_quantity, form.price_per_m3]);

  const pourRemaining = useMemo(() => {
    return pourTotal - (form.amount_paid || 0);
  }, [pourTotal, form.amount_paid]);

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "الاسم مطلوب", variant: "destructive" });
      return;
    }

    const isDone = form.pour_exec_status === "done";

    if (isDone) {
      if (!form.station_id) {
        toast({ title: "اختر المحطة", variant: "destructive" });
        return;
      }
      if (!form.actual_quantity || !form.price_per_m3) {
        toast({ title: "أدخل الكمية والسعر", variant: "destructive" });
        return;
      }
    }

    const clientPayload: any = {
      name: form.name.trim(),
      phone: form.phone || null,
      area: form.area || null,
      project_type: form.project_type || null,
      size_m3: form.size_m3,
      price: form.price,
      status: form.status,
      notes: form.notes || null,
      pour_status: isDone ? "done" : form.pour_status,
      assigned_sales_id: form.assigned_sales_id,
      assigned_followup_id: form.assigned_followup_id,
    };

    try {
      let clientId = editingClient?.id;

      if (clientId) {
        const { error } = await supabase.from("clients").update(clientPayload).eq("id", clientId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("clients").insert(clientPayload).select("id").single();
        if (error) throw error;
        clientId = data.id;
      }

      // Handle pour execution records
      if (isDone && clientId) {
        const stationName = stations?.find((s) => s.id === form.station_id)?.name || "";

        // Check for existing pour order
        const { data: existingPours } = await supabase
          .from("pour_orders")
          .select("id")
          .eq("client_id", clientId)
          .eq("status", "done")
          .limit(1);

        const pourData: any = {
          client_id: clientId,
          station_id: form.station_id,
          concrete_type: form.concrete_type,
          cement_content: form.cement_content,
          quantity_m3: form.actual_quantity,
          actual_quantity_m3: form.actual_quantity,
          agreed_price_per_m3: form.price_per_m3,
          total_agreed_amount: pourTotal,
          amount_paid: form.amount_paid || 0,
          amount_remaining: pourRemaining,
          status: "done",
          scheduled_date: form.scheduled_date,
        };

        let pourOrderId: number;

        if (existingPours?.length) {
          // Update existing
          pourOrderId = existingPours[0].id;
          const { error } = await supabase.from("pour_orders").update(pourData).eq("id", pourOrderId);
          if (error) throw error;

          // Update existing client_accounts & station_accounts
          await supabase.from("client_accounts").delete().eq("pour_order_id", pourOrderId);
          await supabase.from("station_accounts").delete().eq("pour_order_id", pourOrderId);
        } else {
          // Insert new
          const { data, error } = await supabase.from("pour_orders").insert(pourData).select("id").single();
          if (error) throw error;
          pourOrderId = data.id;
        }

        // Insert client_accounts
        await supabase.from("client_accounts").insert({
          client_id: clientId,
          transaction_type: "pour",
          amount: pourTotal,
          pour_order_id: pourOrderId,
          date: form.scheduled_date,
          description: `صبة ${form.concrete_type} - ${form.actual_quantity} م³`,
        } as any);

        // Insert station_accounts
        await supabase.from("station_accounts").insert({
          station_id: form.station_id,
          station_name: stationName,
          transaction_type: "concrete",
          quantity_m3: form.actual_quantity,
          pour_order_id: pourOrderId,
          date: form.scheduled_date,
          amount: pourTotal,
          description: `صبة ${form.concrete_type} - عميل: ${form.name.trim()}`,
        } as any);
      }

      // Send notifications
      const clientName = form.name.trim();
      sendAssignmentNotifications(clientName, editingClient?.assigned_sales_id ?? null, form.assigned_sales_id, editingClient?.assigned_followup_id ?? null, form.assigned_followup_id);

      queryClient.invalidateQueries({ queryKey: ["clients-list"] });
      queryClient.invalidateQueries({ queryKey: ["clients-count"] });
      queryClient.invalidateQueries({ queryKey: ["pour-orders"] });
      toast({ title: editingClient ? "تم تحديث العميل" : "تم إضافة العميل بنجاح" });
      closeDialog();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  }

  const filtered = (clients ?? []).filter(
    (c) =>
      c.name.includes(search) ||
      (c.phone ?? "").includes(search) ||
      (c.area ?? "").includes(search),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-cairo font-bold text-foreground">إدارة العملاء</h2>
          <Badge variant="secondary" className="font-cairo">{clients?.length ?? 0}</Badge>
        </div>
        <Button onClick={openAdd} className="font-cairo gap-1">
          <Plus className="h-4 w-4" />
          إضافة عميل
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الهاتف أو المنطقة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 font-cairo"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground font-cairo py-12">لا توجد نتائج</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-cairo text-right">#</TableHead>
                    <TableHead className="font-cairo text-right">الاسم</TableHead>
                    <TableHead className="font-cairo text-right">الهاتف</TableHead>
                    <TableHead className="font-cairo text-right">المنطقة</TableHead>
                    <TableHead className="font-cairo text-right">البائع</TableHead>
                    <TableHead className="font-cairo text-right">المتابع</TableHead>
                    <TableHead className="font-cairo text-right">الكمية (م³)</TableHead>
                    <TableHead className="font-cairo text-right">السعر</TableHead>
                    <TableHead className="font-cairo text-right">الحالة</TableHead>
                    <TableHead className="font-cairo text-right">حالة الصب</TableHead>
                    <TableHead className="font-cairo text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((client) => {
                    const statusInfo = STATUS_MAP[client.status] ?? STATUS_MAP.active;
                    return (
                      <TableRow key={client.id}>
                        <TableCell className="font-cairo text-muted-foreground">{client.id}</TableCell>
                        <TableCell className="font-cairo font-medium">{client.name}</TableCell>
                        <TableCell className="font-cairo" dir="ltr">{client.phone ?? "—"}</TableCell>
                        <TableCell className="font-cairo">{client.area ?? "—"}</TableCell>
                        <TableCell className="font-cairo text-xs">
                          {client.assigned_sales_id ? (staffMap.get(client.assigned_sales_id) ?? "—") : "—"}
                        </TableCell>
                        <TableCell className="font-cairo text-xs">
                          {client.assigned_followup_id ? (staffMap.get(client.assigned_followup_id) ?? "—") : "—"}
                        </TableCell>
                        <TableCell className="font-cairo">{client.size_m3 ?? "—"}</TableCell>
                        <TableCell className="font-cairo">
                          {client.price ? `${client.price.toLocaleString("ar-EG")} ج.م` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant} className="font-cairo text-[11px]">
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-cairo text-xs">
                          {client.pour_status ? (POUR_STATUS_MAP[client.pour_status] ?? client.pour_status) : "—"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(client)}>
                            <Pencil className="h-4 w-4" />
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

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-cairo">
              {editingClient ? "تعديل بيانات العميل" : "إضافة عميل جديد"}
            </DialogTitle>
            <DialogDescription className="font-cairo text-muted-foreground">
              {editingClient ? "عدّل البيانات واضغط حفظ" : "أدخل بيانات العميل الجديد"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-cairo">الاسم *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="font-cairo"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">الهاتف</Label>
                <Input
                  value={form.phone ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="font-cairo"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-cairo">المنطقة</Label>
                <Input
                  value={form.area ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                  className="font-cairo"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">نوع المشروع</Label>
                <Input
                  value={form.project_type ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, project_type: e.target.value }))}
                  className="font-cairo"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-cairo">الكمية (م³)</Label>
                <Input
                  type="number"
                  value={form.size_m3 ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, size_m3: e.target.value ? Number(e.target.value) : null }))}
                  className="font-cairo"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">السعر (ج.م)</Label>
                <Input
                  type="number"
                  value={form.price ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value ? Number(e.target.value) : null }))}
                  className="font-cairo"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-cairo">الحالة</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="font-cairo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" className="font-cairo">نشط</SelectItem>
                  <SelectItem value="inactive" className="font-cairo">غير نشط</SelectItem>
                  <SelectItem value="blocked" className="font-cairo">محظور</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sales & Followup assignment - Admin only */}
            {isAdmin && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-cairo">البائع</Label>
                  <Select
                    value={form.assigned_sales_id ? String(form.assigned_sales_id) : "none"}
                    onValueChange={(v) => setForm((f) => ({ ...f, assigned_sales_id: v === "none" ? null : Number(v) }))}
                  >
                    <SelectTrigger className="font-cairo">
                      <SelectValue placeholder="اختر البائع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="font-cairo">بدون</SelectItem>
                      {salesUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)} className="font-cairo">{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-cairo">المتابع</Label>
                  <Select
                    value={form.assigned_followup_id ? String(form.assigned_followup_id) : "none"}
                    onValueChange={(v) => setForm((f) => ({ ...f, assigned_followup_id: v === "none" ? null : Number(v) }))}
                  >
                    <SelectTrigger className="font-cairo">
                      <SelectValue placeholder="اختر المتابع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="font-cairo">بدون</SelectItem>
                      {followupUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)} className="font-cairo">{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Pour execution status */}
            <div className="space-y-1.5">
              <Label className="font-cairo">حالة الصبة</Label>
              <Select value={form.pour_exec_status} onValueChange={(v) => setForm((f) => ({ ...f, pour_exec_status: v }))}>
                <SelectTrigger className="font-cairo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_done" className="font-cairo">لم تتم بعد</SelectItem>
                  <SelectItem value="done" className="font-cairo">تم التنفيذ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.pour_exec_status === "done" && (
              <div className="space-y-3 border border-primary/20 rounded-lg p-3 bg-primary/5">
                <p className="font-cairo font-bold text-sm text-primary">بيانات الصبة</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="font-cairo">المحطة *</Label>
                    <Select
                      value={form.station_id ? String(form.station_id) : ""}
                      onValueChange={(v) => setForm((f) => ({ ...f, station_id: Number(v) }))}
                    >
                      <SelectTrigger className="font-cairo">
                        <SelectValue placeholder="اختر المحطة" />
                      </SelectTrigger>
                      <SelectContent>
                        {(stations ?? []).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)} className="font-cairo">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-cairo">نوع الخرسانة</Label>
                    <Select value={form.concrete_type} onValueChange={(v) => setForm((f) => ({ ...f, concrete_type: v }))}>
                      <SelectTrigger className="font-cairo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="B200" className="font-cairo">B200</SelectItem>
                        <SelectItem value="B300" className="font-cairo">B300</SelectItem>
                        <SelectItem value="B350" className="font-cairo">B350</SelectItem>
                        <SelectItem value="B400" className="font-cairo">B400</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="font-cairo">المحتوى (كجم/م³)</Label>
                    <Input
                      type="number"
                      value={form.cement_content ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, cement_content: e.target.value ? Number(e.target.value) : null }))}
                      className="font-cairo"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-cairo">الكمية الفعلية (م³) *</Label>
                    <Input
                      type="number"
                      value={form.actual_quantity ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, actual_quantity: e.target.value ? Number(e.target.value) : null }))}
                      className="font-cairo"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="font-cairo">سعر البيع (ج.م/م³) *</Label>
                    <Input
                      type="number"
                      value={form.price_per_m3 ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, price_per_m3: e.target.value ? Number(e.target.value) : null }))}
                      className="font-cairo"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-cairo">الإجمالي (ج.م)</Label>
                    <Input
                      type="number"
                      value={pourTotal || ""}
                      readOnly
                      className="font-cairo bg-muted"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="font-cairo">المبلغ المدفوع</Label>
                    <Input
                      type="number"
                      value={form.amount_paid ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value ? Number(e.target.value) : null }))}
                      className="font-cairo"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-cairo">المتبقي</Label>
                    <Input
                      type="number"
                      value={pourRemaining || ""}
                      readOnly
                      className="font-cairo bg-muted"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="font-cairo">تاريخ الصبة</Label>
                  <Input
                    type="date"
                    value={form.scheduled_date}
                    onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                    className="font-cairo"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="font-cairo"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeDialog} className="font-cairo">إلغاء</Button>
            <Button onClick={handleSave} className="font-cairo">
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
