import {
  LayoutDashboard, Truck as TruckIcon, Users, Building2, Route, Wallet, BarChart3, LogOut, ShieldCheck,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import logo from "@/assets/tlo-logo.jpeg";
import { useAuth } from "@/context/AuthContext";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
  { title: "Viajes", url: "/viajes", icon: Route },
  { title: "Liquidaciones", url: "/liquidaciones", icon: Wallet },
  { title: "Reportes", url: "/reportes", icon: BarChart3 },
];

const catalogos = [
  { title: "Camiones", url: "/camiones", icon: TruckIcon },
  { title: "Operadores", url: "/operadores", icon: Users },
  { title: "Clientes", url: "/clientes", icon: Building2 },
];

const administracion = [
  { title: "Usuarios y permisos", url: "/usuarios", icon: ShieldCheck },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground hover:bg-sidebar-accent/60"
    }`;

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center gap-3 px-2 py-3 ${collapsed ? "justify-center" : ""}`}>
          <div className="rounded-md bg-white p-1.5 flex-shrink-0">
            <img src={logo} alt="TLO" className="h-8 w-8 object-contain" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sidebar-foreground font-bold text-base">TLO</div>
              <div className="text-[10px] text-sidebar-foreground/60 uppercase tracking-wider">
                Trans. Ligeros Occ.
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.end} className={linkCls}>
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Catálogos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {catalogos.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={linkCls}>
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Administración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {administracion.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={linkCls}>
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        {!collapsed && user && (
          <div className="px-2 py-1.5 text-xs text-sidebar-foreground/80">
            <div className="font-medium text-sidebar-foreground truncate">{user.name}</div>
            <div className="capitalize text-sidebar-foreground/60">{user.role}</div>
          </div>
        )}
        <button
          onClick={() => { logout(); nav("/login"); }}
          className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}