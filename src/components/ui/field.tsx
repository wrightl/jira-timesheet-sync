import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/label";

export function Field({
  label,
  htmlFor,
  className,
  children,
  ...props
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-3", className)} {...props}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
