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

  const upsertMutation = useMutation({
    mutationFn: async (payload: { id?: number; data: Partial<ClientForm> }) => {
      if (payload.id) {
        const { error } = await supabase.from("clients").update(payload.data).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(payload.data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      // Send assignment notifications if assignments changed
      const clientName = form.name.trim();
      const oldSalesId = editingClient?.assigned_sales_id ?? null;
      const newSalesId = form.assigned_sales_id;
      const oldFollowupId = editingClient?.assigned_followup_id ?? null;
      const newFollowupId = form.assigned_followup_id;

      sendAssignmentNotifications(clientName, oldSalesId, newSalesId, oldFollowupId, newFollowupId);

      queryClient.invalidateQueries({ queryKey: ["clients-list"] });
      queryClient.invalidateQueries({ queryKey: ["clients-count"] });
      toast({ title: editingClient ? "تم تحديث العميل" : "تم إضافة العميل بنجاح" });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

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
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingClient(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "الاسم مطلوب", variant: "destructive" });
      return;
    }
    const payload: Partial<ClientForm> = {
      name: form.name.trim(),
      phone: form.phone || null,
      area: form.area || null,
      project_type: form.project_type || null,
      size_m3: form.size_m3,
      price: form.price,
      status: form.status,
      notes: form.notes || null,
      pour_status: form.pour_status,
      assigned_sales_id: form.assigned_sales_id,
      assigned_followup_id: form.assigned_followup_id,
    };
    upsertMutation.mutate({ id: editingClient?.id, data: payload });
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
            <Button onClick={handleSave} disabled={upsertMutation.isPending} className="font-cairo">
              {upsertMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
