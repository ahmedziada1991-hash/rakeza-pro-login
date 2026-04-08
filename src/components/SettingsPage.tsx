import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Settings, Building2, User, Lock, Loader2, Save } from "lucide-react";

export function SettingsPage() {
  const { session } = useAuth();

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-cairo font-bold text-foreground">الإعدادات</h2>
      </div>

      <Tabs defaultValue="company" dir="rtl">
        <TabsList className="font-cairo">
          <TabsTrigger value="company" className="font-cairo gap-1">
            <Building2 className="h-3.5 w-3.5" />
            بيانات الشركة
          </TabsTrigger>
          <TabsTrigger value="profile" className="font-cairo gap-1">
            <User className="h-3.5 w-3.5" />
            الملف الشخصي
          </TabsTrigger>
          <TabsTrigger value="security" className="font-cairo gap-1">
            <Lock className="h-3.5 w-3.5" />
            الأمان
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <CompanySettings />
        </TabsContent>
        <TabsContent value="profile" className="mt-4">
          <ProfileSettings email={session?.user?.email ?? ""} />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompanySettings() {
  const [form, setForm] = useState({
    name: "ركيزة Pro",
    phone: "",
    email: "",
    address: "",
    tax_number: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleSave() {
    setSaving(true);
    // Save to localStorage for now (can be migrated to DB later)
    localStorage.setItem("company_settings", JSON.stringify(form));
    setTimeout(() => {
      setSaving(false);
      toast({ title: "تم حفظ بيانات الشركة" });
    }, 500);
  }

  // Load on mount
  useState(() => {
    const saved = localStorage.getItem("company_settings");
    if (saved) {
      try { setForm(JSON.parse(saved)); } catch {}
    }
  });

  return (
    <Card className="shadow-[var(--shadow-card)] border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="font-cairo text-base">بيانات الشركة</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-cairo">اسم الشركة</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} className="font-cairo" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-cairo">رقم الهاتف</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="font-cairo" dir="ltr" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-cairo">البريد الإلكتروني</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} className="font-cairo" dir="ltr" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-cairo">الرقم الضريبي</Label>
            <Input value={form.tax_number} onChange={(e) => set("tax_number", e.target.value)} className="font-cairo" dir="ltr" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="font-cairo">العنوان</Label>
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} className="font-cairo" />
        </div>
        <div className="space-y-1.5">
          <Label className="font-cairo">ملاحظات</Label>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="font-cairo" rows={3} />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="font-cairo gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "جاري الحفظ..." : "حفظ البيانات"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileSettings({ email }: { email: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useState(() => {
    const saved = localStorage.getItem("profile_settings");
    if (saved) {
      try {
        const d = JSON.parse(saved);
        setName(d.name ?? "");
        setPhone(d.phone ?? "");
      } catch {}
    }
  });

  function handleSave() {
    setSaving(true);
    localStorage.setItem("profile_settings", JSON.stringify({ name, phone }));
    setTimeout(() => {
      setSaving(false);
      toast({ title: "تم حفظ الملف الشخصي" });
    }, 500);
  }

  return (
    <Card className="shadow-[var(--shadow-card)] border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="font-cairo text-base">الملف الشخصي</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-cairo">الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="font-cairo" placeholder="اسمك الكامل" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-cairo">رقم الهاتف</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="font-cairo" dir="ltr" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="font-cairo">البريد الإلكتروني</Label>
          <Input value={email} className="font-cairo bg-muted" dir="ltr" disabled />
          <p className="text-xs text-muted-foreground font-cairo">لا يمكن تغيير البريد الإلكتروني</p>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="font-cairo gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SecuritySettings() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleChangePassword() {
    if (!newPw || newPw.length < 6) {
      toast({ title: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
      return;
    }
    if (newPw !== confirmPw) {
      toast({ title: "كلمة المرور غير متطابقة", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم تغيير كلمة المرور بنجاح" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    }
  }

  return (
    <Card className="shadow-[var(--shadow-card)] border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="font-cairo text-base">تغيير كلمة المرور</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="font-cairo">كلمة المرور الحالية</Label>
          <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="font-cairo" dir="ltr" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-cairo">كلمة المرور الجديدة</Label>
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="font-cairo" dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-cairo">تأكيد كلمة المرور</Label>
            <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="font-cairo" dir="ltr" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleChangePassword} disabled={saving} className="font-cairo gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {saving ? "جاري التغيير..." : "تغيير كلمة المرور"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
