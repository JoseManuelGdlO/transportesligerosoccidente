import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "@/context/AuthContext";
import { TloProvider } from "@/context/TloContext";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/tlo/Login";
import Dashboard from "@/pages/tlo/Dashboard";
import Viajes from "@/pages/tlo/Viajes";
import ViajeDetalle from "@/pages/tlo/ViajeDetalle";
import Camiones from "@/pages/tlo/Camiones";
import Operadores from "@/pages/tlo/Operadores";
import Clientes from "@/pages/tlo/Clientes";
import Liquidaciones from "@/pages/tlo/Liquidaciones";
import Reportes from "@/pages/tlo/Reportes";
import Combustibles from "@/pages/tlo/Combustibles";
import Usuarios from "@/pages/tlo/Usuarios";
import Marca from "@/pages/tlo/Marca";
import Empresa from "@/pages/tlo/Empresa";
import TiposDocumento from "@/pages/tlo/TiposDocumento";
import { FEATURE_CARTA_PORTE } from "@/config/features";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <TloProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/viajes" element={<Viajes />} />
                <Route path="/viajes/:id" element={<ViajeDetalle />} />
                <Route path="/camiones" element={<Camiones />} />
                <Route path="/operadores" element={<Operadores />} />
                <Route path="/clientes" element={<Clientes />} />
                <Route path="/liquidaciones" element={<Liquidaciones />} />
                <Route path="/reportes" element={<Reportes />} />
                <Route path="/combustibles" element={<Combustibles />} />
                <Route path="/usuarios" element={<Usuarios />} />
                <Route path="/marca" element={<Marca />} />
                {FEATURE_CARTA_PORTE ? <Route path="/empresa" element={<Empresa />} /> : null}
                <Route path="/tipos-documento" element={<TiposDocumento />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TloProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
