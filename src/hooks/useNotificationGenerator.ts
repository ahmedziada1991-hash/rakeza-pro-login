import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Checks business conditions and auto-creates notifications.
 * Runs once on mount and every 10 minutes.
 */
export function useNotificationGenerator() {
  const { data: session } = useQuery({
    queryKey: ["session-for-notif"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!session?.user?.id) return;

    const userId = session.user.id;

    async function generate() {
      const now = new Date();

      // Get existing notification types created today to avoid duplicates
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayNotifs } = await supabase
        .from("notifications")
        .select("type, metadata")
        .gte("created_at", todayStart.toISOString());

      const existingKeys = new Set(
        (todayNotifs ?? []).map((n: any) => `${n.type}_${JSON.stringify(n.metadata)}`)
      );

      const newNotifs: any[] = [];

      function addIfNew(type: string, title: string, body: string, metadata: any = {}) {
        const key = `${type}_${JSON.stringify(metadata)}`;
        if (!existingKeys.has(key)) {
          newNotifs.push({ user_id: userId, type, title, body, metadata, is_read: false });
          existingKeys.add(key);
        }
      }

      // 1. Overdue payments (> 30 days)
      try {
        const { data: clients } = await supabase.from("clients").select("id, name");
        const { data: orders } = await supabase.from("pour_orders").select("id, client_id, total_amount, status");
        const { data: payments } = await supabase.from("payments").select("client_id, amount, payment_date");

        if (clients && orders && payments) {
          const clientMap = new Map(clients.map((c: any) => [c.id, c.name]));
          // Sum payments per client
          const paidMap = new Map<number, number>();
          payments.forEach((p: any) => {
            paidMap.set(p.client_id, (paidMap.get(p.client_id) || 0) + Number(p.amount));
          });
          // Sum orders per client
          const orderMap = new Map<number, number>();
          orders.forEach((o: any) => {
            if (o.status !== "cancelled") {
              orderMap.set(o.client_id, (orderMap.get(o.client_id) || 0) + Number(o.total_amount || 0));
            }
          });

          for (const [clientId, total] of orderMap) {
            const paid = paidMap.get(clientId) || 0;
            const remaining = total - paid;
            if (remaining > 0) {
              // Check oldest unpaid - simplified: if client has remaining balance, flag it
              const clientPayments = payments
                .filter((p: any) => p.client_id === clientId)
                .sort((a: any, b: any) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
              
              const lastPayment = clientPayments[clientPayments.length - 1];
              const daysSinceLastPayment = lastPayment
                ? Math.floor((now.getTime() - new Date(lastPayment.payment_date).getTime()) / 86400000)
                : 999;

              if (daysSinceLastPayment > 30) {
                addIfNew(
                  "overdue_payment",
                  `عميل متأخر في السداد: ${clientMap.get(clientId)}`,
                  `المبلغ المتبقي: ${remaining.toLocaleString("ar-EG")} ج.م - آخر دفعة منذ ${daysSinceLastPayment} يوم`,
                  { client_id: clientId }
                );
              }
            }
          }
        }
      } catch (e) { /* silent */ }

      // 2. Today's pour dates - notify sales rep
      try {
        const todayStr = now.toISOString().split("T")[0];
        const { data: pourClients } = await supabase
          .from("clients")
          .select("id, name, phone")
          .gte("expected_pour_date", `${todayStr}T00:00:00`)
          .lte("expected_pour_date", `${todayStr}T23:59:59`);

        if (pourClients && pourClients.length > 0) {
          for (const client of pourClients) {
            addIfNew(
              "pour_date_today",
              `موعد صبة ${(client as any).name} النهارده - كلمه!`,
              `العميل ${(client as any).name} عنده موعد صبة اليوم. تواصل معه الآن.`,
              { client_id: (client as any).id }
            );
          }

          // Browser push notification
          if ("Notification" in window && Notification.permission === "granted") {
            const names = pourClients.map((c: any) => c.name).join("، ");
            new Notification("🔔 مواعيد صبة اليوم", {
              body: `عندك ${pourClients.length} عميل عندهم صبة النهارده: ${names}`,
              icon: "/favicon.ico",
            });
          } else if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
          }
        }
      } catch (e) { /* silent */ }

      // 3. Pending orders > 48 hours
      try {
        const cutoff = new Date(now.getTime() - 48 * 3600000).toISOString();
        const { data: pendingOrders } = await supabase
          .from("pour_orders")
          .select("id, created_at, client_id")
          .eq("status", "pending")
          .lt("created_at", cutoff);

        if (pendingOrders) {
          const { data: clients } = await supabase.from("clients").select("id, name");
          const clientMap = new Map((clients ?? []).map((c: any) => [c.id, c.name]));

          for (const order of pendingOrders) {
            const hours = Math.floor((now.getTime() - new Date(order.created_at).getTime()) / 3600000);
            addIfNew(
              "pending_order",
              `طلب صب معلق منذ ${hours} ساعة`,
              `طلب #${order.id} - عميل: ${clientMap.get(order.client_id) || "غير معروف"}`,
              { order_id: order.id }
            );
          }
        }
      } catch (e) { /* silent */ }

      // Insert all new notifications
      if (newNotifs.length > 0) {
        await supabase.from("notifications").insert(newNotifs as any);
      }
    }

    generate();
    const interval = setInterval(generate, 10 * 60 * 1000); // every 10 min
    return () => clearInterval(interval);
  }, [session?.user?.id]);
}
