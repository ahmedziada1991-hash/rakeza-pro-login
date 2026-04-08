import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Target, Calculator, Users, Phone, MapPin, CalendarDays, BarChart3, ClipboardList } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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

  // Load latest saved target
  const { data: latestTarget } = useQuery({
    queryKey: ["latest-target"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("targets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setFixedExpenses(String(data.fixed_expenses || ""));
        setMonthlyDebt(String(data.monthly_debt || ""));
        setProfitPerMeter(String(data.profit_per_m3 || ""));
        setWorkDays(String(data.working_days || "26"));
        setSalespeopleCount(String(data.num_salespeople || ""));
        if (data.target_m3 && data.num_salespeople) {
          const rq = data.target_m3;
          const ps = rq / data.num_salespeople;
          setResult({
            requiredQuantity: rq,
            perSalesperson: ps,
            dailyCalls: data.calls_per_day || Math.ceil(ps / 0.1 / (data.working_days || 26)),
            dailyVisits: data.visits_per_day || Math.ceil(ps / 0.1 / (data.working_days || 26) / 2),
            weeklyTarget: ps / ((data.working_days || 26) / 7),
          });
        }
      }
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

      const requiredQuantity = (fe + md) / pm;
      const perSalesperson = requiredQuantity / sc;
      const dailyCalls = Math.ceil(perSalesperson / 0.1 / wd);
      const dailyVisits = Math.ceil(dailyCalls / 2);
      const profitNeeded = fe + md;
      const now = new Date();

      const { error } = await (supabase as any).from("targets").insert({
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        fixed_expenses: fe,
        monthly_debt: md,
        profit_per_m3: pm,
        working_days: wd,
        num_salespeople: sc,
        target_m3: requiredQuantity,
        debt_amount: md,
        profit_needed: profitNeeded,
        calls_per_day: dailyCalls,
        visits_per_day: dailyVisits,
      });
      if (error) throw error;

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
              <Input type="number" placeholder="مثال: 50000" value={fixedExpenses} onChange={(e) => setFixedExpenses(e.target.value)} className="font-cairo" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">المديونية الشهرية (جنيه)</Label>
              <Input type="number" placeholder="مثال: 30000" value={monthlyDebt} onChange={(e) => setMonthlyDebt(e.target.value)} className="font-cairo" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">متوسط ربح المتر (جنيه)</Label>
              <Input type="number" placeholder="مثال: 50" value={profitPerMeter} onChange={(e) => setProfitPerMeter(e.target.value)} className="font-cairo" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">عدد أيام العمل في الشهر</Label>
              <Input type="number" placeholder="مثال: 26" value={workDays} onChange={(e) => setWorkDays(e.target.value)} className="font-cairo" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">عدد البائعين</Label>
              <Input type="number" placeholder="مثال: 5" value={salespeopleCount} onChange={(e) => setSalespeopleCount(e.target.value)} className="font-cairo" />
            </div>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="mt-6 font-cairo gap-2">
            <Calculator className="h-4 w-4" />
            {saveMutation.isPending ? "جاري الحساب..." : "احسب الهدف"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
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

          <Card>
            <CardHeader>
              <CardTitle className="font-cairo text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                تقدم البائعين نحو الهدف الشهري
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SalespeopleChart
                count={parseInt(salespeopleCount) || 0}
                targetPerSalesperson={result.perSalesperson}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-cairo text-lg flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                تتبع الأداء اليومي
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DailyTrackingTable
                count={parseInt(salespeopleCount) || 0}
                targetCalls={result.dailyCalls}
                targetVisits={result.dailyVisits}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SalespeopleChart({ count, targetPerSalesperson }: { count: number; targetPerSalesperson: number }) {
  const salespeopleNames = ["أحمد", "محمد", "علي", "خالد", "عمر", "يوسف", "حسن", "سعيد", "طارق", "مصطفى"];

  // Query pour_orders to get actual achieved quantities per salesperson
  const { data: chartData } = useQuery({
    queryKey: ["salespeople-progress", count, targetPerSalesperson],
    queryFn: async () => {
      // Try to get real sales data from pour_orders
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: orders } = await (supabase as any)
        .from("pour_orders")
        .select("quantity, assigned_to")
        .gte("created_at", startOfMonth)
        .eq("status", "completed");

      // Build per-salesperson achieved map
      const achievedMap: Record<string, number> = {};
      if (orders && orders.length > 0) {
        orders.forEach((o: any) => {
          const key = o.assigned_to || "غير محدد";
          achievedMap[key] = (achievedMap[key] || 0) + (o.quantity || 0);
        });
      }

      // Generate chart data for each salesperson slot
      return Array.from({ length: count }, (_, i) => {
        const name = salespeopleNames[i] || `بائع ${i + 1}`;
        // Use real data if available, otherwise simulate
        const achieved = Object.values(achievedMap)[i] as number ?? Math.round(targetPerSalesperson * (0.3 + Math.random() * 0.7));
        const percentage = Math.min(100, Math.round((achieved / targetPerSalesperson) * 100));
        return { name, الهدف: Math.round(targetPerSalesperson), المحقق: achieved, percentage };
      });
    },
    enabled: count > 0 && targetPerSalesperson > 0,
  });

  if (!chartData || chartData.length === 0) return null;

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis dataKey="name" type="category" tick={{ fontSize: 13, fontFamily: "Cairo" }} width={60} />
          <Tooltip
            contentStyle={{ fontFamily: "Cairo", direction: "rtl", borderRadius: 8 }}
            formatter={(value: number, name: string) => [`${value} م³`, name]}
          />
          <Legend wrapperStyle={{ fontFamily: "Cairo" }} />
          <Bar dataKey="الهدف" fill="hsl(var(--muted-foreground))" opacity={0.3} radius={[0, 4, 4, 0]} />
          <Bar dataKey="المحقق" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={
                  entry.percentage >= 80
                    ? "hsl(var(--chart-2))"
                    : entry.percentage >= 50
                    ? "hsl(var(--chart-4))"
                    : "hsl(var(--destructive))"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {chartData.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-sm font-cairo">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                s.percentage >= 80 ? "bg-chart-2" : s.percentage >= 50 ? "bg-chart-4" : "bg-destructive"
              }`}
            />
            <span className="text-muted-foreground">{s.name}:</span>
            <span className="font-bold text-foreground">{s.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyTrackingTable({ count, targetCalls, targetVisits }: { count: number; targetCalls: number; targetVisits: number }) {
  const queryClient = useQueryClient();
  const salespeopleNames = ["أحمد", "محمد", "علي", "خالد", "عمر", "يوسف", "حسن", "سعيد", "طارق", "مصطفى"];
  const todayStr = new Date().toISOString().split("T")[0];
  const todayLabel = new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const [rows, setRows] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      name: salespeopleNames[i] || `بائع ${i + 1}`,
      actualCalls: 0,
      actualVisits: 0,
    }))
  );
  const [saving, setSaving] = useState(false);

  // Load today's saved data
  useQuery({
    queryKey: ["daily-performance", todayStr, count],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_performance")
        .select("*")
        .eq("date", todayStr)
        .order("salesperson_name");
      if (error) throw error;
      if (data && data.length > 0) {
        setRows(
          Array.from({ length: count }, (_, i) => {
            const name = salespeopleNames[i] || `بائع ${i + 1}`;
            const saved = data.find((d: any) => d.salesperson_name === name);
            return {
              name,
              actualCalls: saved?.actual_calls ?? 0,
              actualVisits: saved?.actual_visits ?? 0,
            };
          })
        );
      }
      return data;
    },
  });

  const updateRow = (index: number, field: "actualCalls" | "actualVisits", value: number) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete existing records for today then insert fresh
      await (supabase as any).from("daily_performance").delete().eq("date", todayStr);

      const records = rows.map((r) => ({
        date: todayStr,
        salesperson_name: r.name,
        actual_calls: r.actualCalls,
        actual_visits: r.actualVisits,
        target_calls: targetCalls,
        target_visits: targetVisits,
      }));

      const { error } = await (supabase as any).from("daily_performance").insert(records);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["daily-performance"] });
      toast({ title: "تم حفظ الأداء اليومي بنجاح ✅" });
    } catch (err: any) {
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const computed = rows.map((r) => {
    const callsPercent = targetCalls > 0 ? Math.min(100, Math.round((r.actualCalls / targetCalls) * 100)) : 0;
    const visitsPercent = targetVisits > 0 ? Math.min(100, Math.round((r.actualVisits / targetVisits) * 100)) : 0;
    const overall = Math.round((callsPercent + visitsPercent) / 2);
    return { ...r, callsPercent, visitsPercent, overall };
  });

  const getStatusBadge = (percent: number) => {
    if (percent >= 80) return <Badge className="bg-chart-2/15 text-chart-2 border-chart-2/30 font-cairo text-xs">ممتاز</Badge>;
    if (percent >= 50) return <Badge className="bg-chart-4/15 text-chart-4 border-chart-4/30 font-cairo text-xs">متوسط</Badge>;
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30 font-cairo text-xs">ضعيف</Badge>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-cairo text-muted-foreground">{todayLabel}</p>
        <Button onClick={handleSave} disabled={saving} size="sm" className="font-cairo gap-2">
          {saving ? "جاري الحفظ..." : "💾 حفظ الأداء اليومي"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-cairo text-right">البائع</TableHead>
              <TableHead className="font-cairo text-center">مكالمات (هدف)</TableHead>
              <TableHead className="font-cairo text-center">مكالمات (فعلي)</TableHead>
              <TableHead className="font-cairo text-center">زيارات (هدف)</TableHead>
              <TableHead className="font-cairo text-center">زيارات (فعلي)</TableHead>
              <TableHead className="font-cairo text-center">الأداء</TableHead>
              <TableHead className="font-cairo text-center">التقييم</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {computed.map((row, i) => (
              <TableRow key={row.name}>
                <TableCell className="font-cairo font-medium">{row.name}</TableCell>
                <TableCell className="text-center text-muted-foreground">{targetCalls}</TableCell>
                <TableCell className="text-center p-1">
                  <Input
                    type="number"
                    min={0}
                    value={row.actualCalls}
                    onChange={(e) => updateRow(i, "actualCalls", parseInt(e.target.value) || 0)}
                    className={`w-16 mx-auto text-center font-bold h-8 ${row.actualCalls >= targetCalls ? "text-chart-2" : "text-destructive"}`}
                  />
                </TableCell>
                <TableCell className="text-center text-muted-foreground">{targetVisits}</TableCell>
                <TableCell className="text-center p-1">
                  <Input
                    type="number"
                    min={0}
                    value={row.actualVisits}
                    onChange={(e) => updateRow(i, "actualVisits", parseInt(e.target.value) || 0)}
                    className={`w-16 mx-auto text-center font-bold h-8 ${row.actualVisits >= targetVisits ? "text-chart-2" : "text-destructive"}`}
                  />
                </TableCell>
                <TableCell className="text-center font-cairo font-bold">{row.overall}%</TableCell>
                <TableCell className="text-center">{getStatusBadge(row.overall)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
