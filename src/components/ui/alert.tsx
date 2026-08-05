import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  info: "border-border bg-card text-foreground",
  error: "border-danger/30 bg-danger/5 text-danger",
  success: "border-ok/30 bg-ok/5 text-ok",
} as const;

type AlertVariant = keyof typeof variants;

export function Alert({
  className,
  variant = "info",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
