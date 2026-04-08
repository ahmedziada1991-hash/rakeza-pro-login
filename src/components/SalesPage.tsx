import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Phone, MessageCircle, ArrowLeftRight, Search, Users, ContactRound } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Client {
  id: number;
  name: string;
  phone: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  is_converted: boolean;
}

const CLASSIFICATION_MAP: Record<string, { label: string; color: string }> = {
  hot: { label: "ساخن", color: "bg-red-500/15 text-red-600 border-red-200" },
  warm: { label: "دافئ", color: "bg-orange-500/15 text-orange-600 border-orange-200" },
  cold: { label: "بارد", color: "bg-blue-500/15 text-blue-600 border-blue-200" },
  inactive: { label: "خامل", color: "bg-muted text-muted-foreground border-border" },
  active: { label: "عميل حالي", color: "bg-green-500/15 text-green-600 border-green-200" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "الكل" },
  { value: "hot", label: "🔥 ساخن" },
  { value: "warm", label: "🟠 دافئ" },
  { value: "cold", label: "🔵 بارد" },
  { value: "inactive", label: "⚫ خامل" },
  { value: "active", label: "✅ عملاء حاليين" },
];

interface ClientForm {
  name: string;
  phone: string;
  status: string;
  notes: string;
}

const EMPTY_FORM: ClientForm = { name: "", phone: "", status: "hot", notes: "" };

export function SalesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["sales-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone, status, notes, created_at, is_converted")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Partial<ClientForm>) => {
      const { error } = await supabase.from("clients").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-list"] });
      toast({ title: "تم إضافة العميل بنجاح ✅" });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async ({ id, pour_status }: { id: number; pour_status: string }) => {
      const { error } = await supabase
        .from("clients")
        .update({ pour_status, is_converted: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-clients"] });
      toast({ title: "تم تحويل العميل بنجاح ✅" });
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "اسم العميل مطلوب", variant: "destructive" });
      return;
    }
    addMutation.mutate({
      name: form.name.trim(),
      phone: form.phone || null,
      status: form.status,
      notes: form.notes || null,
    });
  }

  async function importContact() {
    try {
      if (!("contacts" in navigator)) {
        toast({ title: "غير مدعوم", description: "هذه الميزة تعمل فقط على المتصفحات المدعومة في الموبايل", variant: "destructive" });
        return;
      }
      const contacts = await (navigator as any).contacts.select(
        ["name", "tel"],
        { multiple: false }
      );
      if (contacts?.length > 0) {
        const contact = contacts[0];
        setForm((f) => ({
          ...f,
          name: contact.name?.[0] || f.name,
          phone: contact.tel?.[0] || f.phone,
        }));
        toast({ title: "تم استيراد جهة الاتصال ✅" });
      }
    } catch {
      toast({ title: "تم إلغاء الاستيراد", variant: "destructive" });
    }
  }

  const filtered = (clients ?? []).filter((c) => {
    const matchesFilter = filter === "all" || c.status === filter;
    const matchesSearch =
      !search ||
      c.name.includes(search) ||
      (c.phone ?? "").includes(search);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-cairo font-bold text-foreground">المبيعات</h2>
          <Badge variant="secondary" className="font-cairo">{clients?.length ?? 0}</Badge>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="font-cairo gap-1">
          <Plus className="h-4 w-4" />
          إضافة عميل جديد
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث بالاسم أو رقم الهاتف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9 font-cairo"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={filter === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(opt.value)}
            className="font-cairo text-xs"
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Client cards */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-cairo">لا يوجد عملاء</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => {
            const cls = CLASSIFICATION_MAP[client.status] ?? CLASSIFICATION_MAP.inactive;
            return (
              <Card key={client.id} className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  {/* Top row */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-cairo font-bold text-foreground">{client.name}</h3>
                      {client.phone && (
                        <p className="text-sm text-muted-foreground font-cairo flex items-center gap-1 mt-0.5" dir="ltr">
                          <Phone className="h-3 w-3" />
                          {client.phone}
                        </p>
                      )}
                    </div>
                    <Badge className={`font-cairo text-[11px] border ${cls.color}`}>
                      {cls.label}
                    </Badge>
                  </div>

                  {/* Last contact */}
                  <p className="text-xs text-muted-foreground font-cairo">
                    آخر تواصل: {formatDistanceToNow(new Date(client.created_at), { addSuffix: true, locale: ar })}
                  </p>

                  {/* Notes */}
                  {client.notes && (
                    <p className="text-xs text-muted-foreground font-cairo line-clamp-2 bg-muted/50 rounded p-2">
                      {client.notes}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {client.phone && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-cairo text-xs gap-1 border-green-300 text-green-600 hover:bg-green-50"
                        asChild
                      >
                        <a
                          href={`https://wa.me/${client.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          واتساب
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-cairo text-xs gap-1 border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                      onClick={() => transferMutation.mutate({ id: client.id, pour_status: "pending" })}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      تحويل للمتابعة
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-cairo text-xs gap-1 border-blue-300 text-blue-600 hover:bg-blue-50"
                      onClick={() => transferMutation.mutate({ id: client.id, pour_status: "scheduled" })}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      تحويل للتنفيذ
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add client dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-cairo">إضافة عميل جديد</DialogTitle>
            <DialogDescription className="font-cairo text-muted-foreground">
              أدخل بيانات العميل الجديد
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label className="font-cairo">اسم العميل *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="font-cairo"
                placeholder="أدخل اسم العميل"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="font-cairo">رقم الهاتف</Label>
              <div className="flex gap-2">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="font-cairo flex-1"
                  dir="ltr"
                  placeholder="01xxxxxxxxx"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-cairo text-xs gap-1 shrink-0"
                  onClick={importContact}
                >
                  <ContactRound className="h-4 w-4" />
                  استيراد
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-cairo">التصنيف</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="font-cairo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hot" className="font-cairo">🔥 ساخن</SelectItem>
                  <SelectItem value="warm" className="font-cairo">🟠 دافئ</SelectItem>
                  <SelectItem value="cold" className="font-cairo">🔵 بارد</SelectItem>
                  <SelectItem value="inactive" className="font-cairo">⚫ خامل</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="font-cairo"
                rows={3}
                placeholder="أي ملاحظات عن العميل..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeDialog} className="font-cairo">إلغاء</Button>
            <Button onClick={handleSave} disabled={addMutation.isPending} className="font-cairo">
              {addMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
