import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Phone, MessageCircle, FileText } from "lucide-react";
import { CallLogDialog } from "./CallLogDialog";
import { cn } from "@/lib/utils";

export function PourDateAlerts() {
  const { user } = useAuth();
  const todayStr = new Date().toISOString().split("T")[0];
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const { data: todayPours = [] } = useQuery({
    queryKey: ["today-pour-alerts", user?.id, todayStr],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, name, phone, expected_pour_date, status")
        .gte("expected_pour_date", `${todayStr}T00:00:00`)
        .lte("expected_pour_date", `${todayStr}T23:59:59`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  if (!todayPours.length) return null;

  const normalizePhone = (phone: string) => {
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) cleaned = "20" + cleaned.slice(1);
    return cleaned;
  };

  return (
    <div className="space-y-2">
      {todayPours.map((client: any) => (
        <Card key={client.id} className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-destructive/15 text-destructive border-destructive/30 font-cairo text-xs">⚠️ صبة اليوم</Badge>
              <span className="font-cairo font-bold text-sm text-foreground">{client.name}</span>
            </div>
            <p className="text-xs text-muted-foreground font-cairo">
              موعد صبة عميل {client.name} اليوم - تواصل معه وسجل النتيجة
            </p>
            <div className="flex flex-wrap gap-2">
              {client.phone && (
                <Button size="sm" variant="outline" className="font-cairo text-xs gap-1 h-7"
                  onClick={() => window.open(`tel:${client.phone.replace(/\D/g, "")}`)}>
                  <Phone className="h-3 w-3" /> اتصال
                </Button>
              )}
              {client.phone && (
                <Button size="sm" variant="outline" className="font-cairo text-xs gap-1 h-7 text-chart-2 border-chart-2/30"
                  onClick={() => window.open(`https://wa.me/${normalizePhone(client.phone)}`, "_blank")}>
                  <MessageCircle className="h-3 w-3" /> واتساب
                </Button>
              )}
              <Button size="sm" variant="default" className="font-cairo text-xs gap-1 h-7"
                onClick={() => { setSelectedClient(client); setCallLogOpen(true); }}>
                <FileText className="h-3 w-3" /> سجل مكالمة
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {selectedClient && (
        <CallLogDialog
          open={callLogOpen}
          onOpenChange={setCallLogOpen}
          clientId={selectedClient.id}
          clientName={selectedClient.name}
        />
      )}
    </div>
  );
}
