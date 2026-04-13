import { useState, useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Flame, Thermometer, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";

export interface QualificationData {
  hasCurrentProject: boolean;
  expectedPourDate: Date | undefined;
  knowsQuantity: "yes" | "no" | null;
  estimatedQuantity: number;
  quantityRange: "small" | "medium" | "large" | null;
  projectType: string;
  area: string;
  hasOtherSupplier: boolean;
  paymentType: "cash" | "credit" | "mixed";
}

const INITIAL_DATA: QualificationData = {
  hasCurrentProject: false,
  expectedPourDate: undefined,
  knowsQuantity: null,
  estimatedQuantity: 50,
  quantityRange: null,
  projectType: "",
  area: "",
  hasOtherSupplier: false,
  paymentType: "cash",
};

const PROJECT_TYPES = [
  { value: "building", label: "عمارة" },
  { value: "villa", label: "فيلا" },
  { value: "commercial", label: "تجاري" },
  { value: "road", label: "طريق" },
  { value: "other", label: "أخرى" },
];

const AREAS = [
  { value: "october", label: "أكتوبر" },
  { value: "zayed", label: "زايد" },
  { value: "sheikh_zayed", label: "الشيخ زايد" },
  { value: "other", label: "أخرى" },
];

function calculateScore(data: QualificationData): number {
  let score = 0;

  // مشروع حالي = نعم → نقطتان
  if (data.hasCurrentProject) score += 2;

  // موعد الصبة
  if (data.expectedPourDate) {
    const daysUntil = differenceInDays(data.expectedPourDate, new Date());
    if (daysUntil <= 30) score += 2;
    else if (daysUntil <= 90) score += 1;
  }

  // يعرف الكمية → نقطة
  if (data.knowsQuantity === "yes") score += 1;

  // كمية أكتر من 200م³ → نقطة إضافية
  if (data.knowsQuantity === "yes" && data.estimatedQuantity > 200) score += 1;
  if (data.knowsQuantity === "no" && data.quantityRange === "large") score += 1;

  // مش بيشتغل مع مورد تاني → نقطة
  if (!data.hasOtherSupplier) score += 1;

  // دفع كاش → نقطتان / جزء كاش → نقطة
  if (data.paymentType === "cash") score += 2;
  else if (data.paymentType === "mixed") score += 1;

  // منطقة أكتوبر أو زايد → نقطة
  if (["october", "zayed"].includes(data.area)) score += 1;

  return score;
}

function getStatusFromScore(score: number): { status: string; label: string; color: string; icon: any } {
  if (score >= 7) return { status: "hot", label: "ساخن 🔴", color: "bg-destructive/15 text-destructive border-destructive/30", icon: Flame };
  if (score >= 4) return { status: "warm", label: "دافئ 🟡", color: "bg-chart-4/15 text-chart-4 border-chart-4/30", icon: Thermometer };
  return { status: "cold", label: "بارد 🔵", color: "bg-chart-1/15 text-chart-1 border-chart-1/30", icon: Snowflake };
}

interface Props {
  onChange: (data: QualificationData, suggestedStatus: string, score: number) => void;
  initialData?: Partial<QualificationData>;
}

export function ClientQualificationForm({ onChange, initialData }: Props) {
  const [data, setData] = useState<QualificationData>({ ...INITIAL_DATA, ...initialData });

  const score = useMemo(() => calculateScore(data), [data]);
  const suggested = useMemo(() => getStatusFromScore(score), [score]);

  useEffect(() => {
    onChange(data, suggested.status, score);
  }, [data, suggested.status, score]);

  const update = (partial: Partial<QualificationData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  };

  const YesNoButtons = ({ value, onSelect }: { value: boolean; onSelect: (v: boolean) => void }) => (
    <div className="flex gap-2">
      <Button type="button" size="sm" variant={value ? "default" : "outline"} className="font-cairo flex-1" onClick={() => onSelect(true)}>نعم</Button>
      <Button type="button" size="sm" variant={!value ? "default" : "outline"} className="font-cairo flex-1" onClick={() => onSelect(false)}>لأ</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Q1: مشروع حالي */}
      <div className="space-y-2">
        <Label className="font-cairo font-bold">1. هل عنده مشروع حالي؟</Label>
        <YesNoButtons value={data.hasCurrentProject} onSelect={(v) => update({ hasCurrentProject: v })} />
      </div>

      {/* Q2: موعد الصبة */}
      <div className="space-y-2">
        <Label className="font-cairo font-bold">2. موعد الصبة التقريبي؟</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className={cn("w-full font-cairo justify-start", !data.expectedPourDate && "text-muted-foreground")}>
              <CalendarDays className="h-4 w-4 ml-2" />
              {data.expectedPourDate ? format(data.expectedPourDate, "yyyy-MM-dd") : "اختر التاريخ"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={data.expectedPourDate} onSelect={(d) => update({ expectedPourDate: d })} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>

      {/* Q3: الكمية */}
      <div className="space-y-2">
        <Label className="font-cairo font-bold">3. الكمية التقريبية؟</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={data.knowsQuantity === "yes" ? "default" : "outline"} className="font-cairo flex-1" onClick={() => update({ knowsQuantity: "yes" })}>نعم عارف</Button>
          <Button type="button" size="sm" variant={data.knowsQuantity === "no" ? "default" : "outline"} className="font-cairo flex-1" onClick={() => update({ knowsQuantity: "no" })}>مش متأكد</Button>
        </div>

        {data.knowsQuantity === "yes" && (
          <div className="space-y-2 bg-muted/50 rounded-lg p-3">
            <div className="flex justify-between text-sm font-cairo">
              <span>الكمية:</span>
              <span className="font-bold">{data.estimatedQuantity} م³</span>
            </div>
            <Slider
              value={[data.estimatedQuantity]}
              onValueChange={([v]) => update({ estimatedQuantity: v })}
              min={10}
              max={500}
              step={10}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground font-cairo">
              <span>10 م³</span>
              <span>500 م³</span>
            </div>
          </div>
        )}

        {data.knowsQuantity === "no" && (
          <div className="flex gap-2">
            {([
              { value: "small" as const, label: "صغير < 50م³" },
              { value: "medium" as const, label: "متوسط 50-200م³" },
              { value: "large" as const, label: "كبير > 200م³" },
            ]).map((opt) => (
              <Button key={opt.value} type="button" size="sm" variant={data.quantityRange === opt.value ? "default" : "outline"} className="font-cairo flex-1 text-xs" onClick={() => update({ quantityRange: opt.value })}>
                {opt.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Q4: نوع المشروع */}
      <div className="space-y-2">
        <Label className="font-cairo font-bold">4. نوع المشروع؟</Label>
        <div className="flex flex-wrap gap-2">
          {PROJECT_TYPES.map((pt) => (
            <Button key={pt.value} type="button" size="sm" variant={data.projectType === pt.value ? "default" : "outline"} className="font-cairo" onClick={() => update({ projectType: pt.value })}>
              {pt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Q5: المنطقة */}
      <div className="space-y-2">
        <Label className="font-cairo font-bold">5. المنطقة؟</Label>
        <div className="flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <Button key={a.value} type="button" size="sm" variant={data.area === a.value ? "default" : "outline"} className="font-cairo" onClick={() => update({ area: a.value })}>
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Q6: مورد تاني */}
      <div className="space-y-2">
        <Label className="font-cairo font-bold">6. بيشتغل مع مورد تاني؟</Label>
        <YesNoButtons value={data.hasOtherSupplier} onSelect={(v) => update({ hasOtherSupplier: v })} />
      </div>

      {/* Q7: طريقة الدفع */}
      <div className="space-y-2">
        <Label className="font-cairo font-bold">7. طريقة الدفع؟</Label>
        <div className="flex gap-2">
          {([
            { value: "cash" as const, label: "كاش" },
            { value: "credit" as const, label: "آجل" },
            { value: "mixed" as const, label: "جزء كاش وجزء آجل" },
          ]).map((opt) => (
            <Button key={opt.value} type="button" size="sm" variant={data.paymentType === opt.value ? "default" : "outline"} className="font-cairo flex-1" onClick={() => update({ paymentType: opt.value })}>
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* التصنيف المقترح */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-2 border">
        <div className="flex items-center justify-between">
          <span className="font-cairo font-bold text-sm">التصنيف المقترح:</span>
          <Badge className={cn("font-cairo text-sm px-3 py-1", suggested.color)}>
            {suggested.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-secondary rounded-full h-2">
            <div
              className={cn(
                "h-2 rounded-full transition-all",
                score >= 7 ? "bg-destructive" : score >= 4 ? "bg-chart-4" : "bg-chart-1"
              )}
              style={{ width: `${Math.min(100, (score / 10) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-cairo text-muted-foreground">{score}/10</span>
        </div>
      </div>
    </div>
  );
}

export { calculateScore, getStatusFromScore, INITIAL_DATA as INITIAL_QUALIFICATION_DATA };
export type { QualificationData };
