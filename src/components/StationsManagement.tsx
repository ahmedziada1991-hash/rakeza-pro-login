import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Search, Building2 } from "lucide-react";

interface Station {
  id: number;
  name: string;
  area: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

interface StationForm {
  name: string;
  area: string;
  notes: string;
  active: boolean;
}

const EMPTY_FORM: StationForm = { name: "", area: "", notes: "", active: true };

export function StationsManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Station | null>(null);
  const [form, setForm] = useState<StationForm>(EMPTY_FORM);

  const { data: stations, isLoading } = useQuery({
    queryKey: ["stations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Station[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: { id?: number; data: Partial<StationForm> }) => {
      if (payload.id) {
        const { error } = await supabase.from("stations").update(payload.data).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stations").insert(payload.data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stations-list"] });
      queryClient.invalidateQueries({ queryKey: ["stations-count"] });
      toast({ title: editing ? "تم تحديث المحطة" : "تم إضافة المحطة بنجاح" });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(station: Station) {
    setEditing(station);
    setForm({
      name: station.name,
      area: station.area ?? "",
      notes: station.notes ?? "",
      active: station.active,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "اسم المحطة مطلوب", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      area: form.area || null,
      notes: form.notes || null,
      active: form.active,
    };
    upsertMutation.mutate({ id: editing?.id, data: payload });
  }

  const filtered = (stations ?? []).filter(
    (s) => s.name.includes(search) || (s.area ?? "").includes(search),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-cairo font-bold text-foreground">إدارة المحطات</h2>
          <Badge variant="secondary" className="font-cairo">{stations?.length ?? 0}</Badge>
        </div>
        <Button onClick={openAdd} className="font-cairo gap-1">
          <Plus className="h-4 w-4" />
          إضافة محطة
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو المنطقة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 font-cairo"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
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
                    <TableHead className="font-cairo text-right">اسم المحطة</TableHead>
                    <TableHead className="font-cairo text-right">المنطقة</TableHead>
                    <TableHead className="font-cairo text-right">الحالة</TableHead>
                    <TableHead className="font-cairo text-right">ملاحظات</TableHead>
                    <TableHead className="font-cairo text-right">تاريخ الإنشاء</TableHead>
                    <TableHead className="font-cairo text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((station) => (
                    <TableRow key={station.id}>
                      <TableCell className="font-cairo text-muted-foreground">{station.id}</TableCell>
                      <TableCell className="font-cairo font-medium">{station.name}</TableCell>
                      <TableCell className="font-cairo">{station.area ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={station.active ? "default" : "secondary"}
                          className="font-cairo text-[11px]"
                        >
                          {station.active ? "نشطة" : "متوقفة"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-cairo text-xs text-muted-foreground max-w-[200px] truncate">
                        {station.notes ?? "—"}
                      </TableCell>
                      <TableCell className="font-cairo text-xs text-muted-foreground">
                        {new Date(station.created_at).toLocaleDateString("ar-EG")}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(station)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-cairo">
              {editing ? "تعديل بيانات المحطة" : "إضافة محطة جديدة"}
            </DialogTitle>
            <DialogDescription className="font-cairo text-muted-foreground">
              {editing ? "عدّل البيانات واضغط حفظ" : "أدخل بيانات المحطة الجديدة"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label className="font-cairo">اسم المحطة *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="font-cairo"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">المنطقة</Label>
              <Input
                value={form.area}
                onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                className="font-cairo"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="font-cairo"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="font-cairo">نشطة</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
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
