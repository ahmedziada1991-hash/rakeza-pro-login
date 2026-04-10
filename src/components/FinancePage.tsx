import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Users, Building2, TrendingUp, Truck, Package } from "lucide-react";
import { ClientsTab } from "@/components/finance/ClientsTab";
import { StationsTab } from "@/components/finance/StationsTab";
import { ProfitsTab } from "@/components/finance/ProfitsTab";
import { SuppliersTab } from "@/components/finance/SuppliersTab";
import { CementTab } from "@/components/finance/CementTab";
import { PaymentDialog } from "@/components/finance/PaymentDialog";

export function FinancePage() {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-cairo font-bold text-foreground">الماليات</h2>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="font-cairo gap-1">
          <Plus className="h-4 w-4" />
          تسجيل دفعة
        </Button>
      </div>

      <Tabs defaultValue="clients" dir="rtl" className="w-full">
        <TabsList className={`w-full grid h-auto ${isAdmin ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2"}`}>
          <TabsTrigger value="clients" className="font-cairo gap-1.5 py-2 text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            العملاء
          </TabsTrigger>
          <TabsTrigger value="stations" className="font-cairo gap-1.5 py-2 text-xs sm:text-sm">
            <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            المحطات
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="suppliers" className="font-cairo gap-1.5 py-2 text-xs sm:text-sm">
              <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              الموردين
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="cement" className="font-cairo gap-1.5 py-2 text-xs sm:text-sm">
              <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              الأسمنت
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="profits" className="font-cairo gap-1.5 py-2 text-xs sm:text-sm">
              <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              الأرباح
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="clients" className="mt-4">
          <ClientsTab />
        </TabsContent>
        <TabsContent value="stations" className="mt-4">
          <StationsTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="suppliers" className="mt-4">
            <SuppliersTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="cement" className="mt-4">
            <CementTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="profits" className="mt-4">
            <ProfitsTab />
          </TabsContent>
        )}
      </Tabs>

      <PaymentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
