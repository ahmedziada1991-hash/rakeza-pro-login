import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

function playBeep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* ignore */ }
}

/**
 * Fetches today's scheduled & unread notifications for the current user,
 * shows toast + browser notification + beep on first load each day.
 * Also subscribes to realtime inserts on notifications for instant alerts.
 */
export function useDailyReminders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const checkedRef = useRef(false);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const permissionAskedRef = useRef(false);

  // Ask browser notification permission once
  useEffect(() => {
    if (!user?.id || permissionAskedRef.current) return;
    permissionAskedRef.current = true;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [user?.id]);

  // Daily check + realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    async function checkToday() {
      if (checkedRef.current) return;
      checkedRef.current = true;

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("notifications" as any)
        .select("id, title, body, scheduled_for")
        .eq("user_id", userId)
        .eq("is_read", false)
        .lte("scheduled_for", todayEnd.toISOString())
        .order("scheduled_for", { ascending: true });

      if (error || !data) return;

      const items = data as any[];
      if (items.length === 0) return;

      playBeep();

      // Combined toast
      toast.warning(`🔔 عندك ${items.length} تذكير اليوم`, {
        description: items.slice(0, 3).map((n) => n.title).join(" • "),
        duration: 12000,
      });

      // Browser notification
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          const n = new Notification(`🔔 تذكيرات اليوم (${items.length})`, {
            body: items.slice(0, 4).map((x) => x.title).join("\n"),
            icon: "/favicon.ico",
            tag: `daily-reminders-${new Date().toDateString()}`,
            requireInteraction: true,
          });
          n.onclick = () => { window.focus(); n.close(); };
        } catch { /* ignore */ }
      }

      items.forEach((i) => shownIdsRef.current.add(i.id));
    }

    checkToday();

    // Realtime: alert on any new notification inserted for this user
    const channel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const n = payload.new;
          if (!n || shownIdsRef.current.has(n.id)) return;
          shownIdsRef.current.add(n.id);

          playBeep();
          toast(n.title, { description: n.body || undefined, duration: 8000 });

          if ("Notification" in window && Notification.permission === "granted") {
            try {
              const browserN = new Notification(n.title, {
                body: n.body || "",
                icon: "/favicon.ico",
                tag: `notif-${n.id}`,
              });
              browserN.onclick = () => { window.focus(); browserN.close(); };
            } catch { /* ignore */ }
          }

          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["followup-reminders-today"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}
