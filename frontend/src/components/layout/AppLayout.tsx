import { Navigate, Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/context/AuthContext";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/viajes": "Viajes",
  "/liquidaciones": "Liquidaciones semanales",
  "/reportes": "Reportes",
  "/camiones": "Camiones",
  "/operadores": "Operadores",
  "/clientes": "Clientes",
  "/usuarios": "Usuarios y permisos",
};

export default function AppLayout() {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace />;

  let title = titles[loc.pathname] ?? "";
  if (!title && loc.pathname.startsWith("/viajes/")) title = "Detalle de viaje";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b bg-card px-4 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-base font-semibold text-foreground">{title}</h1>
            </div>
            <div className="text-xs text-muted-foreground hidden md:block">
              {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}