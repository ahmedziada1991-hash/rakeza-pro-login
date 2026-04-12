import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronRight, ChevronLeft, Phone, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday, addMonths, subMonths } from "date-fns";
import { ar } from "date-fns/locale";

const DAY_NAMES = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

interface PourClient {
  id: number;
  name: string;
  phone: string;
  expected_pour_date: string;
  status: string;
  area?: string;
  assigned_sales_id?: string;
  sales_name?: string;
}

export function PourCalendarPage() {
  const { user, userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startStr = format(monthStart, "yyyy-MM-dd");
  const endStr = format(monthEnd, "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Fetch clients with expected_pour_date in this month
  const { data: clients } = useQuery({
    queryKey: ["pour-calendar", startStr, endStr, isAdmin, user?.id],
    queryFn: async () => {
      let query = (supabase as any)
        .from("clients")
        .select("id, name, phone, expected_pour_date, status, area, assigned_sales_id")
        .gte("expected_pour_date", `${startStr}T00:00:00`)
        .lte("expected_pour_date", `${endStr}T23:59:59`)
        .order("expected_pour_date", { ascending: true });

      // Non-admin: RLS handles filtering, but also filter by assigned_sales_id
      if (!isAdmin && user) {
        query = query.eq("assigned_sales_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch sales names from users table using auth_id
      const salesIds = [...new Set((data || []).map((c: any) => c.assigned_sales_id).filter(Boolean))];
      let salesMap: Record<string, string> = {};
      if (salesIds.length > 0) {
        const { data: users } = await (supabase as any)
          .from("users")
          .select("auth_id, name")
          .in("auth_id", salesIds);
        (users || []).forEach((u: any) => { salesMap[u.auth_id] = u.name; });
      }

      return (data || []).map((c: any) => ({
        ...c,
        sales_name: salesMap[c.assigned_sales_id] || null,
      })) as PourClient[];
    },
    enabled: !!user,
  });

  // Fetch call logs for the visible month to check contacted status
  const { data: monthCalls } = useQuery({
    queryKey: ["pour-calendar-calls", startStr, endStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("call_logs")
        .select("client_id, call_date")
        .gte("call_date", `${startStr}T00:00:00`)
        .lte("call_date", `${endStr}T23:59:59`);
      return data || [];
    },
    enabled: !!user,
  });

  // Build set of contacted client IDs per date
  const contactedByDate = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    (monthCalls || []).forEach((c: any) => {
      const dateKey = c.call_date?.split("T")[0];
      if (!dateKey) return;
      if (!map[dateKey]) map[dateKey] = new Set();
      map[dateKey].add(c.client_id);
    });
    return map;
  }, [monthCalls]);

  const todayContacted = contactedByDate[todayStr] || new Set();

  // Group clients by date
  const clientsByDate = useMemo(() => {
    const map: Record<string, PourClient[]> = {};
    (clients || []).forEach((c) => {
      const dateKey = c.expected_pour_date.split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(c);
    });
    return map;
  }, [clients]);

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  // Today's pour clients
  const todayClients = clientsByDate[todayStr] || [];
  const todayNotContacted = todayClients.filter((c) => !todayContacted.has(c.id));

  const selectedDayStr = selectedDay ? format(selectedDay, "yyyy-MM-dd") : "";
  const selectedClients = selectedDayStr ? (clientsByDate[selectedDayStr] || []) : [];
  const selectedDayContacted = selectedDayStr ? (contactedByDate[selectedDayStr] || new Set()) : new Set();

  const statusColor: Record<string, string> = {
    hot: "bg-destructive/15 text-destructive",
    warm: "bg-chart-4/15 text-chart-4",
    cold: "bg-chart-1/15 text-chart-1",
    inactive: "bg-muted-foreground/15 text-muted-foreground",
    active: "bg-chart-2/15 text-chart-2",
    followup: "bg-primary/15 text-primary",
  };

  const statusLabel: Record<string, string> = {
    hot: "ساخن", warm: "دافئ", cold: "بارد", inactive: "خامل", active: "نشط", followup: "متابعة",
  };

  return (
    <div className="space-y-4">
      {/* Today alerts - persistent until action taken */}
      {todayNotContacted.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <h3 className="font-cairo font-bold text-destructive text-sm">
                ⚠️ {todayNotContacted.length} عميل موعد صبتهم النهارده - كلّمهم!
              </h3>
            </div>
            {todayNotContacted.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-background rounded-lg p-2.5 border border-destructive/20">
                <div className="min-w-0">
                  <span className="font-cairo font-medium text-sm text-foreground block">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.phone}</span>
                  {isAdmin && c.sales_name && (
                    <span className="text-xs text-primary mr-2">• البائع: {c.sales_name}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="font-cairo gap-1 text-chart-2 border-chart-2/30 shrink-0"
                  onClick={() => {
                    const phone = (c.phone || "").replace(/[^0-9]/g, "");
                    window.open(`tel:${phone}`);
                  }}
                >
                  <Phone className="h-3.5 w-3.5" />
                  اتصل
                </Button>
              </div>
            ))}
            <p className="text-[10px] font-cairo text-muted-foreground">
              💡 التنبيه يختفي تلقائياً بعد تسجيل مكالمة أو إجراء على العميل
            </p>
          </CardContent>
        </Card>
      )}

      {/* Admin: Today summary bar */}
      {isAdmin && todayClients.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 font-cairo text-sm">
              <span className="text-foreground font-bold">📊 ملخص اليوم:</span>
              <span className="text-muted-foreground">{todayClients.length} صبة متوقعة</span>
              <span className="text-chart-2">✅ {todayClients.length - todayNotContacted.length} تم التواصل</span>
              {todayNotContacted.length > 0 && (
                <span className="text-destructive">❌ {todayNotContacted.length} لم يتم التواصل</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-5 w-5" />
            </Button>
            <h2 className="font-cairo font-bold text-foreground">
              {format(currentMonth, "MMMM yyyy", { locale: ar })}
            </h2>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-cairo text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {days.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayClients = clientsByDate[dateKey] || [];
              const hasClients = dayClients.length > 0;
              const today = isToday(day);
              const dayContacted = contactedByDate[dateKey] || new Set();
              const allContacted = hasClients && dayClients.every((c) => dayContacted.has(c.id));
              const someNotContacted = hasClients && dayClients.some((c) => !dayContacted.has(c.id));

              return (
                <button
                  key={dateKey}
                  onClick={() => hasClients && setSelectedDay(day)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-cairo transition-colors relative
                    ${today ? "bg-primary/10 font-bold text-primary" : ""}
                    ${hasClients ? "cursor-pointer hover:bg-accent" : "cursor-default"}
                    ${selectedDay && isSameDay(day, selectedDay) ? "ring-2 ring-primary" : ""}
                  `}
                >
                  <span>{day.getDate()}</span>
                  {hasClients && (
                    <div className="flex gap-0.5 mt-0.5 items-center">
                      {allContacted ? (
                        <CheckCircle2 className="h-3 w-3 text-chart-2" />
                      ) : someNotContacted && today ? (
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                      {dayClients.length > 1 && (
                        <span className="text-[9px] text-primary font-bold">{dayClients.length}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Admin month summary */}
          {isAdmin && (
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-sm font-cairo text-muted-foreground">
              <span>إجمالي مواعيد الشهر: {(clients || []).length} صبة</span>
              <span>اليوم: {todayClients.length} صبة</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day detail dialog */}
      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-cairo">
              مواعيد {selectedDay && format(selectedDay, "EEEE d MMMM", { locale: ar })}
              <span className="text-sm font-normal text-muted-foreground mr-2">({selectedClients.length} عميل)</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedClients.length === 0 ? (
              <p className="text-center text-muted-foreground font-cairo py-4">لا توجد مواعيد</p>
            ) : (
              selectedClients.map((client) => {
                const contacted = selectedDayContacted.has(client.id);
                return (
                  <Card key={client.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <h4 className="font-cairo font-bold text-foreground text-sm">{client.name}</h4>
                          <p className="text-xs text-muted-foreground">{client.phone}</p>
                          {client.area && <p className="text-xs text-muted-foreground">{client.area}</p>}
                          {isAdmin && client.sales_name && (
                            <p className="text-xs text-primary mt-0.5">البائع: {client.sales_name}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={`${statusColor[client.status] || ""} font-cairo text-xs`}>
                            {statusLabel[client.status] || client.status}
                          </Badge>
                          {contacted ? (
                            <CheckCircle2 className="h-4 w-4 text-chart-2" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-cairo gap-1 text-chart-2 border-chart-2/30 flex-1"
                          onClick={() => {
                            const phone = (client.phone || "").replace(/[^0-9]/g, "");
                            window.open(`tel:${phone}`);
                          }}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          اتصال
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-cairo gap-1 flex-1"
                          onClick={() => {
                            const phone = (client.phone || "").replace(/[^0-9]/g, "");
                            window.open(`https://wa.me/${phone}`, "_blank");
                          }}
                        >
                          واتساب
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
