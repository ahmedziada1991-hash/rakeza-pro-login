import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { MapPin, Plus, Clock, Mic, MicOff, Contact, CalendarDays, ArrowRightLeft, Phone, MessageCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const CLASSIFICATIONS = [
  { value: "hot", label: "ساخن" },
  { value: "warm", label: "دافئ" },
  { value: "cold", label: "بارد" },
  { value: "inactive", label: "خامل" },
];

export function FieldTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const todayStr = new Date().toISOString().split("T")[0];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [area, setArea] = useState("");
  const [savedLocation, setSavedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [notes, setNotes] = useState("");
  const [classification, setClassification] = useState("cold");
  const [pourDate, setPourDate] = useState<Date>();
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [callHistoryDialogOpen, setCallHistoryDialogOpen] = useState(false);
  const [selectedVisitClientId, setSelectedVisitClientId] = useState<number | null>(null);

  // Today's visits with client data
  const { data: visits } = useQuery({
    queryKey: ["my-field-visits-today", user?.id, todayStr],
    queryFn: async () => {
      const startOfDay = `${todayStr}T00:00:00`;
      const endOfDay = `${todayStr}T23:59:59`;
      const { data, error } = await (supabase as any)
        .from("field_locations")
        .select("*, clients:client_id(id, name, phone, status)")
        .eq("user_id", user!.id)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Call history for selected client
  const { data: callHistory } = useQuery({
    queryKey: ["client-call-history", selectedVisitClientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("call_logs")
        .select("*")
        .eq("client_id", selectedVisitClientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedVisitClientId,
  });

  const getCurrentLocation = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const saveVisitMutation = useMutation({
    mutationFn: async () => {
      if (!clientName.trim()) throw new Error("أدخل اسم العميل");
      if (!clientPhone.trim()) throw new Error("أدخل رقم الهاتف");

      const location = savedLocation || await getCurrentLocation();

      // Insert client
      const { data: newClient, error: clientError } = await (supabase as any)
        .from("clients")
        .insert({
          name: clientName.trim(),
          phone: clientPhone.trim(),
          area: area.trim() || null,
          notes: notes.trim() || null,
          status: classification === "hot" || classification === "warm" ? "followup" : "active",
          expected_pour_date: pourDate ? pourDate.toISOString() : null,
          assigned_sales_id: user!.id,
        })
        .select("id")
        .single();
      if (clientError) throw clientError;

      // Insert field location with client_id
      const { error: locError } = await (supabase as any)
        .from("field_locations")
        .insert({
          user_id: user!.id,
          client_id: newClient.id,
          lat: location?.lat || null,
          lng: location?.lng || null,
          area: area.trim() || null,
          notes: `${clientName.trim()} - ${notes.trim() || "زيارة ميدانية"}`,
        });
      if (locError) throw locError;

      // Save visit notes as a call_log entry of type "field_visit"
      if (notes.trim()) {
        await (supabase as any)
          .from("call_logs")
          .insert({
            user_id: user!.id,
            client_id: newClient.id,
            employee_name: user!.email?.split("@")[0] || "",
            call_date: new Date().toISOString(),
            result: "field_visit",
            notes: notes.trim(),
          });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-field-visits-today"] });
      queryClient.invalidateQueries({ queryKey: ["my-visits-today"] });
      queryClient.invalidateQueries({ queryKey: ["my-clients"] });
      setDialogOpen(false);
      setClientName("");
      setClientPhone("");
      setArea("");
      setNotes("");
      setClassification("cold");
      setPourDate(undefined);
      setSavedLocation(null);
      toast({ title: "تم تسجيل الزيارة بنجاح ✅" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async ({ clientId, newStatus }: { clientId: number; newStatus: string }) => {
      const { error } = await (supabase as any)
        .from("clients")
        .update({ status: newStatus })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["my-field-visits-today"] });
      queryClient.invalidateQueries({ queryKey: ["my-clients"] });
      const label = newStatus === "contacted" ? "المتابعة" : "التنفيذ";
      toast({ title: `تم تحويل العميل لـ${label} ✅` });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const importContact = async () => {
    try {
      if ("contacts" in navigator && "ContactsManager" in window) {
        const contacts = await (navigator as any).contacts.select(
          ["name", "tel"],
          { multiple: false }
        );
        if (contacts?.length) {
          setClientName(contacts[0].name?.[0] || "");
          setClientPhone(contacts[0].tel?.[0] || "");
        }
      } else {
        toast({
          title: "غير مدعوم",
          description: "استيراد جهات الاتصال غير مدعوم في هذا المتصفح",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "تم الإلغاء", variant: "destructive" });
    }
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
        setNotes((prev) => prev + "\n🎙️ [تسجيل صوتي مرفق]");
      };
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch {
      toast({ title: "لا يمكن الوصول للميكروفون", variant: "destructive" });
    }
  };

  const normalizePhone = (phone: string) => {
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) cleaned = "20" + cleaned.slice(1);
    return cleaned;
  };

  const RESULT_LABELS: Record<string, string> = {
    interested: "مهتم",
    not_interested: "غير مهتم",
    postponed: "تأجيل",
    no_answer: "لم يرد",
    completed: "مكتمل",
    field_visit: "زيارة ميدانية",
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={() => setDialogOpen(true)}
        className="w-full font-cairo gap-2"
      >
        <Plus className="h-4 w-4" />
        تسجيل زيارة جديدة
      </Button>

      {/* Today's visits list */}
      {!visits?.length ? (
        <p className="text-center font-cairo text-muted-foreground py-8">لا توجد زيارات اليوم</p>
      ) : (
        <div className="space-y-3">
          {visits.map((visit: any) => {
            const client = visit.clients;
            const clientPhone = client?.phone || "";
            const clientName = client?.name || visit.notes?.split(" - ")[0] || "زيارة";

            return (
              <Card key={visit.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-cairo font-bold text-foreground">{clientName}</h3>
                      {clientPhone && (
                        <p className="text-sm text-muted-foreground font-cairo mt-0.5" dir="ltr">
                          📞 {clientPhone}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground font-cairo mt-1">
                        <Clock className="h-3 w-3" />
                        {new Date(visit.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    {visit.lat && visit.lng && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-cairo gap-1 shrink-0"
                        onClick={() =>
                          window.open(
                            `https://www.google.com/maps?q=${visit.lat},${visit.lng}`,
                            "_blank"
                          )
                        }
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        الخريطة
                      </Button>
                    )}
                  </div>

                  {visit.area && (
                    <p className="text-xs text-muted-foreground font-cairo">📍 {visit.area}</p>
                  )}
                  {visit.notes && (
                    <p className="text-xs text-muted-foreground font-cairo bg-muted/50 rounded p-2">{visit.notes}</p>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {/* اتصال */}
                    {clientPhone && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-cairo text-xs gap-1"
                        onClick={() => window.open(`tel:${clientPhone.replace(/\D/g, "")}`, "_self")}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        اتصال
                      </Button>
                    )}

                    {/* واتساب */}
                    {clientPhone && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-cairo text-xs gap-1 text-chart-2 border-chart-2/30 hover:bg-chart-2/10"
                        onClick={() => window.open(`https://wa.me/${normalizePhone(clientPhone)}`, "_blank")}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        واتساب
                      </Button>
                    )}

                    {/* تحويل لمتابعة */}
                    {client && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-cairo text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                        onClick={() => transferMutation.mutate({ clientId: client.id, newStatus: "contacted" })}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        تحويل لمتابعة
                      </Button>
                    )}

                    {/* تحويل لتنفيذ */}
                    {client && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-cairo text-xs gap-1 text-chart-4 border-chart-4/30 hover:bg-chart-4/10"
                        onClick={() => transferMutation.mutate({ clientId: client.id, newStatus: "execution" })}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        تحويل لتنفيذ
                      </Button>
                    )}

                    {/* سجل المكالمات */}
                    {client && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-cairo text-xs gap-1"
                        onClick={() => {
                          setSelectedVisitClientId(client.id);
                          setCallHistoryDialogOpen(true);
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        سجل المكالمات
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Call History Dialog */}
      <Dialog open={callHistoryDialogOpen} onOpenChange={setCallHistoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo">سجل المكالمات والملاحظات</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {!callHistory?.length ? (
              <p className="text-center font-cairo text-muted-foreground py-6">لا يوجد سجل مكالمات</p>
            ) : (
              callHistory.map((log: any) => (
                <Card key={log.id}>
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-cairo font-bold text-foreground">
                        {RESULT_LABELS[log.result] || log.result}
                      </span>
                      <span className="text-xs text-muted-foreground font-cairo">
                        {log.call_date ? format(new Date(log.call_date), "d/M/yyyy HH:mm") : ""}
                      </span>
                    </div>
                    {log.notes && (
                      <p className="text-xs text-muted-foreground font-cairo">{log.notes}</p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Visit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo">تسجيل زيارة ميدانية جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-cairo">اسم العميل</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="اسم العميل الجديد"
                className="font-cairo"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-cairo">رقم الهاتف</Label>
              <div className="flex gap-2">
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="رقم الهاتف"
                  className="font-cairo flex-1"
                />
                <Button variant="outline" size="icon" onClick={importContact} title="استيراد من جهات الاتصال">
                  <Contact className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-cairo">الموقع الجغرافي</Label>
              <Button
                type="button"
                variant="outline"
                className={cn("w-full font-cairo gap-2", savedLocation && "border-primary text-primary")}
                disabled={isGettingLocation}
                onClick={async () => {
                  setIsGettingLocation(true);
                  const loc = await getCurrentLocation();
                  setIsGettingLocation(false);
                  if (loc) {
                    setSavedLocation(loc);
                    setArea(`${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`);
                    toast({ title: "تم تسجيل موقعك ✅" });
                  } else {
                    toast({ title: "يرجى السماح بالوصول للموقع", variant: "destructive" });
                  }
                }}
              >
                <MapPin className="h-4 w-4" />
                {isGettingLocation ? "جاري تحديد الموقع..." : savedLocation ? `📍 ${savedLocation.lat.toFixed(6)}, ${savedLocation.lng.toFixed(6)}` : "تسجيل موقعي الحالي 📍"}
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات العميل..."
                className="font-cairo min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-cairo">تصنيف العميل</Label>
              <Select value={classification} onValueChange={setClassification}>
                <SelectTrigger className="font-cairo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLASSIFICATIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="font-cairo">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-cairo">موعد الصبة التقريبي</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full font-cairo justify-start", !pourDate && "text-muted-foreground")}>
                    <CalendarDays className="h-4 w-4 ml-2" />
                    {pourDate ? format(pourDate, "yyyy-MM-dd") : "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={pourDate} onSelect={setPourDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {(classification === "hot" || classification === "warm") && (
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                <p className="text-xs font-cairo text-muted-foreground mb-2">
                  العميل {classification === "hot" ? "ساخن" : "دافئ"} - يمكن تحويله للمتابعة مباشرة
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="font-cairo gap-2 text-primary border-primary/30"
                  onClick={() => {
                    toast({ title: "سيتم تحويل العميل للمتابعة بعد الحفظ" });
                  }}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  تحويل للمتابعة بعد الحفظ
                </Button>
              </div>
            )}

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
              onClick={() => saveVisitMutation.mutate()}
              disabled={saveVisitMutation.isPending}
              className="w-full font-cairo"
            >
              {saveVisitMutation.isPending ? "جاري الحفظ..." : "حفظ الزيارة"}
            </Button>

            <p className="text-xs font-cairo text-muted-foreground text-center">
              📍 سيتم تسجيل موقعك الجغرافي تلقائياً عند الحفظ
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
