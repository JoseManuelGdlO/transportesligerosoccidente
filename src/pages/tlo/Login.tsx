import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import logo from "@/assets/tlo-logo.jpeg";
import { ShieldCheck, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/tlo";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@tlo.mx");
  const [pw, setPw] = useState("demo1234");
  const [role, setRole] = useState<UserRole>("admin");

  if (user) return <Navigate to="/" replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email, role);
    nav("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 tlo-gradient-primary">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="rounded-xl bg-white p-3 tlo-shadow-lg">
            <img src={logo} alt="TLO" className="h-16 w-16 object-contain" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white tracking-tight">TLO</h1>
          <p className="text-sm text-white/70">Transportes Ligeros de Occidente</p>
        </div>
        <Card className="border-0 tlo-shadow-lg">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-1">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground mb-5">Acceso al sistema operativo TLO</p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="email">Correo electrónico</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="pw">Contraseña</Label>
                <Input id="pw" type="password" value={pw} onChange={e => setPw(e.target.value)} required />
              </div>
              <div>
                <Label className="mb-2 block">Rol de demostración</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("admin")}
                    className={cn(
                      "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm",
                      role === "admin" ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
                    )}
                  >
                    <ShieldCheck className="h-5 w-5 text-accent" />
                    <span className="font-medium">Administrador</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("capturista")}
                    className={cn(
                      "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm",
                      role === "capturista" ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
                    )}
                  >
                    <ClipboardList className="h-5 w-5 text-accent" />
                    <span className="font-medium">Capturista</span>
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary-glow">
                Entrar
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                Demo: cualquier credencial funciona
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}