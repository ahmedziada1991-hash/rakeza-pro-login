import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { Phone, MessageCircle, FileText, CalendarDays, ArrowRightLeft, Mic, MicOff, Pencil, Clock, Plus, Contact, Search, Layers, Bot } from "lucide-react";
import { useClientPourHistory } from "@/hooks/useClientPourHistory";
import { CallLogDialog } from "./CallLogDialog";
import { AIAssistantDialog } from "./AIAssistantDialog";
import { PourDateAlerts } from "./PourDateAlerts";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const CLASSIFICATIONS = [
  { value: "all", label: "الكل", color: "" },
  { value: "hot", label: "ساخن", color: "bg-destructive/15 text-destructive border-destructive/30" },
  { value: "warm", label: "دافئ", color: "bg-chart-4/15 text-chart-4 border-chart-4/30" },
  { value: "cold", label: "بارد", color: "bg-chart-1/15 text-chart-1 border-chart-1/30" },
  { value: "followup", label: "متابعة", color: "bg-primary/15 text-primary border-primary/30" },
];

const CALL_RESULTS = [
  { value: "interested", label: "مهتم" },
  { value: "not_interested", label: "غير مهتم" },
  { value: "postponed", label: "تأجيل" },
  { value: "no_answer", label: "لم يرد" },
  { value: "completed", label: "مكتمل" },
];

export function MyClientsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [callLogDialogOpen, setCallLogDialogOpen] = useState(false);
  const [callLogClient, setCallLogClient] = useState<any>(null);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [pourDate, setPourDate] = useState<Date>();
  // Edit form state
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editClassification, setEditClassification] = useState("cold");
  const [editNotes, setEditNotes] = useState("");
  const [editArea, setEditArea] = useState("");
  const [editPourDate, setEditPourDate] = useState<Date | undefined>();
  // Add form state
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addClassification, setAddClassification] = useState("cold");
  const [addNotes, setAddNotes] = useState("");
  const [addArea, setAddArea] = useState("");
  const [addPourDate, setAddPourDate] = useState<Date>();
  const addRecorder = useAudioRecorder();

  // Call log counts per client
  const { data: callCounts = {} } = useQuery({
    queryKey: ["client-call-counts", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("call_logs")
        .select("client_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        counts[r.client_id] = (counts[r.client_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user,
  });

  const { data: allClients, isLoading: isLoadingClients } = useQuery({
    queryKey: ["my-clients", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const clients = (() => {
    if (!allClients) return [];
    if (filter === "followup") return allClients.filter((c: any) => c.assigned_followup_id != null);
    if (filter === "hot") return allClients.filter((c: any) => ["hot", "qualified", "active"].includes(c.status));
    if (filter === "warm") return allClients.filter((c: any) => ["contacted", "new"].includes(c.status));
    if (filter === "cold") return allClients.filter((c: any) => c.status === "cold");
    return allClients;
  })();

  const savePourDateMutation = useMutation({
    mutationFn: async () => {
      if (!pourDate) throw new Error("اختر تاريخ الصبة");
      const { error } = await (supabase as any)
        .from("clients")
        .update({ expected_pour_date: pourDate.toISOString() })
        .eq("id", selectedClient.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-clients"] });
      setDateDialogOpen(false);
      setPourDate(undefined);
      toast({ title: "تم حفظ موعد الصبة ✅" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async ({ clientId, newStatus }: { clientId: string; newStatus: string }) => {
      const { error } = await (supabase as any)
        .from("clients")
        .update({ status: newStatus })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["my-clients"] });
      const label = newStatus === "contacted" ? "المتابعة" : "التنفيذ";
      toast({ title: `تم تحويل العميل لـ${label} ✅` });
    },
  });

  const editClientMutation = useMutation({
    mutationFn: async () => {
      if (!editName.trim()) throw new Error("أدخل اسم العميل");
      const { error } = await (supabase as any)
        .from("clients")
        .update({
          name: editName.trim(),
          phone: editPhone.trim(),
          status: editClassification,
          notes: editNotes.trim() || null,
          area: editArea.trim() || null,
          expected_pour_date: editPourDate ? editPourDate.toISOString() : null,
        })
        .eq("id", selectedClient.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-clients"] });
      setEditDialogOpen(false);
      toast({ title: "تم تعديل بيانات العميل ✅" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const addClientMutation = useMutation({
    mutationFn: async () => {
      if (!addName.trim()) throw new Error("أدخل اسم العميل");
      if (!addPhone.trim()) throw new Error("أدخل رقم الهاتف");

      const { data: newClient, error } = await (supabase as any)
        .from("clients")
        .insert({
          name: addName.trim(),
          phone: addPhone.trim(),
          status: addClassification,
          notes: addNotes.trim() || null,
          area: addArea.trim() || null,
          expected_pour_date: addPourDate ? addPourDate.toISOString() : null,
          assigned_sales_id: user!.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Upload audio and create call log if recording exists
      if (addRecorder.audioBlob) {
        let audioUrl: string | null = null;
        audioUrl = await addRecorder.uploadAudio(newClient.id);

        const notes = [addNotes.trim(), addRecorder.transcribedText].filter(Boolean).join("\n");

        await (supabase as any).from("call_logs").insert({
          user_id: user!.id,
          client_id: newClient.id,
          employee_name: user!.email?.split("@")[0] || "",
          call_date: new Date().toISOString(),
          call_type: "field_visit",
          result: "completed",
          notes: notes || null,
          audio_url: audioUrl,
        });
      }
    },
    onSuccess: async () => {
      // Get the newly created client to auto-open call log
      const { data: latestClients } = await (supabase as any)
        .from("clients")
        .select("id, name")
        .eq("assigned_sales_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1);

      queryClient.invalidateQueries({ queryKey: ["my-clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-call-counts"] });
      setAddDialogOpen(false);
      setAddName("");
      setAddPhone("");
      setAddClassification("cold");
      setAddNotes("");
      setAddArea("");
      setAddPourDate(undefined);
      addRecorder.resetRecording();
      toast({ title: "تم إضافة العميل بنجاح ✅" });

      // Auto-open call log for the new client
      if (latestClients?.[0]) {
        setCallLogClient(latestClients[0]);
        setCallLogDialogOpen(true);
      }
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const openEditDialog = (client: any) => {
    setSelectedClient(client);
    setEditName(client.name || "");
    setEditPhone(client.phone || "");
    setEditClassification(client.status || "active");
    setEditNotes(client.notes || "");
    setEditArea(client.area || "");
    setEditPourDate(client.expected_pour_date ? new Date(client.expected_pour_date) : undefined);
    setEditDialogOpen(true);
  };

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    new: { label: "جديد", color: "bg-chart-4/15 text-chart-4 border-chart-4/30" },
    contacted: { label: "تم التواصل", color: "bg-chart-4/15 text-chart-4 border-chart-4/30" },
    qualified: { label: "مؤهل", color: "bg-destructive/15 text-destructive border-destructive/30" },
    converted: { label: "محول", color: "bg-chart-5/15 text-chart-5 border-chart-5/30" },
    active: { label: "نشط", color: "bg-destructive/15 text-destructive border-destructive/30" },
    hot: { label: "ساخن", color: "bg-destructive/15 text-destructive border-destructive/30" },
    warm: { label: "دافئ", color: "bg-chart-4/15 text-chart-4 border-chart-4/30" },
    cold: { label: "بارد", color: "bg-chart-1/15 text-chart-1 border-chart-1/30" },
    inactive: { label: "خامل", color: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30" },
    followup: { label: "متابعة", color: "bg-primary/15 text-primary border-primary/30" },
    execution: { label: "تنفيذ", color: "bg-chart-5/15 text-chart-5 border-chart-5/30" },
  };

  const getClassBadge = (classification: string) => {
    const cls = STATUS_LABELS[classification];
    return cls ? <Badge className={`${cls.color} font-cairo text-xs`}>{cls.label}</Badge> : null;
  };

  const filteredClients = (() => {
    const q = searchQuery.trim().toLowerCase();
    return (clients || []).filter((c: any) => !q || (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q));
  })();

  const allClientIds = (clients || []).map((c: any) => c.id);
  const { data: pourHistory = {} } = useClientPourHistory(allClientIds);

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      {/* Pour date alerts */}
      <PourDateAlerts />

      <Button onClick={() => setAddDialogOpen(true)} className="w-full font-cairo gap-2">
        <Plus className="h-4 w-4" />
        إضافة عميل جديد
      </Button>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث بالاسم أو رقم الهاتف..." className="font-cairo pr-9" />
      </div>

      <div className="flex gap-2 flex-wrap">
        {CLASSIFICATIONS.map((c) => (
          <Button key={c.value} variant={filter === c.value ? "default" : "outline"} size="sm" className="font-cairo" onClick={() => setFilter(c.value)}>
            {c.label}
          </Button>
        ))}
      </div>

      {isLoadingClients ? (
        <p className="text-center font-cairo text-muted-foreground py-8">جاري التحميل...</p>
      ) : !filteredClients.length ? (
        <p className="text-center font-cairo text-muted-foreground py-8">لا يوجد عملاء</p>
      ) : (
        <div className="space-y-3">
          {filteredClients.map((client: any) => {
            const isToday = client.expected_pour_date && client.expected_pour_date.startsWith(todayStr);
            return (
              <Card key={client.id} className={cn(isToday && "border-destructive/50 bg-destructive/5")}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => openEditDialog(client)}>
                    <div>
                      <h3 className="font-cairo font-bold text-foreground">{client.name}</h3>
                      <p className="text-sm text-muted-foreground font-cairo direction-ltr">{client.phone}</p>
                    </div>
                    {getClassBadge(client.status)}
                  </div>

                  {/* Pour date display */}
                  {client.expected_pour_date && (
                    <div className={cn(
                      "flex items-center gap-1.5 text-xs font-cairo rounded-md px-2 py-1",
                      isToday ? "bg-destructive/10 text-destructive font-bold" : "bg-muted/50 text-muted-foreground"
                    )}>
                      <CalendarDays className="h-3 w-3" />
                      موعد الصبة: {format(new Date(client.expected_pour_date), "d/M/yyyy")}
                      {isToday && " ⚠️ اليوم!"}
                    </div>
                  )}

                  {/* Pour history */}
                  {pourHistory[client.id] && (
                    <div className="flex flex-wrap gap-3 text-xs font-cairo bg-muted/50 rounded-md p-2">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        آخر صبة: {pourHistory[client.id].lastPourDate ? format(new Date(pourHistory[client.id].lastPourDate!), "d/M/yyyy") : "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {pourHistory[client.id].totalQuantity} م³
                      </span>
                      <span>{pourHistory[client.id].pourCount} صبة</span>
                    </div>
                  )}

                  {client.followup_name && (
                    <p className="text-xs text-muted-foreground font-cairo">المتابع: {client.followup_name}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {/* Call */}
                    <Button size="sm" variant="outline" className="font-cairo gap-1 text-chart-2 border-chart-2/30 hover:bg-chart-2/10"
                      onClick={() => window.open(`tel:${(client.phone || "").replace(/[^0-9]/g, "")}`)}>
                      <Phone className="h-3.5 w-3.5" />
                      اتصال
                    </Button>

                    {/* WhatsApp */}
                    <Button size="sm" variant="outline" className="font-cairo gap-1 text-chart-2 border-chart-2/30 hover:bg-chart-2/10"
                      onClick={() => window.open(`https://wa.me/${(client.phone || "").replace(/[^0-9]/g, "")}`, "_blank")}>
                      <MessageCircle className="h-3.5 w-3.5" />
                      واتساب
                    </Button>

                    {/* Transfer to followup */}
                    <Button size="sm" variant="outline" className="font-cairo gap-1 text-primary border-primary/30 hover:bg-primary/10"
                      onClick={() => transferMutation.mutate({ clientId: client.id, newStatus: "contacted" })}>
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      تحويل لمتابعة
                    </Button>

                    {/* Transfer to execution */}
                    <Button size="sm" variant="outline" className="font-cairo gap-1 text-chart-4 border-chart-4/30 hover:bg-chart-4/10"
                      onClick={() => transferMutation.mutate({ clientId: client.id, newStatus: "execution" })}>
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      تحويل لتنفيذ
                    </Button>

                    {/* Call log */}
                    <Button size="sm" variant="outline" className="font-cairo gap-1"
                      onClick={() => { setCallLogClient(client); setCallLogDialogOpen(true); }}>
                      <FileText className="h-3.5 w-3.5" />
                      سجل المكالمات
                      {callCounts[client.id] > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1 h-4 min-w-4">{callCounts[client.id]}</Badge>
                      )}
                    </Button>

                    {/* Pour date */}
                    <Button size="sm" variant="outline" className="font-cairo gap-1"
                      onClick={() => { setSelectedClient(client); setDateDialogOpen(true); }}>
                      <CalendarDays className="h-3.5 w-3.5" />
                      موعد الصبة
                    </Button>

                    {/* Edit */}
                    <Button size="sm" variant="outline" className="font-cairo gap-1"
                      onClick={() => openEditDialog(client)}>
                      <Pencil className="h-3.5 w-3.5" />
                      تعديل
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Call Log Dialog */}
      {callLogClient && (
        <CallLogDialog
          open={callLogDialogOpen}
          onOpenChange={setCallLogDialogOpen}
          clientId={callLogClient.id}
          clientName={callLogClient.name}
        />
      )}

      {/* Pour Date Dialog */}
      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-cairo">موعد الصبة المتوقع - {selectedClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full font-cairo", !pourDate && "text-muted-foreground")}>
                  <CalendarDays className="h-4 w-4 ml-2" />
                  {pourDate ? format(pourDate, "yyyy-MM-dd") : "اختر التاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={pourDate} onSelect={setPourDate} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Button onClick={() => savePourDateMutation.mutate()} disabled={savePourDateMutation.isPending || !pourDate} className="w-full font-cairo">
              {savePourDateMutation.isPending ? "جاري الحفظ..." : "حفظ الموعد"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-cairo">تعديل بيانات العميل</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-cairo">اسم العميل</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="font-cairo" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">رقم الهاتف</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="font-cairo" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">التصنيف</Label>
              <Select value={editClassification} onValueChange={setEditClassification}>
                <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASSIFICATIONS.filter((c) => c.value !== "all").map((c) => (
                    <SelectItem key={c.value} value={c.value} className="font-cairo">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">المنطقة</Label>
              <Input value={editArea} onChange={(e) => setEditArea(e.target.value)} className="font-cairo" placeholder="المنطقة / الموقع" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">موعد الصبة التقريبي</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full font-cairo justify-start", !editPourDate && "text-muted-foreground")}>
                    <CalendarDays className="h-4 w-4 ml-2" />
                    {editPourDate ? format(editPourDate, "yyyy-MM-dd") : "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={editPourDate} onSelect={setEditPourDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="font-cairo min-h-[80px]" />
            </div>
            <Button onClick={() => editClientMutation.mutate()} disabled={editClientMutation.isPending} className="w-full font-cairo">
              {editClientMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Client Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-cairo">إضافة عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-cairo">اسم العميل</Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} className="font-cairo" placeholder="اسم العميل" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">رقم الهاتف</Label>
              <div className="flex gap-2">
                <Input value={addPhone} onChange={(e) => setAddPhone(e.target.value)} className="font-cairo flex-1" placeholder="رقم الهاتف" />
                <Button variant="outline" size="icon" title="استيراد من جهات الاتصال" onClick={async () => {
                  try {
                    if ("contacts" in navigator && "ContactsManager" in window) {
                      const contacts = await (navigator as any).contacts.select(["name", "tel"], { multiple: false });
                      if (contacts?.length) {
                        setAddName(contacts[0].name?.[0] || addName);
                        setAddPhone(contacts[0].tel?.[0] || "");
                      }
                    } else {
                      toast({ title: "غير مدعوم", description: "استيراد جهات الاتصال غير مدعوم في هذا المتصفح", variant: "destructive" });
                    }
                  } catch { toast({ title: "تم الإلغاء", variant: "destructive" }); }
                }}>
                  <Contact className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">التصنيف</Label>
              <Select value={addClassification} onValueChange={setAddClassification}>
                <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASSIFICATIONS.filter((c) => c.value !== "all").map((c) => (
                    <SelectItem key={c.value} value={c.value} className="font-cairo">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">المنطقة</Label>
              <Input value={addArea} onChange={(e) => setAddArea(e.target.value)} className="font-cairo" placeholder="المنطقة / الموقع" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea value={addNotes} onChange={(e) => setAddNotes(e.target.value)} className="font-cairo min-h-[80px]" placeholder="ملاحظات..." />
              {addRecorder.transcribedText && (
                <p className="text-xs text-muted-foreground font-cairo bg-muted/50 rounded p-2">🎙️ نص مكتوب: {addRecorder.transcribedText}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">موعد الصبة التقريبي</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full font-cairo justify-start", !addPourDate && "text-muted-foreground")}>
                    <CalendarDays className="h-4 w-4 ml-2" />
                    {addPourDate ? format(addPourDate, "yyyy-MM-dd") : "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={addPourDate} onSelect={setAddPourDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={cn("font-cairo gap-2", addRecorder.isRecording && "text-destructive border-destructive")}
              onClick={async () => {
                if (addRecorder.isRecording) {
                  addRecorder.stopRecording();
                } else {
                  try { await addRecorder.startRecording(); }
                  catch { toast({ title: "لا يمكن الوصول للميكروفون", variant: "destructive" }); }
                }
              }}
            >
              {addRecorder.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {addRecorder.isRecording ? "إيقاف التسجيل" : "تسجيل صوتي 🎙️"}
            </Button>
            {addRecorder.audioBlob && (
              <p className="text-xs text-muted-foreground font-cairo">🎙️ تسجيل صوتي جاهز للرفع</p>
            )}
            <Button onClick={() => addClientMutation.mutate()} disabled={addClientMutation.isPending} className="w-full font-cairo">
              {addClientMutation.isPending ? "جاري الحفظ..." : "إضافة العميل"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
