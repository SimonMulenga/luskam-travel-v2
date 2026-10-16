import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FloatingContact } from "@/components/FloatingContact";
import { AiAssistant } from "@/components/AiAssistant";
import { PageMetadata } from "@/components/PageMetadata";

const Index = lazy(() => import("./pages/Index.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Flights = lazy(() => import("./pages/Flights.tsx"));
const Hotels = lazy(() => import("./pages/Hotels.tsx"));
const Cars = lazy(() => import("./pages/Cars.tsx"));
const Visa = lazy(() => import("./pages/Visa.tsx"));
const Checkout = lazy(() => import("./pages/Checkout.tsx"));
const Kakande = lazy(() => import("./pages/Kakande.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const Blog = lazy(() => import("./pages/Blog.tsx"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center px-4" role="status" aria-live="polite">
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4 shadow-sm">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-accent" aria-hidden="true" />
      <span className="text-sm font-medium text-muted-foreground">Loading page…</span>
    </div>
  </div>
);

const CustomerSupportWidgets = () => {
  const { pathname } = useLocation();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return <><FloatingContact /><AiAssistant /></>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PageMetadata />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/flights" element={<Flights />} />
            <Route path="/hotels" element={<Hotels />} />
            <Route path="/cars" element={<Cars />} />
            <Route path="/visa" element={<Visa />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/kakande" element={<Kakande />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/account" element={<Account />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<Blog />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <CustomerSupportWidgets />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
