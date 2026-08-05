import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-accent text-white hover:bg-accent-hover disabled:opacity-60",
  secondary:
    "border border-border bg-card text-foreground hover:bg-background disabled:opacity-60",
  danger:
    "bg-danger text-white hover:bg-danger/90 disabled:opacity-60",
  ghost:
    "text-muted hover:bg-background hover:text-foreground disabled:opacity-60",
} as const;

type ButtonVariant = keyof typeof variants;

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
