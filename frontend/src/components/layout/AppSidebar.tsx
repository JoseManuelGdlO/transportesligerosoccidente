import {
  LayoutDashboard,
  Truck as TruckIcon,
  Users,
  Building2,
  Route,
  Wallet,
  BarChart3,
  Fuel,
  Wrench,
  LogOut,
  ShieldCheck,
  Palette,
  FileText,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import logo from "@/assets/tlo-logo.jpeg";
import { useAuth } from "@/context/AuthContext";
import type { Permission } from "@/types/tlo";
import { FEATURE_CARTA_PORTE } from "@/config/features";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  /** Si se define, el enlace solo se muestra con este permiso. */
  perm?: Permission;
};

const operacion: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
  { title: "Viajes", url: "/viajes", icon: Route, perm: "viajes.ver" },
  { title: "Liquidaciones", url: "/liquidaciones", icon: Wallet, perm: "liquidaciones.ver" },
  { title: "Reportes", url: "/reportes", icon: BarChart3, perm: "reportes.ver" },
  { title: "Combustibles", url: "/combustibles", icon: Fuel, perm: "combustibles.ver" },
];

const catalogos: NavItem[] = [
  { title: "Camiones", url: "/camiones", icon: TruckIcon, perm: "catalogos.ver" },
  { title: "Mantenimiento", url: "/mantenimiento", icon: Wrench, perm: "catalogos.ver" },
  { title: "Operadores", url: "/operadores", icon: Users, perm: "catalogos.ver" },
  { title: "Clientes", url: "/clientes", icon: Building2, perm: "catalogos.ver" },
  { title: "Tipos de documento", url: "/tipos-documento", icon: FileText, perm: "catalogos.ver" },
];

const administracion: NavItem[] = [
  ...(FEATURE_CARTA_PORTE
    ? [{ title: "Empresa y fiscal", url: "/empresa", icon: Building2, perm: "fiscal.configurar" as Permission }]
    : []),
  { title: "Marca y tema", url: "/marca", icon: Palette, perm: "marca.gestionar" },
  { title: "Usuarios y permisos", url: "/usuarios", icon: ShieldCheck, perm: "usuarios.gestionar" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const nav = useNavigate();
  const { user, logout, hasPermission } = useAuth();

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground hover:bg-sidebar-accent/60"
    }`;

  const filterNav = (items: NavItem[]) => items.filter(it => !it.perm || hasPermission(it.perm));

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
              {filterNav(operacion).map(item => (
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

        {filterNav(catalogos).length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Catálogos</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterNav(catalogos).map(item => (
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
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Administración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterNav(administracion).map(item => (
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
          onClick={() => {
            logout();
            nav("/login");
          }}
          className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
