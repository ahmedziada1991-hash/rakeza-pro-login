import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Loader2, UserPlus, Shield } from "lucide-react";

const ROLES = [
  { value: "admin", label: "أدمن" },
  { value: "sales", label: "مبيعات" },
  { value: "followup", label: "متابعة" },
  { value: "execution", label: "تنفيذ" },
];

const ROLE_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  admin: "default",
  sales: "secondary",
  followup: "outline",
  execution: "outline",
};

export function UsersManagement() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "sales", whatsapp: "" });

  // Fetch users from user_roles
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role, is_active, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Try to get profile/email info - query profiles if exists
      if (!data?.length) return [];

      // Get emails from profiles table if available
      const userIds = data.map((u) => u.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, whatsapp")
        .in("id", userIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      return data.map((u) => ({
        ...u,
        email: profileMap.get(u.user_id)?.email ?? "—",
        name: profileMap.get(u.user_id)?.full_name ?? "—",
        whatsapp: profileMap.get(u.user_id)?.whatsapp ?? "—",
      }));
    },
  });

  // Update role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase.from("user_roles").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "تم تحديث الدور بنجاح" });
      setEditingUser(null);
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  // Toggle active
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("user_roles").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "تم تحديث الحالة" });
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  // Create new user
  const createUserMutation = useMutation({
    mutationFn: async () => {
      // Sign up user via Supabase auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: { full_name: newUser.name },
        },
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error("فشل إنشاء المستخدم");

      // Add role
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: authData.user.id,
        role: newUser.role,
        is_active: true,
      });
      if (roleError) throw roleError;

      // Add to users table with hashed password indicator
      const { error: usersError } = await supabase.from("users").insert({
        id: authData.user.id,
        name: newUser.name,
        phone: newUser.whatsapp || null,
        role: newUser.role,
        active: true,
        password_hash: "auth_managed",
      });
      if (usersError) {
        console.error("Error inserting into users table:", usersError);
      }

      // Add profile if table exists
      await supabase.from("profiles").upsert({
        id: authData.user.id,
        email: newUser.email,
        full_name: newUser.name,
        whatsapp: newUser.whatsapp || null,
      }).select();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "تم إضافة المستخدم بنجاح" });
      setAddOpen(false);
      setNewUser({ email: "", password: "", name: "", role: "sales", whatsapp: "" });
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  function handleCreate() {
    if (!newUser.email) { toast({ title: "أدخل البريد الإلكتروني", variant: "destructive" }); return; }
    if (!newUser.password || newUser.password.length < 6) { toast({ title: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" }); return; }
    createUserMutation.mutate();
  }

  return (
    <Card className="shadow-[var(--shadow-card)] border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-cairo text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            إدارة المستخدمين
          </CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)} className="font-cairo gap-1">
            <UserPlus className="h-4 w-4" />
            إضافة مستخدم
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !users?.length ? (
          <p className="text-center text-muted-foreground font-cairo py-12">لا يوجد مستخدمون</p>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-cairo text-right">الاسم</TableHead>
                  <TableHead className="font-cairo text-right">البريد الإلكتروني</TableHead>
                  <TableHead className="font-cairo text-right">الواتساب</TableHead>
                  <TableHead className="font-cairo text-right">الدور</TableHead>
                  <TableHead className="font-cairo text-right">الحالة</TableHead>
                  <TableHead className="font-cairo text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-cairo font-medium">{u.name}</TableCell>
                    <TableCell className="font-cairo text-muted-foreground text-sm" dir="ltr">{u.email}</TableCell>
                    <TableCell className="font-cairo text-muted-foreground text-sm" dir="ltr">{u.whatsapp}</TableCell>
                    <TableCell>
                      <Badge variant={ROLE_COLORS[u.role] ?? "outline"} className="font-cairo text-[11px]">
                        {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.is_active !== false}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: u.id, is_active: checked })}
                        />
                        <span className={`text-xs font-cairo ${u.is_active !== false ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {u.is_active !== false ? "مفعّل" : "معطّل"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser(u)}
                        className="font-cairo text-xs"
                      >
                        تعديل الدور
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo text-right">إضافة مستخدم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-cairo">الاسم</Label>
              <Input value={newUser.name} onChange={(e) => setNewUser((f) => ({ ...f, name: e.target.value }))} className="font-cairo" placeholder="الاسم الكامل" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">البريد الإلكتروني *</Label>
              <Input value={newUser.email} onChange={(e) => setNewUser((f) => ({ ...f, email: e.target.value }))} className="font-cairo" dir="ltr" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">رقم الواتساب</Label>
              <Input value={newUser.whatsapp} onChange={(e) => setNewUser((f) => ({ ...f, whatsapp: e.target.value }))} className="font-cairo" dir="ltr" placeholder="+201xxxxxxxxx" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">كلمة المرور *</Label>
              <Input value={newUser.password} onChange={(e) => setNewUser((f) => ({ ...f, password: e.target.value }))} className="font-cairo" dir="ltr" type="password" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-cairo">الدور</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser((f) => ({ ...f, role: v }))}>
                <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="font-cairo">{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button onClick={handleCreate} disabled={createUserMutation.isPending} className="font-cairo gap-1">
              {createUserMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {createUserMutation.isPending ? "جاري الإنشاء..." : "إضافة"}
            </Button>
            <Button variant="outline" onClick={() => setAddOpen(false)} className="font-cairo">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-cairo text-right">تعديل دور المستخدم</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <p className="font-cairo text-sm text-muted-foreground">
                {editingUser.name} ({editingUser.email})
              </p>
              <div className="space-y-1.5">
                <Label className="font-cairo">الدور الجديد</Label>
                <Select defaultValue={editingUser.role} onValueChange={(v) => setEditingUser((u: any) => ({ ...u, role: v }))}>
                  <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value} className="font-cairo">{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={() => editingUser && updateRoleMutation.mutate({ id: editingUser.id, role: editingUser.role })}
              disabled={updateRoleMutation.isPending}
              className="font-cairo gap-1"
            >
              {updateRoleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ
            </Button>
            <Button variant="outline" onClick={() => setEditingUser(null)} className="font-cairo">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
