import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, X, Phone } from "lucide-react";
import { CallLogDialog } from "@/components/sales-rep/CallLogDialog";

interface FollowupNotification {
  id: string;
  title: string;
  body: string | null;
  client_id: number | null;
  scheduled_for: string | null;
  metadata: any;
}

export function FollowupReminders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [callDialog, setCallDialog] = useState<{ id: number; name: string } | null>(null);

  const { data: reminders = [] } = useQuery<FollowupNotification[]>({
    queryKey: ["followup-reminders-today", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const today = new Date();
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("notifications" as any)
        .select("id, title, body, client_id, scheduled_for, metadata")
        .eq("user_id", user!.id)
        .eq("type", "followup_reminder")
        .eq("is_read", false)
        .lte("scheduled_for", todayEnd.toISOString())
        .order("scheduled_for", { ascending: true });

      if (error) {
        console.error("Followup reminders fetch error:", error);
        return [];
      }
      return (data as any) || [];
    },
    refetchInterval: 60000,
  });

  // Get client names for reminders
  const clientIds = reminders.map((r) => r.client_id).filter(Boolean) as number[];
  const { data: clientsMap = {} } = useQuery<Record<number, string>>({
    queryKey: ["reminder-client-names", clientIds.join(",")],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients" as any)
        .select("id, name")
        .in("id", clientIds);
      const map: Record<number, string> = {};
      (data || []).forEach((c: any) => { map[c.id] = c.name; });
      return map;
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications" as any).update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-reminders-today"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (!reminders.length) return null;

  return (
    <>
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="h-4 w-4 text-primary" />
            <h3 className="font-cairo font-bold text-sm text-foreground">
              تذكيرات اليوم ({reminders.length})
            </h3>
          </div>
          {reminders.map((r) => {
            const clientName = (r.client_id && clientsMap[r.client_id]) || "العميل";
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 p-2 bg-card border border-border rounded-md"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-cairo font-semibold text-xs text-foreground truncate">
                    {r.title}
                  </p>
                  {r.body && (
                    <p className="font-cairo text-[10px] text-muted-foreground truncate">{r.body}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.client_id && (
                    <Button
                      size="sm"
                      variant="default"
                      className="font-cairo text-[11px] gap-1 h-7 px-2"
                      onClick={() => setCallDialog({ id: r.client_id!, name: clientName })}
                    >
                      <Phone className="h-3 w-3" />
                      سجّل النتيجة
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => dismiss.mutate(r.id)}
                    title="تجاهل"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {callDialog && (
        <CallLogDialog
          open={!!callDialog}
          onOpenChange={(o) => !o && setCallDialog(null)}
          clientId={callDialog.id}
          clientName={callDialog.name}
        />
      )}
    </>
  );
}
