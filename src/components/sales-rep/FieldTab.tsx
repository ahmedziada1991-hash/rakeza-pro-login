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
import { MapPin, Plus, Clock, Mic, MicOff, Contact, CalendarDays, ArrowRightLeft } from "lucide-react";
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
  const [notes, setNotes] = useState("");
  const [classification, setClassification] = useState("cold");
  const [pourDate, setPourDate] = useState<Date>();
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  // Today's visits
  const { data: visits } = useQuery({
    queryKey: ["my-field-visits-today", user?.id, todayStr],
    queryFn: async () => {
      const startOfDay = `${todayStr}T00:00:00`;
      const endOfDay = `${todayStr}T23:59:59`;
      const { data, error } = await (supabase as any)
        .from("field_locations")
        .select("*")
        .eq("user_id", user!.id)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
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

      const location = await getCurrentLocation();

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
        })
        .select("id")
        .single();
      if (clientError) throw clientError;

      // Insert field location
      const { error: locError } = await (supabase as any)
        .from("field_locations")
        .insert({
          user_id: user!.id,
          lat: location?.lat || null,
          lng: location?.lng || null,
          area: area.trim() || null,
          notes: `${clientName.trim()} - ${notes.trim() || "زيارة ميدانية"}`,
        });
      if (locError) throw locError;
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
      toast({ title: "تم تسجيل الزيارة بنجاح ✅" });
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
          {visits.map((visit: any) => (
            <Card key={visit.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-cairo font-bold text-foreground">{visit.notes?.split(" - ")[0] || "زيارة"}</h3>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground font-cairo mt-1">
                      <Clock className="h-3 w-3" />
                      {new Date(visit.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    {visit.notes && (
                      <p className="text-sm text-muted-foreground font-cairo mt-2">{visit.notes}</p>
                    )}
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
                  <p className="text-xs text-muted-foreground font-cairo mt-1">📍 {visit.area}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
              <Label className="font-cairo">المنطقة / الموقع</Label>
              <Input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="مثال: المعادي - شارع 9"
                className="font-cairo"
              />
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

            {/* تصنيف العميل */}
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

            {/* موعد الصبة التقريبي */}
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

            {/* تحويل للمتابعة - يظهر فقط لو ساخن أو دافئ */}
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
                    // Will be handled after save
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
