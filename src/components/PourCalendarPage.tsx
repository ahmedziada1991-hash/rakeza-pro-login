import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronRight, ChevronLeft, Phone, CheckCircle2, AlertCircle, Calendar as CalendarIcon } from "lucide-react";
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
  profile_name?: string;
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

  // Fetch clients with expected_pour_date in this month
  const { data: clients } = useQuery({
    queryKey: ["pour-calendar", startStr, endStr, isAdmin],
    queryFn: async () => {
      const query = (supabase as any)
        .from("clients")
        .select("id, name, phone, expected_pour_date, status, area")
        .gte("expected_pour_date", `${startStr}T00:00:00`)
        .lte("expected_pour_date", `${endStr}T23:59:59`)
        .order("expected_pour_date", { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PourClient[];
    },
    enabled: !!user,
  });

  // Fetch today's call logs to check who was contacted
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayCalls } = useQuery({
    queryKey: ["pour-calendar-calls", todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("call_logs")
        .select("client_id")
        .gte("call_date", `${todayStr}T00:00:00`)
        .lte("call_date", `${todayStr}T23:59:59`);
      return (data || []).map((c: any) => c.client_id);
    },
    enabled: !!user,
  });

  const calledClientIds = new Set(todayCalls || []);

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

  // Today's pour clients for alerts
  const todayClients = clientsByDate[todayStr] || [];
  const todayNotContacted = todayClients.filter((c) => !calledClientIds.has(c.id));

  const selectedDayStr = selectedDay ? format(selectedDay, "yyyy-MM-dd") : "";
  const selectedClients = selectedDayStr ? (clientsByDate[selectedDayStr] || []) : [];

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
      {/* Today alerts */}
      {todayNotContacted.length > 0 && (
        <Card className="border-chart-4/50 bg-chart-4/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-chart-4" />
              <h3 className="font-cairo font-bold text-foreground">
                مواعيد صبة اليوم - {todayNotContacted.length} عميل لم يتم التواصل معه
              </h3>
            </div>
            {todayNotContacted.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-background rounded-lg p-2 border">
                <div>
                  <span className="font-cairo font-medium text-sm text-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground mr-2">{c.phone}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="font-cairo gap-1 text-chart-2 border-chart-2/30"
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
          </CardContent>
        </Card>
      )}

      {/* Calendar header */}
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

          {/* Day names */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-cairo text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before month start */}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {days.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayClients = clientsByDate[dateKey] || [];
              const hasClients = dayClients.length > 0;
              const today = isToday(day);

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
                    <div className="flex gap-0.5 mt-0.5">
                      {dayClients.length <= 3 ? (
                        dayClients.map((_, i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary" />
                        ))
                      ) : (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <span className="text-[9px] text-primary font-bold">{dayClients.length}</span>
                        </>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Admin summary */}
          {isAdmin && (
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-sm font-cairo text-muted-foreground">
                إجمالي مواعيد الشهر: {(clients || []).length} صبة
              </span>
              <span className="text-sm font-cairo text-muted-foreground">
                اليوم: {todayClients.length} صبة ({todayClients.length - todayNotContacted.length} تم التواصل)
              </span>
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
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedClients.length === 0 ? (
              <p className="text-center text-muted-foreground font-cairo py-4">لا توجد مواعيد</p>
            ) : (
              selectedClients.map((client) => {
                const contacted = calledClientIds.has(client.id);
                return (
                  <Card key={client.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-cairo font-bold text-foreground text-sm">{client.name}</h4>
                          <p className="text-xs text-muted-foreground">{client.phone}</p>
                          {client.area && <p className="text-xs text-muted-foreground">{client.area}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`${statusColor[client.status] || ""} font-cairo text-xs`}>
                            {statusLabel[client.status] || client.status}
                          </Badge>
                          {isToday(selectedDay!) && (
                            contacted ? (
                              <CheckCircle2 className="h-4 w-4 text-chart-2" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-chart-4" />
                            )
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
