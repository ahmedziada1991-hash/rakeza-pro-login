import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Settings, Save, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface FollowerTarget {
  userId: string;
  fullName: string;
  targetCalls: number;
  targetDeals: number;
}

export function FollowUpTargetsAdmin() {
  const queryClient = useQueryClient();
  const [editingTargets, setEditingTargets] = useState<Record<string, { calls: string; deals: string }>>({});

  // Get follow-up users
  const { data: followers = [], isLoading } = useQuery({
    queryKey: ["followup-users-targets"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "followup");
      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      // Get current targets from daily_performance for today
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: perfs } = await supabase
        .from("daily_performance")
        .select("user_id, target_calls, target_visits")
        .in("user_id", userIds)
        .eq("date", today);

      const perfMap: Record<string, any> = {};
      perfs?.forEach((p: any) => { perfMap[p.user_id] = p; });

      return (profiles || []).map((p) => ({
        userId: p.id,
        fullName: p.full_name || "بدون اسم",
        targetCalls: perfMap[p.id]?.target_calls || 10,
        targetDeals: perfMap[p.id]?.target_visits || 15, // reusing target_visits as monthly deals target
      })) as FollowerTarget[];
    },
  });

  const saveTargets = useMutation({
    mutationFn: async ({ userId, targetCalls, targetDeals }: { userId: string; targetCalls: number; targetDeals: number }) => {
      const today = format(new Date(), "yyyy-MM-dd");

      // Check if record exists
      const { data: existing } = await supabase
        .from("daily_performance")
        .select("id")
        .eq("user_id", userId)
        .eq("date", today)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("daily_performance")
          .update({ target_calls: targetCalls, target_visits: targetDeals } as any)
          .eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("daily_performance")
          .insert({
            user_id: userId,
            date: today,
            target_calls: targetCalls,
            target_visits: targetDeals,
            actual_calls: 0,
            actual_visits: 0,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["followup-users-targets"] });
      const newEditing = { ...editingTargets };
      delete newEditing[vars.userId];
      setEditingTargets(newEditing);
      toast({ title: "تم الحفظ", description: "تم تحديث أهداف المتابع بنجاح" });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في حفظ الأهداف", variant: "destructive" });
    },
  });

  const startEditing = (f: FollowerTarget) => {
    setEditingTargets((prev) => ({
      ...prev,
      [f.userId]: { calls: String(f.targetCalls), deals: String(f.targetDeals) },
    }));
  };

  const isEditing = (userId: string) => !!editingTargets[userId];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-cairo font-bold text-foreground">إدارة أهداف المتابعين</h2>
        <p className="text-sm text-muted-foreground font-cairo">
          تعديل الأهداف اليومية والشهرية لكل متابع
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-cairo text-lg flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            أهداف المتابعين
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground font-cairo">جاري التحميل...</div>
          ) : followers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground font-cairo">
              <UserCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              لا يوجد متابعين مسجلين
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right font-cairo">المتابع</TableHead>
                    <TableHead className="text-right font-cairo">مكالمات يومية</TableHead>
                    <TableHead className="text-right font-cairo">صفقات شهرية</TableHead>
                    <TableHead className="text-right font-cairo">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {followers.map((f) => (
                    <TableRow key={f.userId}>
                      <TableCell className="font-cairo font-medium">{f.fullName}</TableCell>
                      <TableCell>
                        {isEditing(f.userId) ? (
                          <Input
                            type="number"
                            value={editingTargets[f.userId].calls}
                            onChange={(e) =>
                              setEditingTargets((prev) => ({
                                ...prev,
                                [f.userId]: { ...prev[f.userId], calls: e.target.value },
                              }))
                            }
                            className="w-20 font-cairo"
                          />
                        ) : (
                          <span className="font-cairo font-semibold">{f.targetCalls}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing(f.userId) ? (
                          <Input
                            type="number"
                            value={editingTargets[f.userId].deals}
                            onChange={(e) =>
                              setEditingTargets((prev) => ({
                                ...prev,
                                [f.userId]: { ...prev[f.userId], deals: e.target.value },
                              }))
                            }
                            className="w-20 font-cairo"
                          />
                        ) : (
                          <span className="font-cairo font-semibold">{f.targetDeals}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing(f.userId) ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="font-cairo text-xs gap-1"
                              disabled={saveTargets.isPending}
                              onClick={() =>
                                saveTargets.mutate({
                                  userId: f.userId,
                                  targetCalls: parseInt(editingTargets[f.userId].calls) || 10,
                                  targetDeals: parseInt(editingTargets[f.userId].deals) || 15,
                                })
                              }
                            >
                              <Save className="h-3 w-3" /> حفظ
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="font-cairo text-xs"
                              onClick={() => {
                                const newEditing = { ...editingTargets };
                                delete newEditing[f.userId];
                                setEditingTargets(newEditing);
                              }}
                            >
                              إلغاء
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="font-cairo text-xs"
                            onClick={() => startEditing(f)}
                          >
                            تعديل
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
