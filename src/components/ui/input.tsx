import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Input({
  className,
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted",
        "hover:bg-background",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-card",
        className,
      )}
      {...props}
    />
  );
}
