import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Users, ArrowRightLeft, UserCheck, RefreshCw } from "lucide-react";

interface FollowUpUser {
  id: string;
  full_name: string;
  client_count: number;
}

export function ClientAssignment() {
  const queryClient = useQueryClient();
  const [changingClient, setChangingClient] = useState<number | null>(null);
  const [selectedFollower, setSelectedFollower] = useState<string>("");

  // Fetch follow-up users with their client counts
  const { data: followUpUsers = [] } = useQuery({
    queryKey: ["followup-users"],
    queryFn: async () => {
      // Get users with followup role
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "followup");
      if (rolesErr) throw rolesErr;
      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);

      // Get users from users table
      const { data: users, error: usersErr } = await (supabase as any)
        .from("users")
        .select("id, name, auth_id")
        .in("auth_id", userIds);
      if (usersErr) throw usersErr;

      // Get client counts per assigned_followup_id
      const { data: clients, error: clErr } = await (supabase as any)
        .from("clients")
        .select("assigned_followup_id")
        .not("assigned_followup_id", "is", null);
      if (clErr) throw clErr;

      const countMap: Record<string, number> = {};
      (clients || []).forEach((c: any) => {
        countMap[c.assigned_followup_id] = (countMap[c.assigned_followup_id] || 0) + 1;
      });

      return (users || []).map((u: any) => ({
        id: u.auth_id,
        full_name: u.name || "بدون اسم",
        client_count: countMap[u.auth_id] || 0,
      })) as FollowUpUser[];
    },
  });

  // Fetch clients in followup status
  const { data: followupClients = [], isLoading } = useQuery({
    queryKey: ["followup-clients-assign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .in("status", ["followup"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Auto-assign: pick follower with least clients
  const getAutoAssignee = (): string | null => {
    if (!followUpUsers.length) return null;
    return followUpUsers.reduce((min, u) =>
      u.client_count < min.client_count ? u : min
    ).id;
  };

  // Send notification to the assigned follower
  const sendAssignNotification = async (userId: string, clientName: string) => {
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "عميل جديد",
      message: `تم تعيينك لمتابعة العميل: ${clientName}`,
      type: "assignment",
      is_read: false,
    } as any);
  };

  // Mutation to assign client
  const assignMutation = useMutation({
    mutationFn: async ({ clientId, userId, clientName }: { clientId: number; userId: string; clientName: string }) => {
      const { error } = await (supabase as any)
        .from("clients")
        .update({ assigned_followup_id: userId })
        .eq("id", clientId);
      if (error) throw error;
      await sendAssignNotification(userId, clientName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-clients-assign"] });
      queryClient.invalidateQueries({ queryKey: ["followup-users"] });
      setChangingClient(null);
      setSelectedFollower("");
      toast({ title: "تم التعيين", description: "تم تعيين المتابع وإرسال إشعار له" });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في تعيين المتابع", variant: "destructive" });
    },
  });

  // Auto-assign all unassigned
  const autoAssignAll = useMutation({
    mutationFn: async () => {
      const unassigned = followupClients.filter((c: any) => !c.assigned_followup_id);
      if (!unassigned.length) throw new Error("no_unassigned");
      if (!followUpUsers.length) throw new Error("no_followers");

      // Sort followers by count ascending, round-robin assign
      const sorted = [...followUpUsers].sort((a, b) => a.client_count - b.client_count);
      const counts = Object.fromEntries(sorted.map((u) => [u.id, u.client_count]));

      for (const client of unassigned) {
        // Pick the one with least
        const minUser = Object.entries(counts).reduce((min, [id, cnt]) =>
          cnt < min[1] ? [id, cnt] : min
        );
        const userId = minUser[0];

        const { error } = await (supabase as any)
          .from("clients")
          .update({ assigned_followup_id: userId })
          .eq("id", (client as any).id);
        if (error) throw error;
        await sendAssignNotification(userId, (client as any).name || "عميل");
        counts[userId] = (counts[userId] || 0) + 1;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-clients-assign"] });
      queryClient.invalidateQueries({ queryKey: ["followup-users"] });
      toast({ title: "تم التوزيع", description: "تم توزيع جميع العملاء تلقائياً" });
    },
    onError: (err: any) => {
      if (err.message === "no_unassigned") {
        toast({ title: "تنبيه", description: "لا يوجد عملاء بدون متابع" });
      } else if (err.message === "no_followers") {
        toast({ title: "خطأ", description: "لا يوجد متابعين مسجلين", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: "فشل في التوزيع التلقائي", variant: "destructive" });
      }
    },
  });

  const getFollowerName = (userId: string) => {
    return followUpUsers.find((u) => u.id === userId)?.full_name || "غير معين";
  };

  const unassignedCount = followupClients.filter((c: any) => !c.assigned_to).length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-cairo font-bold text-foreground">توزيع العملاء</h2>
          <p className="text-sm text-muted-foreground font-cairo">توزيع عملاء المتابعة على المتابعين</p>
        </div>
        {unassignedCount > 0 && (
          <Button
            onClick={() => autoAssignAll.mutate()}
            disabled={autoAssignAll.isPending}
            className="font-cairo gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${autoAssignAll.isPending ? "animate-spin" : ""}`} />
            توزيع تلقائي ({unassignedCount} عميل)
          </Button>
        )}
      </div>

      {/* Follower stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {followUpUsers.map((user) => (
          <Card key={user.id}>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <UserCheck className="h-5 w-5 text-primary" />
              </div>
              <p className="font-cairo font-semibold text-sm text-foreground">{user.full_name}</p>
              <p className="text-2xl font-bold text-primary mt-1">{user.client_count}</p>
              <p className="text-xs text-muted-foreground font-cairo">عميل</p>
            </CardContent>
          </Card>
        ))}
        {followUpUsers.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="p-6 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground font-cairo">لا يوجد متابعين مسجلين</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Clients table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-cairo text-lg flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            العملاء المحولين للمتابعة ({followupClients.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground font-cairo">جاري التحميل...</div>
          ) : followupClients.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground font-cairo">لا يوجد عملاء محولين للمتابعة</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right font-cairo">العميل</TableHead>
                    <TableHead className="text-right font-cairo">الهاتف</TableHead>
                    <TableHead className="text-right font-cairo hidden sm:table-cell">التصنيف</TableHead>
                    <TableHead className="text-right font-cairo">المتابع المعين</TableHead>
                    <TableHead className="text-right font-cairo">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {followupClients.map((client: any) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-cairo font-medium">{client.name}</TableCell>
                      <TableCell className="font-cairo text-muted-foreground" dir="ltr">{client.phone}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="font-cairo">متابعة</Badge>
                      </TableCell>
                      <TableCell>
                        {changingClient === client.id ? (
                          <Select value={selectedFollower} onValueChange={setSelectedFollower}>
                            <SelectTrigger className="w-[140px] font-cairo">
                              <SelectValue placeholder="اختر متابع" />
                            </SelectTrigger>
                            <SelectContent>
                              {followUpUsers.map((u) => (
                                <SelectItem key={u.id} value={u.id} className="font-cairo">
                                  {u.full_name} ({u.client_count})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="font-cairo text-sm">
                            {client.assigned_to ? (
                              <Badge variant="secondary" className="font-cairo">
                                {getFollowerName(client.assigned_to)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="font-cairo text-destructive border-destructive/30">
                                غير معين
                              </Badge>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {changingClient === client.id ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => {
                                if (selectedFollower) {
                                  assignMutation.mutate({ clientId: client.id, userId: selectedFollower, clientName: client.name });
                                }
                              }}
                              disabled={!selectedFollower || assignMutation.isPending}
                              className="font-cairo text-xs"
                            >
                              حفظ
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setChangingClient(null); setSelectedFollower(""); }}
                              className="font-cairo text-xs"
                            >
                              إلغاء
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setChangingClient(client.id);
                              setSelectedFollower(client.assigned_to || "");
                            }}
                            className="font-cairo text-xs gap-1"
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                            تغيير
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
