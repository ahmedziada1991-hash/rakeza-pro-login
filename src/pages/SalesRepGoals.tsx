import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { MonthlyGoals } from "@/components/sales-rep/MonthlyGoals";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const SalesRepGoals = () => {
  const navigate = useNavigate();
  const { session, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !session) navigate("/");
  }, [session, isLoading, navigate]);

  if (isLoading) return null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="h-14 bg-card border-b border-border px-4 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/sales-rep")}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-cairo font-bold text-foreground">أهدافي</h1>
      </header>

      <main className="p-4 max-w-2xl mx-auto pb-8">
        <MonthlyGoals />
      </main>
    </div>
  );
};

export default SalesRepGoals;
