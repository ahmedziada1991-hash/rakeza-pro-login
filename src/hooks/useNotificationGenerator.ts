import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Checks business conditions and auto-creates notifications.
 * Also subscribes to real-time events for instant admin alerts.
 */
export function useNotificationGenerator() {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const subscribedRef = useRef(false);

  const { data: session } = useQuery({
    queryKey: ["session-for-notif"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
    staleTime: Infinity,
  });

  // Real-time subscriptions for admin
  useEffect(() => {
    if (!user?.id || userRole !== "admin" || subscribedRef.current) return;
    subscribedRef.current = true;

    // Listen for pour_orders status changes to "done"
    const dealsChannel = supabase
      .channel("admin-deal-completed")
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "pour_orders", filter: "status=eq.done" },
        async (payload: any) => {
          const order = payload.new;
          // Get client name
          const { data: client } = await supabase
            .from("clients")
            .select("name")
            .eq("id", order.client_id)
            .maybeSingle();
          const clientName = (client as any)?.name || "عميل";
          const qty = order.quantity_m3 || 0;

          // Create notification
          await supabase.from("notifications").insert({
            user_id: user.id,
            type: "deal_completed",
            title: `✅ صفقة مكتملة: ${clientName}`,
            body: `تم إتمام صبة ${qty} م³ للعميل ${clientName}`,
            metadata: { order_id: order.id, client_id: order.client_id },
            is_read: false,
          } as any);

          // Show toast
          toast.success(`✅ صفقة مكتملة: ${clientName}`, {
            description: `تم إتمام صبة ${qty} م³`,
          });

          // Refresh notifications
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      )
      .subscribe();

    // Listen for new payments
    const paymentsChannel = supabase
      .channel("admin-new-payment")
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "payments" },
        async (payload: any) => {
          const payment = payload.new;
          const amount = Number(payment.amount || 0);

          // Get client name
          let clientName = "عميل";
          if (payment.client_id) {
            const { data: client } = await supabase
              .from("clients")
              .select("name")
              .eq("id", payment.client_id)
              .maybeSingle();
            clientName = (client as any)?.name || "عميل";
          }

          // Create notification
          await supabase.from("notifications").insert({
            user_id: user.id,
            type: "new_payment",
            title: `💰 دفعة جديدة: ${clientName}`,
            body: `تم تسجيل دفعة ${amount.toLocaleString("ar-EG")} ج.م من ${clientName}`,
            metadata: { payment_id: payment.id, client_id: payment.client_id },
            is_read: false,
          } as any);

          // Show toast
          toast.success(`💰 دفعة جديدة: ${clientName}`, {
            description: `${amount.toLocaleString("ar-EG")} ج.م`,
          });

          // Refresh notifications
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      )
      .subscribe();

    return () => {
      subscribedRef.current = false;
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [user?.id, userRole, queryClient]);

  // Periodic notification generator (existing logic)
  useEffect(() => {
    if (!session?.user?.id) return;

    const userId = session.user.id;

    async function generate() {
      const now = new Date();

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
        const { data: orders } = await supabase.from("pour_orders").select("id, client_id, quantity_m3, price_per_m3, status");
        const { data: payments } = await supabase.from("payments").select("client_id, amount, payment_date");

        if (clients && orders && payments) {
          const clientMap = new Map(clients.map((c: any) => [c.id, c.name]));
          const paidMap = new Map<number, number>();
          payments.forEach((p: any) => {
            paidMap.set(p.client_id, (paidMap.get(p.client_id) || 0) + Number(p.amount));
          });
          const orderMap = new Map<number, number>();
          orders.forEach((o: any) => {
            if (o.status !== "cancelled") {
              orderMap.set(o.client_id, (orderMap.get(o.client_id) || 0) + Number(o.quantity_m3 || 0) * Number(o.price_per_m3 || 0));
            }
          });

          for (const [clientId, total] of orderMap) {
            const paid = paidMap.get(clientId) || 0;
            const remaining = total - paid;
            if (remaining > 0) {
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

      // 2. Today's pour dates
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

      if (newNotifs.length > 0) {
        await supabase.from("notifications").insert(newNotifs as any);
      }
    }

    generate();
    const interval = setInterval(generate, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session?.user?.id]);
}
