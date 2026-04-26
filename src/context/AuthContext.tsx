import { createContext, useContext, useState, ReactNode } from "react";
import type { UserRole } from "@/types/tlo";

interface MockUser {
  email: string;
  role: UserRole;
  name: string;
}

interface AuthState {
  user: MockUser | null;
  login: (email: string, role: UserRole) => void;
  logout: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<MockUser | null>(() => {
    const raw = sessionStorage.getItem("tlo_demo_user");
    return raw ? JSON.parse(raw) : null;
  });

  const login = (email: string, role: UserRole) => {
    const u: MockUser = {
      email,
      role,
      name: role === "admin" ? "Administrador TLO" : "Capturista TLO",
    };
    sessionStorage.setItem("tlo_demo_user", JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    sessionStorage.removeItem("tlo_demo_user");
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return v;
};