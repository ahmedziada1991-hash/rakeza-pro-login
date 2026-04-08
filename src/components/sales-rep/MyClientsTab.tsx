import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { Phone, MessageCircle, FileText, CalendarDays, ArrowRightLeft, Mic, MicOff, Pencil, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const CLASSIFICATIONS = [
  { value: "all", label: "الكل", color: "" },
  { value: "hot", label: "ساخن", color: "bg-destructive/15 text-destructive border-destructive/30" },
  { value: "warm", label: "دافئ", color: "bg-chart-4/15 text-chart-4 border-chart-4/30" },
  { value: "cold", label: "بارد", color: "bg-chart-1/15 text-chart-1 border-chart-1/30" },
  { value: "inactive", label: "خامل", color: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30" },
  { value: "active", label: "نشط", color: "bg-chart-2/15 text-chart-2 border-chart-2/30" },
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
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [callResult, setCallResult] = useState("");
  const [callNotes, setCallNotes] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [pourDate, setPourDate] = useState<Date>();
  // Edit form state
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editClassification, setEditClassification] = useState("cold");
  const [editNotes, setEditNotes] = useState("");
  const [editArea, setEditArea] = useState("");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["my-clients", user?.id, filter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const saveCallMutation = useMutation({
    mutationFn: async () => {
      if (!callResult) throw new Error("اختر نتيجة المكالمة");

      const { error } = await (supabase as any).from("call_logs").insert({
        user_id: user!.id,
        client_id: selectedClient.id,
        employee_name: user!.email?.split("@")[0] || "",
        call_date: new Date().toISOString(),
        result: callResult,
        notes: callNotes,
      });
      if (error) throw error;

      // No last_contact column - skip update
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-clients"] });
      queryClient.invalidateQueries({ queryKey: ["my-calls-today"] });
      setCallDialogOpen(false);
      setCallResult("");
      setCallNotes("");
      toast({ title: "تم تسجيل المكالمة بنجاح ✅" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

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
    mutationFn: async (clientId: string) => {
      const { error } = await (supabase as any)
        .from("clients")
        .update({ status: "followup" })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-clients"] });
      toast({ title: "تم تحويل العميل للمتابعة ✅" });
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

  const openEditDialog = (client: any) => {
    setSelectedClient(client);
    setEditName(client.name || "");
    setEditPhone(client.phone || "");
    setEditClassification(client.status || "active");
    setEditNotes(client.notes || "");
    setEditArea(client.area || "");
    setEditDialogOpen(true);
  };

  const toggleRecording = async () => {
    if (isRecording && mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        // For now just note it in the call notes
        setCallNotes((prev) => prev + "\n🎙️ [تسجيل صوتي مرفق]");
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch {
      toast({ title: "لا يمكن الوصول للميكروفون", variant: "destructive" });
    }
  };

  const getClassBadge = (classification: string) => {
    const cls = CLASSIFICATIONS.find((c) => c.value === classification);
    return cls ? (
      <Badge className={`${cls.color} font-cairo text-xs`}>{cls.label}</Badge>
    ) : null;
  };

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {CLASSIFICATIONS.map((c) => (
          <Button
            key={c.value}
            variant={filter === c.value ? "default" : "outline"}
            size="sm"
            className="font-cairo"
            onClick={() => setFilter(c.value)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center font-cairo text-muted-foreground py-8">جاري التحميل...</p>
      ) : !clients?.length ? (
        <p className="text-center font-cairo text-muted-foreground py-8">لا يوجد عملاء</p>
      ) : (
        <div className="space-y-3">
          {clients.map((client: any) => (
            <Card key={client.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-cairo font-bold text-foreground">{client.name}</h3>
                    <p className="text-sm text-muted-foreground font-cairo direction-ltr">{client.phone}</p>
                  </div>
                  {getClassBadge(client.status)}
                </div>

                <div className="flex flex-wrap gap-2">
                  {/* WhatsApp */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-cairo gap-1 text-chart-2 border-chart-2/30 hover:bg-chart-2/10"
                    onClick={() => {
                      const phone = (client.phone || "").replace(/[^0-9]/g, "");
                      window.open(`https://wa.me/${phone}`, "_blank");
                    }}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    واتساب
                  </Button>

                  {/* Log call */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-cairo gap-1"
                    onClick={() => {
                      setSelectedClient(client);
                      setCallDialogOpen(true);
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    تسجيل مكالمة
                  </Button>

                  {/* Pour date */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-cairo gap-1"
                    onClick={() => {
                      setSelectedClient(client);
                      setDateDialogOpen(true);
                    }}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    موعد الصبة
                  </Button>

                  {/* Transfer - only for hot/warm */}
                  {(client.status === "hot" || client.status === "warm") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-cairo gap-1 text-primary"
                      onClick={() => transferMutation.mutate(client.id)}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      تحويل للمتابعة
                    </Button>
                  )}

                  {/* Edit */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-cairo gap-1"
                    onClick={() => openEditDialog(client)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    تعديل
                  </Button>
                  {/* Show call history */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-cairo gap-1"
                    onClick={() => setExpandedClientId(expandedClientId === client.id ? null : client.id)}
                  >
                    {expandedClientId === client.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    سجل المكالمات
                  </Button>
                </div>

                {/* Expandable Call History */}
                {expandedClientId === client.id && (
                  <ClientCallHistory clientId={client.id} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Call Log Dialog */}
      <Dialog open={callDialogOpen} onOpenChange={setCallDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo">تسجيل مكالمة - {selectedClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-cairo">نتيجة المكالمة</Label>
              <Select value={callResult} onValueChange={setCallResult}>
                <SelectTrigger className="font-cairo">
                  <SelectValue placeholder="اختر النتيجة" />
                </SelectTrigger>
                <SelectContent>
                  {CALL_RESULTS.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="font-cairo">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="أضف ملاحظاتك هنا..."
                className="font-cairo min-h-[80px]"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              className={cn("font-cairo gap-2", isRecording && "text-destructive border-destructive")}
              onClick={toggleRecording}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {isRecording ? "إيقاف التسجيل" : "تسجيل صوتي"}
            </Button>

            <Button
              onClick={() => saveCallMutation.mutate()}
              disabled={saveCallMutation.isPending}
              className="w-full font-cairo"
            >
              {saveCallMutation.isPending ? "جاري الحفظ..." : "حفظ المكالمة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                <Calendar
                  mode="single"
                  selected={pourDate}
                  onSelect={setPourDate}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Button
              onClick={() => savePourDateMutation.mutate()}
              disabled={savePourDateMutation.isPending || !pourDate}
              className="w-full font-cairo"
            >
              {savePourDateMutation.isPending ? "جاري الحفظ..." : "حفظ الموعد"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Edit Client Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
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
                <SelectTrigger className="font-cairo">
                  <SelectValue />
                </SelectTrigger>
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
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="font-cairo min-h-[80px]" />
            </div>
            <Button
              onClick={() => editClientMutation.mutate()}
              disabled={editClientMutation.isPending}
              className="w-full font-cairo"
            >
              {editClientMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
