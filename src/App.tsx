import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import HomePage from "./pages/HomePage";
import SearchPage from "./pages/SearchPage";
import LandlordDetailPage from "./pages/LandlordDetailPage";
import PropertyDetailPage from "./pages/PropertyDetailPage";
import NeighborhoodDetailPage from "./pages/NeighborhoodDetailPage";
import WriteReviewPage from "./pages/WriteReviewPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AdminPage from "./pages/AdminPage";
import ImpressumPage from "./pages/ImpressumPage";
import DatenschutzPage from "./pages/DatenschutzPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="flex flex-col min-h-screen">
          <Navbar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/suche" element={<SearchPage />} />
              <Route path="/vermieter/:id" element={<LandlordDetailPage />} />
              <Route path="/gebaeude/:id" element={<PropertyDetailPage />} />
              <Route path="/nachbarschaft/:id" element={<NeighborhoodDetailPage />} />
              <Route path="/bewertung/neu" element={<WriteReviewPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/registrieren" element={<RegisterPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/impressum" element={<ImpressumPage />} />
              <Route path="/datenschutz" element={<DatenschutzPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
