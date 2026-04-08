import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Target, Calculator, Users, Phone, MapPin, CalendarDays } from "lucide-react";

interface TargetResult {
  requiredQuantity: number;
  perSalesperson: number;
  dailyCalls: number;
  dailyVisits: number;
  weeklyTarget: number;
}

export function SmartTargetsPage() {
  const queryClient = useQueryClient();
  const [fixedExpenses, setFixedExpenses] = useState("");
  const [monthlyDebt, setMonthlyDebt] = useState("");
  const [profitPerMeter, setProfitPerMeter] = useState("");
  const [workDays, setWorkDays] = useState("26");
  const [salespeopleCount, setSalespeopleCount] = useState("");
  const [result, setResult] = useState<TargetResult | null>(null);

  const { data: latestTarget, isLoading } = useQuery({
    queryKey: ["latest-target"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("targets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fe = parseFloat(fixedExpenses);
      const md = parseFloat(monthlyDebt);
      const pm = parseFloat(profitPerMeter);
      const wd = parseInt(workDays);
      const sc = parseInt(salespeopleCount);

      if ([fe, md, pm, wd, sc].some((v) => isNaN(v) || v <= 0)) {
        throw new Error("يرجى ملء جميع الحقول بقيم صحيحة");
      }

      const { error } = await supabase.from("targets").insert({
        fixed_expenses: fe,
        monthly_debt: md,
        profit_per_meter: pm,
        work_days: wd,
        salespeople_count: sc,
      });
      if (error) throw error;

      const requiredQuantity = (fe + md) / pm;
      const perSalesperson = requiredQuantity / sc;
      const dailyCalls = perSalesperson / 0.1 / wd;
      const dailyVisits = dailyCalls / 2;
      const weeklyTarget = perSalesperson / (wd / 7);

      return { requiredQuantity, perSalesperson, dailyCalls, dailyVisits, weeklyTarget };
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["latest-target"] });
      toast({ title: "تم حساب وحفظ الهدف بنجاح ✅" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const handleCalculate = () => saveMutation.mutate();

  const resultCards = result
    ? [
        { label: "الكمية المطلوبة شهرياً", value: `${result.requiredQuantity.toFixed(0)} م³`, icon: Target, color: "text-primary" },
        { label: "نصيب كل بائع", value: `${result.perSalesperson.toFixed(0)} م³`, icon: Users, color: "text-chart-2" },
        { label: "المكالمات اليومية لكل بائع", value: `${result.dailyCalls.toFixed(0)} مكالمة`, icon: Phone, color: "text-chart-3" },
        { label: "الزيارات اليومية لكل بائع", value: `${result.dailyVisits.toFixed(0)} زيارة`, icon: MapPin, color: "text-chart-4" },
        { label: "الهدف الأسبوعي لكل بائع", value: `${result.weeklyTarget.toFixed(1)} م³`, icon: CalendarDays, color: "text-chart-5" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Target className="h-6 w-6 text-primary" />
        <h2 className="text-xl md:text-2xl font-cairo font-bold text-foreground">الأهداف الذكية</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-cairo text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            إدخال البيانات الشهرية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="font-cairo">المصاريف الثابتة (جنيه)</Label>
              <Input
                type="number"
                placeholder="مثال: 50000"
                value={fixedExpenses}
                onChange={(e) => setFixedExpenses(e.target.value)}
                className="font-cairo"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">المديونية الشهرية (جنيه)</Label>
              <Input
                type="number"
                placeholder="مثال: 30000"
                value={monthlyDebt}
                onChange={(e) => setMonthlyDebt(e.target.value)}
                className="font-cairo"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">متوسط ربح المتر (جنيه)</Label>
              <Input
                type="number"
                placeholder="مثال: 50"
                value={profitPerMeter}
                onChange={(e) => setProfitPerMeter(e.target.value)}
                className="font-cairo"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">عدد أيام العمل في الشهر</Label>
              <Input
                type="number"
                placeholder="مثال: 26"
                value={workDays}
                onChange={(e) => setWorkDays(e.target.value)}
                className="font-cairo"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">عدد البائعين</Label>
              <Input
                type="number"
                placeholder="مثال: 5"
                value={salespeopleCount}
                onChange={(e) => setSalespeopleCount(e.target.value)}
                className="font-cairo"
              />
            </div>
          </div>
          <Button
            onClick={handleCalculate}
            disabled={saveMutation.isPending}
            className="mt-6 font-cairo gap-2"
          >
            <Calculator className="h-4 w-4" />
            {saveMutation.isPending ? "جاري الحساب..." : "احسب الهدف"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resultCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`p-3 rounded-xl bg-muted ${card.color}`}>
                  <card.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-cairo text-muted-foreground">{card.label}</p>
                  <p className="text-xl font-cairo font-bold text-foreground">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
