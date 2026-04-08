import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "أدمن",
  sales: "مبيعات",
  followup: "متابعة",
  execution: "تنفيذ",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "إدارة النظام والمستخدمين والتقارير",
  sales: "إدارة العملاء وعروض الأسعار والطلبات",
  followup: "متابعة الطلبات والتحصيل",
  execution: "إدارة التشغيل والمحطات والسائقين",
};

const Dashboard = () => {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const user = localStorage.getItem("rakiza_user");
    if (!user) {
      navigate("/");
      return;
    }
    const parsed = JSON.parse(user);
    if (parsed.role !== role) {
      navigate(`/dashboard/${parsed.role}`);
    }
  }, [role, navigate]);

  const handleLogout = () => {
    localStorage.removeItem("rakiza_user");
    navigate("/");
  };

  if (!role || !ROLE_LABELS[role]) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-cairo font-bold">ر</span>
          </div>
          <div>
            <h1 className="font-cairo font-bold text-foreground text-lg leading-tight">ركيزة Pro</h1>
            <p className="font-cairo text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="font-cairo gap-2 text-muted-foreground">
          <LogOut size={18} />
          خروج
        </Button>
      </header>

      <main className="p-4 max-w-2xl mx-auto mt-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-primary font-cairo font-bold text-xl">{ROLE_LABELS[role][0]}</span>
        </div>
        <h2 className="text-2xl font-cairo font-bold text-foreground mb-2">
          لوحة تحكم {ROLE_LABELS[role]}
        </h2>
        <p className="text-muted-foreground font-cairo">{ROLE_DESCRIPTIONS[role]}</p>
        <p className="text-muted-foreground/60 font-cairo text-sm mt-6">
          سيتم بناء هذه اللوحة قريباً...
        </p>
      </main>
    </div>
  );
};

export default Dashboard;
