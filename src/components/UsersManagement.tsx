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
import { Plus, Loader2, UserPlus, Shield, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "sales", whatsapp: "" });

  // Fetch users from users table
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch email from auth.users via edge function
  const fetchAuthEmail = async (userId: string) => {
    setLoadingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-user-management", {
        body: { action: "get-email", user_id: userId },
      });
      if (error) throw error;
      setEditEmail(data.email || "");
    } catch (err: any) {
      console.error("Error fetching auth email:", err);
      setEditEmail("");
    } finally {
      setLoadingEmail(false);
    }
  };

  const openEditDialog = (user: any) => {
    setEditingUser({ ...user });
    setEditPassword("");
    // Use email from users table first, fallback to auth.users
    if (user.email) {
      setEditEmail(user.email);
      setLoadingEmail(false);
    } else if (user.id) {
      setEditEmail("");
      fetchAuthEmail(user.id);
    } else {
      setEditEmail("");
    }
  };

  // Update user details
  const updateUserMutation = useMutation({
    mutationFn: async (userData: { id: string; name: string; email: string; phone: string; role: string; active: boolean; newPassword: string }) => {
      // Update users table
      const { error } = await supabase.from("users").update({
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        role: userData.role,
        active: userData.active,
      }).eq("id", userData.id);
      if (error) throw error;

      // Update password in auth.users if provided
      if (userData.newPassword) {
        const { data, error: pwError } = await supabase.functions.invoke("admin-user-management", {
          body: { action: "update-password", user_id: userData.id, password: userData.newPassword },
        });
        if (pwError) throw pwError;
        if (data?.error) throw new Error(data.error);
      }

      // Update email in auth.users if changed
      if (userData.email) {
        const { data, error: emailError } = await supabase.functions.invoke("admin-user-management", {
          body: { action: "update-email", user_id: userData.id, email: userData.email },
        });
        if (emailError) throw emailError;
        if (data?.error) throw new Error(data.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "تم تحديث بيانات المستخدم بنجاح" });
      setEditingUser(null);
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Delete user
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-user-management", {
        body: { action: "delete-user", user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "تم حذف المستخدم بنجاح" });
      setEditingUser(null);
    },
    onError: (err: any) => {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    },
  });
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("users").update({ active: is_active }).eq("id", id);
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
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: { data: { full_name: newUser.name } },
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error("فشل إنشاء المستخدم");

      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: authData.user.id,
        role: newUser.role,
        is_active: true,
      });
      if (roleError) throw roleError;

      const { error: usersError } = await supabase.from("users").insert({
        id: authData.user.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.whatsapp || null,
        role: newUser.role,
        active: true,
        password: newUser.password,
      });
      if (usersError) console.error("Error inserting into users table:", usersError);

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
                  <TableHead className="font-cairo text-right">الدور</TableHead>
                  <TableHead className="font-cairo text-right">رقم الهاتف</TableHead>
                  <TableHead className="font-cairo text-right">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u: any) => (
                  <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEditDialog(u)}>
                    <TableCell className="font-cairo font-medium">{u.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={ROLE_COLORS[u.role] ?? "outline"} className="font-cairo text-[11px]">
                        {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-cairo text-muted-foreground text-sm" dir="ltr">{u.phone ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.active !== false}
                          onCheckedChange={(checked) => {
                            toggleActiveMutation.mutate({ id: u.id, is_active: checked });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className={`text-xs font-cairo ${u.active !== false ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {u.active !== false ? "مفعّل" : "معطّل"}
                        </span>
                      </div>
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

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo text-right">تعديل بيانات المستخدم</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-cairo">الاسم</Label>
                <Input value={editingUser.name ?? ""} onChange={(e) => setEditingUser((u: any) => ({ ...u, name: e.target.value }))} className="font-cairo" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">البريد الإلكتروني</Label>
                {loadingEmail ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="font-cairo" dir="ltr" type="email" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">رقم الهاتف</Label>
                <Input value={editingUser.phone ?? ""} onChange={(e) => setEditingUser((u: any) => ({ ...u, phone: e.target.value }))} className="font-cairo" dir="ltr" placeholder="+201xxxxxxxxx" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">الدور</Label>
                <Select value={editingUser.role} onValueChange={(v) => setEditingUser((u: any) => ({ ...u, role: v }))}>
                  <SelectTrigger className="font-cairo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value} className="font-cairo">{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-cairo">كلمة المرور الجديدة</Label>
                <Input 
                  value={editPassword} 
                  onChange={(e) => setEditPassword(e.target.value)} 
                  className="font-cairo" 
                  dir="ltr" 
                  type="text" 
                  placeholder="اتركها فارغة إذا لا تريد التغيير"
                />
              </div>
              <div className="flex items-center gap-3">
                <Label className="font-cairo">الحالة</Label>
                <Switch checked={editingUser.active !== false} onCheckedChange={(checked) => setEditingUser((u: any) => ({ ...u, active: checked }))} />
                <span className={`text-xs font-cairo ${editingUser.active !== false ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {editingUser.active !== false ? "مفعّل" : "معطّل"}
                </span>
              </div>
            </div>
          )}
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleteUserMutation.isPending}
              className="font-cairo gap-1"
            >
              <Trash2 className="h-4 w-4" />
              حذف المستخدم
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={() => editingUser && updateUserMutation.mutate({
                  id: editingUser.id,
                  name: editingUser.name,
                  email: editEmail,
                  phone: editingUser.phone,
                  role: editingUser.role,
                  active: editingUser.active !== false,
                  newPassword: editPassword,
                })}
                disabled={updateUserMutation.isPending}
                className="font-cairo gap-1"
              >
                {updateUserMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                حفظ التعديلات
              </Button>
              <Button variant="outline" onClick={() => setEditingUser(null)} className="font-cairo">إلغاء</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-cairo text-right">تأكيد حذف المستخدم</AlertDialogTitle>
            <AlertDialogDescription className="font-cairo text-right">
              هل أنت متأكد من حذف "{editingUser?.name}"؟ هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={() => editingUser && deleteUserMutation.mutate(editingUser.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-cairo"
            >
              {deleteUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "نعم، احذف"}
            </AlertDialogAction>
            <AlertDialogCancel className="font-cairo">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
