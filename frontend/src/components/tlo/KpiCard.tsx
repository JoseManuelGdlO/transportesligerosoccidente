import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  labelClassName?: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "destructive" | "warning" | "accent";
}

const toneStyles: Record<string, string> = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-success/15 text-success",
  destructive: "bg-destructive/15 text-destructive",
  warning: "bg-warning/20 text-warning-foreground",
  accent: "bg-accent/15 text-accent",
};

export const KpiCard = ({ label, labelClassName, value, hint, icon: Icon, tone = "default" }: KpiCardProps) => (
  <Card className="tlo-shadow-md min-w-0 border-border/60">
    <CardContent className="relative p-4">
      <div className="min-w-0">
        <div className="min-w-0">
          <p
            className={cn(
              "min-h-8 pr-11 text-xs font-medium uppercase leading-tight tracking-wider text-muted-foreground",
              labelClassName,
            )}
          >
            {label}
          </p>
          <p className="mt-1.5 whitespace-nowrap text-xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn("absolute right-4 top-4 rounded-lg p-2", toneStyles[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);