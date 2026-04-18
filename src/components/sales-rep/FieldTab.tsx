import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClientQualificationForm, QualificationData, INITIAL_QUALIFICATION_DATA } from "./ClientQualificationForm";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { MapPin, Plus, Clock, Mic, MicOff, Contact, CalendarDays, ArrowRightLeft, Phone, MessageCircle, FileText } from "lucide-react";
import { CallLogDialog } from "./CallLogDialog";
import { PourDateAlerts } from "./PourDateAlerts";
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
  const recorder = useAudioRecorder();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [area, setArea] = useState("");
  const [savedLocation, setSavedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [notes, setNotes] = useState("");
  const [classification, setClassification] = useState("cold");
  const [price, setPrice] = useState<string>("");
  const [pourDate, setPourDate] = useState<Date>();
  const [qualData, setQualData] = useState<QualificationData>(INITIAL_QUALIFICATION_DATA);
  const [qualScore, setQualScore] = useState(0);
  const [callLogDialogOpen, setCallLogDialogOpen] = useState(false);
  const [callLogClient, setCallLogClient] = useState<any>(null);

  const { data: visits } = useQuery({
    queryKey: ["my-field-visits-today", user?.id, todayStr],
    queryFn: async () => {
      const startOfDay = `${todayStr}T00:00:00`;
      const endOfDay = `${todayStr}T23:59:59`;
      const { data, error } = await (supabase as any)
        .from("field_locations")
        .select("*, clients:client_id(id, name, phone, status, expected_pour_date)")
        .eq("user_id", user!.id)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Call counts for visit clients
  const visitClientIds = (visits || []).map((v: any) => v.clients?.id).filter(Boolean);
  const { data: callCounts = {} } = useQuery({
    queryKey: ["field-call-counts", visitClientIds],
    queryFn: async () => {
      if (!visitClientIds.length) return {};
      const { data, error } = await (supabase as any)
        .from("call_logs")
        .select("client_id")
        .in("client_id", visitClientIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => { counts[r.client_id] = (counts[r.client_id] || 0) + 1; });
      return counts;
    },
    enabled: visitClientIds.length > 0,
  });

  const getCurrentLocation = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
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

      const { data: newClient, error: clientError } = await (supabase as any)
        .from("clients")
        .insert({
          name: clientName.trim(),
          phone: clientPhone.trim(),
          area: qualData.area || area.trim() || null,
          notes: notes.trim() || null,
          status: classification,
          expected_pour_date: qualData.expectedPourDate ? qualData.expectedPourDate.toISOString() : (pourDate ? pourDate.toISOString() : null),
          assigned_sales_id: user!.id,
          project_type: qualData.projectType || null,
          payment_type: qualData.paymentType || null,
          has_current_project: qualData.hasCurrentProject,
          estimated_quantity: qualData.knowsQuantity === "yes" ? qualData.estimatedQuantity : null,
          has_other_supplier: qualData.hasOtherSupplier,
          qualification_score: qualScore,
          price: price.trim() ? Number(price) : null,
        })
        .select("id")
        .single();
      if (clientError) throw clientError;

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

      // Upload audio and create call log
      let audioUrl: string | null = null;
      if (recorder.audioBlob) {
        audioUrl = await recorder.uploadAudio(newClient.id);
      }

      const allNotes = [notes.trim(), recorder.transcribedText].filter(Boolean).join("\n");

      await (supabase as any).from("call_logs").insert({
        user_id: user!.id,
        client_id: newClient.id,
        employee_name: user!.email?.split("@")[0] || "",
        call_date: new Date().toISOString(),
        call_type: "field_visit",
        result: "completed",
        notes: allNotes || "زيارة ميدانية",
        audio_url: audioUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-field-visits-today"] });
      queryClient.invalidateQueries({ queryKey: ["my-visits-today"] });
      queryClient.invalidateQueries({ queryKey: ["my-clients"] });
      queryClient.invalidateQueries({ queryKey: ["field-call-counts"] });
      setDialogOpen(false);
      setClientName("");
      setClientPhone("");
      setArea("");
      setNotes("");
      setClassification("cold");
      setPrice("");
      setPourDate(undefined);
      setSavedLocation(null);
      recorder.resetRecording();
      setQualData(INITIAL_QUALIFICATION_DATA);
      setQualScore(0);
      recorder.resetRecording();
      toast({ title: "تم تسجيل الزيارة بنجاح ✅" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async ({ client, newStatus }: { client: any; newStatus: string }) => {
      // Fetch latest price for accuracy
      const { data: full } = await (supabase as any)
        .from("clients").select("price, name").eq("id", client.id).maybeSingle();
      const { error } = await (supabase as any)
        .from("clients")
        .update({ status: newStatus })
        .eq("id", client.id);
      if (error) throw error;
      return { client: { ...client, ...(full || {}) }, newStatus };
    },
    onSuccess: ({ client, newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["my-field-visits-today"] });
      queryClient.invalidateQueries({ queryKey: ["my-clients"] });
      const label = newStatus === "contacted" ? "المتابعة" : "التنفيذ";
      if (newStatus === "contacted") {
        if (client.price != null && client.price !== "") {
          toast({
            title: `تم تحويل ${client.name} لـ${label} ✅`,
            description: `السعر المتفق عليه: ${client.price} ج/م³`,
          });
        } else {
          toast({
            title: `تم تحويل ${client.name} لـ${label}`,
            description: "⚠️ تنبيه: لم يتم تسجيل السعر لهذا العميل",
            variant: "destructive",
          });
        }
      } else {
        toast({ title: `تم تحويل ${client.name} لـ${label} ✅` });
      }
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const importContact = async () => {
    try {
      if ("contacts" in navigator && "ContactsManager" in window) {
        const contacts = await (navigator as any).contacts.select(["name", "tel"], { multiple: false });
        if (contacts?.length) {
          setClientName(contacts[0].name?.[0] || "");
          setClientPhone(contacts[0].tel?.[0] || "");
        }
      } else {
        toast({ title: "غير مدعوم", description: "استيراد جهات الاتصال غير مدعوم في هذا المتصفح", variant: "destructive" });
      }
    } catch { toast({ title: "تم الإلغاء", variant: "destructive" }); }
  };

  const normalizePhone = (phone: string) => {
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) cleaned = "20" + cleaned.slice(1);
    return cleaned;
  };

  return (
    <div className="space-y-4">
      {/* Pour date alerts */}
      <PourDateAlerts />

      <Button onClick={() => setDialogOpen(true)} className="w-full font-cairo gap-2">
        <Plus className="h-4 w-4" />
        تسجيل زيارة جديدة
      </Button>

      {!visits?.length ? (
        <p className="text-center font-cairo text-muted-foreground py-8">لا توجد زيارات اليوم</p>
      ) : (
        <div className="space-y-3">
          {visits.map((visit: any) => {
            const client = visit.clients;
            const cPhone = client?.phone || "";
            const cName = client?.name || visit.notes?.split(" - ")[0] || "زيارة";

            return (
              <Card key={visit.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-cairo font-bold text-foreground">{cName}</h3>
                      {cPhone && <p className="text-sm text-muted-foreground font-cairo mt-0.5" dir="ltr">📞 {cPhone}</p>}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground font-cairo mt-1">
                        <Clock className="h-3 w-3" />
                        {new Date(visit.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    {visit.lat && visit.lng && (
                      <Button size="sm" variant="outline" className="font-cairo gap-1 shrink-0"
                        onClick={() => window.open(`https://www.google.com/maps?q=${visit.lat},${visit.lng}`, "_blank")}>
                        <MapPin className="h-3.5 w-3.5" />
                        الخريطة
                      </Button>
                    )}
                  </div>

                  {/* Pour date */}
                  {client?.expected_pour_date && (
                    <div className={cn(
                      "flex items-center gap-1.5 text-xs font-cairo rounded-md px-2 py-1",
                      client.expected_pour_date.startsWith(todayStr)
                        ? "bg-destructive/10 text-destructive font-bold"
                        : "bg-muted/50 text-muted-foreground"
                    )}>
                      <CalendarDays className="h-3 w-3" />
                      موعد الصبة: {format(new Date(client.expected_pour_date), "d/M/yyyy")}
                      {client.expected_pour_date.startsWith(todayStr) && " ⚠️ اليوم!"}
                    </div>
                  )}

                  {visit.area && <p className="text-xs text-muted-foreground font-cairo">📍 {visit.area}</p>}
                  {visit.notes && <p className="text-xs text-muted-foreground font-cairo bg-muted/50 rounded p-2">{visit.notes}</p>}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {cPhone && (
                      <Button size="sm" variant="outline" className="font-cairo text-xs gap-1"
                        onClick={() => window.open(`tel:${cPhone.replace(/\D/g, "")}`, "_self")}>
                        <Phone className="h-3.5 w-3.5" />
                        اتصال
                      </Button>
                    )}
                    {cPhone && (
                      <Button size="sm" variant="outline" className="font-cairo text-xs gap-1 text-chart-2 border-chart-2/30 hover:bg-chart-2/10"
                        onClick={() => window.open(`https://wa.me/${normalizePhone(cPhone)}`, "_blank")}>
                        <MessageCircle className="h-3.5 w-3.5" />
                        واتساب
                      </Button>
                    )}
                    {client && (
                      <Button size="sm" variant="outline" className="font-cairo text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                        onClick={() => transferMutation.mutate({ clientId: client.id, newStatus: "contacted" })}>
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        تحويل لمتابعة
                      </Button>
                    )}
                    {client && (
                      <Button size="sm" variant="outline" className="font-cairo text-xs gap-1 text-chart-4 border-chart-4/30 hover:bg-chart-4/10"
                        onClick={() => transferMutation.mutate({ clientId: client.id, newStatus: "execution" })}>
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        تحويل لتنفيذ
                      </Button>
                    )}
                    {client && (
                      <Button size="sm" variant="outline" className="font-cairo text-xs gap-1"
                        onClick={() => { setCallLogClient(client); setCallLogDialogOpen(true); }}>
                        <FileText className="h-3.5 w-3.5" />
                        سجل المكالمات
                        {callCounts[client.id] > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1 h-4 min-w-4">{callCounts[client.id]}</Badge>
                        )}
                      </Button>
                    )}
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

      {/* New Visit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-cairo">تسجيل زيارة ميدانية جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-cairo">اسم العميل</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="اسم العميل الجديد" className="font-cairo" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">رقم الهاتف</Label>
              <div className="flex gap-2">
                <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="رقم الهاتف" className="font-cairo flex-1" />
                <Button variant="outline" size="icon" onClick={importContact} title="استيراد من جهات الاتصال">
                  <Contact className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">الموقع الجغرافي</Label>
              <Button type="button" variant="outline"
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
                }}>
                <MapPin className="h-4 w-4" />
                {isGettingLocation ? "جاري تحديد الموقع..." : savedLocation ? `📍 ${savedLocation.lat.toFixed(6)}, ${savedLocation.lng.toFixed(6)}` : "تسجيل موقعي الحالي 📍"}
              </Button>
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">ملاحظات</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات العميل..." className="font-cairo min-h-[80px]" />
              {recorder.transcribedText && (
                <p className="text-xs text-muted-foreground font-cairo bg-muted/50 rounded p-2">🎙️ نص مكتوب: {recorder.transcribedText}</p>
              )}
            </div>

            {/* Qualification Questions */}
            <div className="border-t pt-4">
              <p className="font-cairo font-bold text-sm mb-3">أسئلة التصنيف التلقائي</p>
              <ClientQualificationForm
                onChange={(qData, status, score) => {
                  setQualData(qData);
                  setClassification(status);
                  setQualScore(score);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label className="font-cairo">تصنيف العميل (يمكنك تغييره يدوياً)</Label>
              <Select value={classification} onValueChange={setClassification}>
                <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASSIFICATIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="font-cairo">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={cn("font-cairo gap-2", recorder.isRecording && "text-destructive border-destructive")}
              onClick={async () => {
                if (recorder.isRecording) { recorder.stopRecording(); }
                else { try { await recorder.startRecording(); } catch { toast({ title: "لا يمكن الوصول للميكروفون", variant: "destructive" }); } }
              }}
            >
              {recorder.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {recorder.isRecording ? "إيقاف التسجيل" : "تسجيل صوتي 🎙️"}
            </Button>
            {recorder.audioBlob && (
              <p className="text-xs text-muted-foreground font-cairo">🎙️ تسجيل صوتي جاهز للرفع</p>
            )}
            <Button onClick={() => saveVisitMutation.mutate()} disabled={saveVisitMutation.isPending} className="w-full font-cairo">
              {saveVisitMutation.isPending ? "جاري الحفظ..." : "حفظ الزيارة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
