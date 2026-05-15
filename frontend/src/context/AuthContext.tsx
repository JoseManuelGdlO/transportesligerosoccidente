import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UserRole, Permission, Tenant } from "@/types/tlo";
import { FULL_ADMIN_PERMISSIONS } from "@/types/tlo";
import { apiFetch, getStoredToken, getStoredRefreshToken, hasApiConfigured, clearAuthTokens, setStoredToken, setStoredRefreshToken, tryRestoreSessionFromRefresh } from "@/lib/api";
import { applyTenantThemeCss } from "@/lib/theme";

const DEMO_USER_KEY = "tlo_demo_user";

export interface SessionUser {
  id?: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthState {
  user: SessionUser | null;
  tenant: Tenant | null;
  permissions: Permission[];
  /** Hay JWT en sessionStorage (sesión real contra el API). */
  hasApiSession: boolean;
  /** Sesión contra API (JWT). */
  apiMode: boolean;
  bootstrapping: boolean;
  signInWithApi: (email: string, password: string) => Promise<void>;
  signInDemo: (email: string, role: UserRole) => void;
  logout: () => void;
  hasPermission: (p: Permission) => boolean;
  refreshTenant: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

function parseTenant(raw: Record<string, unknown>): Tenant {
  return {
    id: String(raw.id),
    slug: String(raw.slug),
    nombre: String(raw.nombre),
    estatus: raw.estatus === "suspendido" ? "suspendido" : "activo",
    logo_url: raw.logo_url != null ? String(raw.logo_url) : undefined,
    color_primary: raw.color_primary != null ? String(raw.color_primary) : undefined,
    color_accent: raw.color_accent != null ? String(raw.color_accent) : undefined,
    color_sidebar: raw.color_sidebar != null ? String(raw.color_sidebar) : undefined,
  };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const apiMode = hasApiConfigured();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [bootstrapping, setBootstrapping] = useState(apiMode);

  const logout = useCallback(() => {
    clearAuthTokens();
    sessionStorage.removeItem(DEMO_USER_KEY);
    setUser(null);
    setTenant(null);
    setPermissions([]);
    applyTenantThemeCss(null);
  }, []);

  const hydrateFromMe = useCallback(async () => {
    const res = await apiFetch("/auth/me");
    if (!res.ok) {
      logout();
      return;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const t = data.tenant && typeof data.tenant === "object" ? parseTenant(data.tenant as Record<string, unknown>) : null;
    setTenant(t);
    applyTenantThemeCss(t);
    setUser({
      id: String(data.id ?? ""),
      email: String(data.email ?? ""),
      name: String(data.nombre ?? ""),
      role: (data.role === "capturista" ? "capturista" : "admin") as UserRole,
    });
    const perms = Array.isArray(data.permissions) ? (data.permissions as string[]) : [];
    setPermissions(perms.filter((p): p is Permission => typeof p === "string"));
  }, [logout]);

  useEffect(() => {
    if (!apiMode) {
      const raw = sessionStorage.getItem(DEMO_USER_KEY);
      if (raw) {
        try {
          const d = JSON.parse(raw) as { email: string; role: UserRole; name: string };
          setUser({ email: d.email, role: d.role, name: d.name });
          const demoTenant: Tenant = {
            id: "demo",
            slug: "tlo",
            nombre: "TLO",
            estatus: "activo",
          };
          setTenant(demoTenant);
          const rolePerms =
            d.role === "admin"
              ? FULL_ADMIN_PERMISSIONS
              : (["viajes.ver", "viajes.crear", "viajes.cerrar", "liquidaciones.ver", "catalogos.ver", "reportes.ver"] as Permission[]);
          setPermissions(rolePerms);
          applyTenantThemeCss(null);
        } catch {
          sessionStorage.removeItem(DEMO_USER_KEY);
        }
      }
      setBootstrapping(false);
      return;
    }

    const token = getStoredToken();
    const refresh = getStoredRefreshToken();
    if (!token && !refresh) {
      setBootstrapping(false);
      return;
    }

    (async () => {
      try {
        if (!token && refresh) {
          const ok = await tryRestoreSessionFromRefresh();
          if (!ok) {
            logout();
            return;
          }
        }
        await hydrateFromMe();
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [apiMode, hydrateFromMe]);

  const signInWithApi = useCallback(async (email: string, password: string) => {
    clearAuthTokens();
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      headers: { "Content-Type": "application/json" },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = typeof body.error === "string" ? body.error : "No se pudo iniciar sesión";
      throw new Error(err);
    }
    const token = body.token as string | undefined;
    if (!token) throw new Error("Respuesta inválida del servidor");
    setStoredToken(token);
    const rt = body.refresh_token;
    if (typeof rt === "string" && rt.length > 0) setStoredRefreshToken(rt);
    const t = body.tenant && typeof body.tenant === "object" ? parseTenant(body.tenant as Record<string, unknown>) : null;
    const u = body.user && typeof body.user === "object" ? (body.user as Record<string, unknown>) : null;
    const perms = u && Array.isArray(u.permissions) ? (u.permissions as string[]) : [];
    setTenant(t);
    applyTenantThemeCss(t);
    setUser(
      u
        ? {
            id: String(u.id ?? ""),
            email: String(u.email ?? ""),
            name: String(u.nombre ?? ""),
            role: (u.role === "capturista" ? "capturista" : "admin") as UserRole,
          }
        : { email, name: email, role: "admin" },
    );
    setPermissions(perms.filter((p): p is Permission => typeof p === "string"));
  }, []);

  const signInDemo = useCallback((email: string, role: UserRole) => {
    const u: SessionUser = {
      email,
      role,
      name: role === "admin" ? "Administrador TLO" : "Capturista TLO",
    };
    sessionStorage.setItem(DEMO_USER_KEY, JSON.stringify(u));
    setUser(u);
    const demoTenant: Tenant = { id: "demo", slug: "tlo", nombre: "TLO", estatus: "activo" };
    setTenant(demoTenant);
    const rolePerms =
      role === "admin"
        ? FULL_ADMIN_PERMISSIONS
        : (["viajes.ver", "viajes.crear", "viajes.cerrar", "liquidaciones.ver", "catalogos.ver", "reportes.ver"] as Permission[]);
    setPermissions(rolePerms);
    applyTenantThemeCss(null);
  }, []);

  const hasPermission = useCallback(
    (p: Permission) => {
      return permissions.includes(p);
    },
    [permissions],
  );

  const refreshTenant = useCallback(async () => {
    if (!apiMode || (!getStoredToken() && !getStoredRefreshToken())) return;
    const res = await apiFetch("/tenant");
    if (!res.ok) return;
    const data = (await res.json()) as Record<string, unknown>;
    const t = parseTenant(data);
    setTenant(t);
    applyTenantThemeCss(t);
  }, [apiMode]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      tenant,
      permissions,
      hasApiSession: apiMode && (!!getStoredToken() || !!getStoredRefreshToken()),
      apiMode,
      bootstrapping,
      signInWithApi,
      signInDemo,
      logout,
      hasPermission,
      refreshTenant,
    }),
    [user, tenant, permissions, apiMode, bootstrapping, signInWithApi, signInDemo, logout, hasPermission, refreshTenant],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return v;
};
