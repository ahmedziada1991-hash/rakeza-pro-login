import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Phone, MessageCircle, FileText, CalendarDays, ArrowRightLeft,
  Search, ChevronDown, ChevronUp, AlertTriangle, Clock, Bell,
  Users, Flame, Snowflake, TrendingUp, CheckCircle2, Layers
} from "lucide-react";
import { useClientPourHistory } from "@/hooks/useClientPourHistory";
import { format, isToday } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";

const CLASSIFICATIONS: Record<string, { label: string; color: string }> = {
  hot: { label: "ساخن", color: "bg-destructive/15 text-destructive border-destructive/30" },
  warm: { label: "دافئ", color: "bg-chart-4/15 text-chart-4 border-chart-4/30" },
  cold: { label: "بارد", color: "bg-chart-1/15 text-chart-1 border-chart-1/30" },
  inactive: { label: "خامل", color: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30" },
  active: { label: "نشط", color: "bg-chart-2/15 text-chart-2 border-chart-2/30" },
  followup: { label: "متابعة", color: "bg-primary/15 text-primary border-primary/30" },
  execution: { label: "تنفيذ", color: "bg-chart-5/15 text-chart-5 border-chart-5/30" },
};

const CALL_RESULTS = [
  { value: "interested", label: "مهتم" },
  { value: "not_interested", label: "غير مهتم" },
  { value: "postponed", label: "تأجيل" },
  { value: "no_answer", label: "لم يرد" },
  { value: "completed", label: "مكتمل" },
];

const TAB_FILTERS: Record<string, string[]> = {
  all: [], // no filter - show all
  potential: ["new", "contacted", "qualified", "active"],
  dormant: ["hot"],
  current: ["converted"],
  appointments: [], // special - filter by confirmed_pour_date
};

export function FollowUpContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pourFilter, setPourFilter] = useState("all"); // all, has_pours, no_pours, high_volume
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [callLogViewId, setCallLogViewId] = useState<string | null>(null);

  // Call dialog state
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [callResult, setCallResult] = useState("");
  const [callNotes, setCallNotes] = useState("");
  const [nextFollowupDate, setNextFollowupDate] = useState<Date | undefined>();

  // Fetch clients assigned to this followup user
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["followup-clients", user?.id],
    queryFn: async () => {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_id", user!.id)
        .single();

      if (userError) throw userError;

      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("*, sales_user:users!clients_assigned_sales_id_fkey(name)")
        .eq("assigned_followup_id", userData.id)
        .order("created_at", { ascending: false });

      if (clientsError) throw clientsError;
      return (clientsData || []).map((c: any) => ({
        ...c,
        sales_rep_name: c.sales_user?.name || null,
      }));
    },
    enabled: !!user,
  });

  // Today's followup alerts
  const todayAlerts = clients.filter((c: any) =>
    c.next_followup_date && isToday(new Date(c.next_followup_date))
  );

  // Show alert notification for today's followups
  useEffect(() => {
    if (todayAlerts.length > 0) {
      toast({
        title: `📋 لديك ${todayAlerts.length} متابعة اليوم`,
        description: "يجب تسجيل ملاحظة لكل عميل لإغلاق التنبيه",
      });
    }
  }, [todayAlerts.length]);

  const getFilteredClients = () => {
    let filtered: any[] = [];
    if (activeTab === "all") {
      filtered = [...clients];
    } else if (activeTab === "appointments") {
      filtered = clients.filter((c: any) => c.confirmed_pour_date);
      filtered.sort((a: any, b: any) =>
        new Date(a.next_followup_date).getTime() - new Date(b.next_followup_date).getTime()
      );
    } else {
      const statuses = TAB_FILTERS[activeTab] || [];
      filtered = clients.filter((c: any) => statuses.includes(c.status));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (c: any) => (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q)
      );
    }

    // Pour history filter
    if (pourFilter !== "all") {
      filtered = filtered.filter((c: any) => {
        const h = pourHistory[c.id];
        if (pourFilter === "no_pours") return !h || h.pourCount === 0;
        if (pourFilter === "has_pours") return h && h.pourCount > 0;
        if (pourFilter === "high_volume") return h && h.totalQuantity >= 50;
        return true;
      });
    }

    return filtered;
  };

  const allClientIds = clients.map((c: any) => c.id);
  const { data: pourHistory = {} } = useClientPourHistory(allClientIds);

  // Save follow-up call
  const saveCallMutation = useMutation({
    mutationFn: async () => {
      if (!callResult) throw new Error("اختر نتيجة المكالمة");
      if (!callNotes.trim()) throw new Error("الملاحظات إجبارية");

      // Insert into call_logs with call_type = 'followup'
      const { error: logError } = await (supabase as any).from("call_logs").insert({
        user_id: user!.id,
        client_id: selectedClient.id,
        employee_name: user!.email?.split("@")[0] || "",
        call_date: new Date().toISOString(),
        result: callResult,
        notes: callNotes.trim(),
        call_type: "followup",
      });
      if (logError) throw logError;

      // Update client next_followup_date if provided
      if (nextFollowupDate) {
        await (supabase as any)
          .from("clients")
          .update({ next_followup_date: nextFollowupDate.toISOString() })
          .eq("id", selectedClient.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-clients"] });
      setCallDialogOpen(false);
      setCallResult("");
      setCallNotes("");
      setNextFollowupDate(undefined);
      toast({ title: "تم تسجيل مكالمة المتابعة بنجاح ✅" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  // Transfer to execution
  const transferMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await (supabase as any)
        .from("clients")
        .update({ status: "execution" })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-clients"] });
      toast({ title: "تم تحويل العميل للتنفيذ ✅" });
    },
  });

  // Generate quote PDF
  const generateQuotePDF = async (client: any) => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFont("helvetica");
    doc.setFontSize(18);
    doc.text("Price Quote / عرض سعر", 105, 30, { align: "center" });
    doc.setFontSize(12);
    doc.text(`Client: ${client.name}`, 20, 50);
    doc.text(`Phone: ${client.phone || "N/A"}`, 20, 60);
    doc.text(`Date: ${format(new Date(), "yyyy-MM-dd")}`, 20, 70);
    doc.text(`Area: ${client.area || "N/A"}`, 20, 80);
    doc.text("---", 20, 95);
    doc.text("Details to be filled by management", 20, 110);
    doc.save(`quote_${client.name}.pdf`);
    toast({ title: "تم تحميل عرض السعر ✅" });
  };

  const filteredClients = getFilteredClients();

  return (
    <div className="space-y-4" dir="rtl">
      <h2 className="text-xl font-cairo font-bold text-foreground">لوحة المتابعة</h2>

      {/* Stats cards */}
      {(() => {
        const hotCount = clients.filter((c: any) => c.status === "hot").length;
        const warmCount = clients.filter((c: any) => c.status === "warm").length;
        const coldCount = clients.filter((c: any) => c.status === "cold" || c.status === "inactive").length;
        const activeCount = clients.filter((c: any) => c.status === "active" || c.status === "followup").length;
        const executionCount = clients.filter((c: any) => c.status === "execution").length;
        const total = clients.length;
        const completionRate = total > 0 ? Math.round(((activeCount + executionCount) / total) * 100) : 0;

        const stats = [
          { label: "إجمالي العملاء", value: total, icon: Users, color: "text-primary", bg: "bg-primary/10" },
          { label: "ساخن / دافئ", value: `${hotCount} / ${warmCount}`, icon: Flame, color: "text-destructive", bg: "bg-destructive/10" },
          { label: "بارد / خامل", value: coldCount, icon: Snowflake, color: "text-chart-1", bg: "bg-chart-1/10" },
          { label: "نسبة الإنجاز", value: `${completionRate}%`, icon: CheckCircle2, color: "text-chart-2", bg: "bg-chart-2/10" },
        ];

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s, i) => (
              <Card key={i}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", s.bg)}>
                    <s.icon className={cn("h-5 w-5", s.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold font-cairo text-foreground leading-tight">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground font-cairo truncate">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}

      {/* Today alerts banner */}
      {todayAlerts.length > 0 && (
        <Card className="border-chart-4/50 bg-chart-4/5">
          <CardContent className="p-3 flex items-center gap-3">
            <Bell className="h-5 w-5 text-chart-4 shrink-0" />
            <div className="flex-1">
              <p className="font-cairo font-bold text-sm text-chart-4">
                ⚠️ {todayAlerts.length} عميل موعد متابعتهم اليوم
              </p>
              <p className="font-cairo text-xs text-muted-foreground">
                سجّل ملاحظة لكل عميل لإغلاق التنبيه
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="w-full grid grid-cols-5 font-cairo">
          <TabsTrigger value="all" className="font-cairo text-xs sm:text-sm">الكل</TabsTrigger>
          <TabsTrigger value="potential" className="font-cairo text-xs sm:text-sm">محتملين</TabsTrigger>
          <TabsTrigger value="dormant" className="font-cairo text-xs sm:text-sm">خاملين</TabsTrigger>
          <TabsTrigger value="current" className="font-cairo text-xs sm:text-sm">حاليين</TabsTrigger>
          <TabsTrigger value="appointments" className="font-cairo text-xs sm:text-sm">
            مواعيد
            {todayAlerts.length > 0 && (
              <Badge className="mr-1 bg-destructive text-destructive-foreground text-[10px] px-1 py-0">
                {todayAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو رقم الهاتف..."
            className="font-cairo pr-9"
          />
        </div>

        {/* Pour filter */}
        <div className="flex gap-2 flex-wrap mt-2">
          {[
            { value: "all", label: "الكل" },
            { value: "has_pours", label: "لديه صبات" },
            { value: "no_pours", label: "بدون صبات" },
            { value: "high_volume", label: "حجم كبير (٥٠+ م³)" },
          ].map((f) => (
            <Button
              key={f.value}
              variant={pourFilter === f.value ? "default" : "outline"}
              size="sm"
              className="font-cairo text-xs"
              onClick={() => setPourFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <TabsContent value={activeTab} className="mt-3">
          {isLoading ? (
            <p className="text-center font-cairo text-muted-foreground py-8">جاري التحميل...</p>
          ) : !filteredClients.length ? (
            <p className="text-center font-cairo text-muted-foreground py-8">لا يوجد عملاء في هذا التصنيف</p>
          ) : (
            <div className="space-y-3">
              {filteredClients.map((client: any) => {
                const isFollowupToday = client.next_followup_date && isToday(new Date(client.next_followup_date));
                const cls = CLASSIFICATIONS[client.status] || { label: client.status, color: "bg-muted text-muted-foreground" };

                return (
                  <Card
                    key={client.id}
                    className={cn(isFollowupToday && "border-chart-4 ring-1 ring-chart-4/30")}
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-cairo font-bold text-foreground truncate">{client.name}</h3>
                            {isFollowupToday && (
                              <Badge className="bg-chart-4/15 text-chart-4 border-chart-4/30 text-[10px] shrink-0">
                                <AlertTriangle className="h-3 w-3 ml-1" />
                                متابعة اليوم
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground font-cairo">{client.phone}</p>
                        </div>
                        <Badge className={`${cls.color} font-cairo text-xs shrink-0`}>{cls.label}</Badge>
                      </div>

                      {/* Dates info */}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground font-cairo">
                        {client.expected_pour_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            صبة: {format(new Date(client.expected_pour_date), "d MMM yyyy", { locale: ar })}
                          </span>
                        )}
                        {client.next_followup_date && (
                          <span className={cn("flex items-center gap-1", isFollowupToday && "text-chart-4 font-bold")}>
                            <Clock className="h-3 w-3" />
                            متابعة: {format(new Date(client.next_followup_date), "d MMM yyyy", { locale: ar })}
                          </span>
                        )}
                      </div>

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

                      {/* Salesperson info */}
                      {client.sales_rep_name && (
                        <p className="text-xs text-muted-foreground font-cairo">البائع: {client.sales_rep_name}</p>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2">
                        {/* Direct call */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-cairo gap-1 text-chart-2 border-chart-2/30 hover:bg-chart-2/10"
                          onClick={() => {
                            const phone = (client.phone || "").replace(/[^0-9]/g, "");
                            window.open(`tel:${phone}`);
                          }}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          اتصال
                        </Button>

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

                        {/* Log follow-up call */}
                        <Button
                          size="sm"
                          variant={isFollowupToday ? "default" : "outline"}
                          className={cn("font-cairo gap-1", isFollowupToday && "animate-pulse")}
                          onClick={() => {
                            setSelectedClient(client);
                            setCallResult("");
                            setCallNotes("");
                            setNextFollowupDate(undefined);
                            setCallDialogOpen(true);
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          تسجيل مكالمة متابعة
                        </Button>

                        {/* Call history */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-cairo gap-1"
                          onClick={() => setCallLogViewId(callLogViewId === client.id ? null : client.id)}
                        >
                          {callLogViewId === client.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          سجل المكالمات
                        </Button>

                        {/* Transfer to execution */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-cairo gap-1 text-primary"
                          onClick={() => transferMutation.mutate(client.id)}
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          تحويل للتنفيذ
                        </Button>

                        {/* Quote PDF */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-cairo gap-1"
                          onClick={() => generateQuotePDF(client)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          عرض سعر
                        </Button>
                      </div>

                      {/* Call history panel */}
                      {callLogViewId === client.id && (
                        <CallHistoryPanel clientId={client.id} />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Follow-up Call Dialog */}
      <Dialog open={callDialogOpen} onOpenChange={setCallDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo">تسجيل مكالمة متابعة - {selectedClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-cairo">نتيجة المكالمة *</Label>
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
              <Label className="font-cairo">ملاحظات * (إجبارية)</Label>
              <Textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="أضف ملاحظاتك هنا... (إجباري)"
                className="font-cairo min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-cairo">موعد المتابعة القادم</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full font-cairo justify-start">
                    <CalendarDays className="h-4 w-4 ml-2" />
                    {nextFollowupDate
                      ? format(nextFollowupDate, "d MMMM yyyy", { locale: ar })
                      : "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={nextFollowupDate}
                    onSelect={setNextFollowupDate}
                    disabled={(date) => date < new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>

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
    </div>
  );
}

// Separate component for call history
function CallHistoryPanel({ clientId }: { clientId: string }) {
  const [viewType, setViewType] = useState<"sales" | "followup">("followup");

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["client-call-history", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("call_logs")
        .select("*")
        .eq("client_id", clientId)
        .order("call_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const salesCalls = calls.filter((c: any) => c.call_type !== "followup");
  const followupCalls = calls.filter((c: any) => c.call_type === "followup");
  const displayCalls = viewType === "followup" ? followupCalls : salesCalls;

  const resultLabels: Record<string, string> = {
    interested: "مهتم",
    not_interested: "غير مهتم",
    postponed: "تأجيل",
    no_answer: "لم يرد",
    completed: "مكتمل",
  };

  return (
    <div className="border-t border-border pt-3 space-y-2">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={viewType === "followup" ? "default" : "outline"}
          className="font-cairo text-xs"
          onClick={() => setViewType("followup")}
        >
          مكالمات المتابعة ({followupCalls.length})
        </Button>
        <Button
          size="sm"
          variant={viewType === "sales" ? "default" : "outline"}
          className="font-cairo text-xs"
          onClick={() => setViewType("sales")}
        >
          مكالمات البائع ({salesCalls.length})
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground font-cairo">جاري التحميل...</p>
      ) : !displayCalls.length ? (
        <p className="text-xs text-muted-foreground font-cairo">لا يوجد مكالمات</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-auto">
          {displayCalls.map((call: any, i: number) => (
            <div key={call.id || i} className="bg-muted/50 rounded-lg p-2 text-xs font-cairo space-y-1">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px]">
                  {resultLabels[call.result] || call.result || "-"}
                </Badge>
                <span className="text-muted-foreground">
                  {call.call_date ? format(new Date(call.call_date), "d/M/yyyy h:mm a", { locale: ar }) : "-"}
                </span>
              </div>
              {call.notes && <p className="text-muted-foreground">{call.notes}</p>}
              {call.employee_name && (
                <p className="text-muted-foreground/70">بواسطة: {call.employee_name}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
