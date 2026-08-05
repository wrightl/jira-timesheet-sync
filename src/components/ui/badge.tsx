import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  ok: "bg-ok/10 text-ok",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  accent: "bg-accent/10 text-accent",
  muted: "bg-background text-muted",
} as const;

type BadgeVariant = keyof typeof variants;

export function Badge({
  className,
  variant = "muted",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
