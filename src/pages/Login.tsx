import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, LogIn } from "lucide-react";

// Demo credentials for testing before Supabase is connected
const DEMO_USERS: Record<string, { password: string; role: string }> = {
  admin: { password: "admin123", role: "admin" },
  sales: { password: "sales123", role: "sales" },
  followup: { password: "followup123", role: "followup" },
  execution: { password: "execution123", role: "execution" },
};

const ROLE_LABELS: Record<string, string> = {
  admin: "أدمن",
  sales: "مبيعات",
  followup: "متابعة",
  execution: "تنفيذ",
};

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate network delay
    await new Promise((r) => setTimeout(r, 800));

    const user = DEMO_USERS[username.toLowerCase()];
    if (user && user.password === password) {
      localStorage.setItem("rakiza_user", JSON.stringify({ username, role: user.role }));
      toast({
        title: `مرحباً 👋`,
        description: `تم تسجيل الدخول كـ ${ROLE_LABELS[user.role]}`,
      });
      navigate(`/dashboard/${user.role}`);
    } else {
      toast({
        title: "خطأ في تسجيل الدخول",
        description: "اسم المستخدم أو كلمة المرور غير صحيحة",
        variant: "destructive",
      });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative z-10 shadow-[var(--shadow-elevated)] border-border/50">
        <CardContent className="pt-8 pb-8 px-8">
          {/* Logo placeholder */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg">
              <span className="text-primary-foreground font-cairo font-bold text-2xl">ر</span>
            </div>
            <h1 className="text-2xl font-cairo font-bold text-foreground">ركيزة Pro</h1>
            <p className="text-muted-foreground text-sm mt-1 font-cairo">نظام إدارة توريد الخرسانة الجاهزة</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="font-cairo text-foreground">
                اسم المستخدم
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="أدخل اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12 font-cairo text-right bg-muted/50 border-border focus:bg-card"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-cairo text-foreground">
                كلمة المرور
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 font-cairo text-right bg-muted/50 border-border focus:bg-card pl-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 font-cairo font-semibold text-base gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={20} />
                  تسجيل الدخول
                </>
              )}
            </Button>
          </form>

          {/* Demo credentials hint */}
          <div className="mt-6 p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground font-cairo text-center mb-2 font-semibold">
              بيانات تجريبية للدخول
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground font-cairo">
              {Object.entries(DEMO_USERS).map(([user, { role }]) => (
                <div key={user} className="flex justify-between px-2">
                  <span className="font-medium">{user}</span>
                  <span className="text-accent">{ROLE_LABELS[role]}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
