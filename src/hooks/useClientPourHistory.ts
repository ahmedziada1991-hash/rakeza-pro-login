import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientPourHistory {
  lastPourDate: string | null;
  totalQuantity: number;
  pourCount: number;
}

export function useClientPourHistory(clientIds: number[]) {
  return useQuery({
    queryKey: ["client-pour-history", clientIds],
    queryFn: async () => {
      if (!clientIds.length) return {};
      const { data, error } = await supabase
        .from("pour_orders")
        .select("client_id, quantity_m3, scheduled_date, status")
        .in("client_id", clientIds)
        .in("status", ["done", "in_progress", "scheduled", "pending"]);
      if (error) return {};

      const map: Record<number, ClientPourHistory> = {};
      (data || []).forEach((o: any) => {
        if (!map[o.client_id]) {
          map[o.client_id] = { lastPourDate: null, totalQuantity: 0, pourCount: 0 };
        }
        const h = map[o.client_id];
        h.pourCount++;
        h.totalQuantity += o.quantity_m3 || 0;
        if (!h.lastPourDate || o.scheduled_date > h.lastPourDate) {
          h.lastPourDate = o.scheduled_date;
        }
      });
      return map;
    },
    enabled: clientIds.length > 0,
  });
}
