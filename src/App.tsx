import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import SalesRepDashboard from "./pages/SalesRepDashboard.tsx";
import SalesRepGoals from "./pages/SalesRepGoals.tsx";
import SalesRepCalendar from "./pages/SalesRepCalendar.tsx";
import FollowUpDashboard from "./pages/FollowUpDashboard.tsx";
import ExecutionDashboard from "./pages/ExecutionDashboard.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard/sales-rep" element={<SalesRepDashboard />} />
            <Route path="/dashboard/sales-rep/goals" element={<SalesRepGoals />} />
            <Route path="/dashboard/sales-rep/calendar" element={<SalesRepCalendar />} />
            <Route path="/dashboard/follow-up" element={<FollowUpDashboard />} />
            <Route path="/dashboard/follow-up/assign" element={<FollowUpDashboard />} />
            <Route path="/dashboard/execution" element={<ExecutionDashboard />} />
            <Route path="/dashboard/execution/report" element={<ExecutionDashboard />} />
            <Route path="/dashboard/:role/*" element={<Dashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
