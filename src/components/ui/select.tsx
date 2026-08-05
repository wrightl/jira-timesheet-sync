import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const chevron = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20"><path stroke="#5b6b7c" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m6 8 4 4 4-4"/></svg>`,
)}")`;

export function Select({
  className,
  style,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full cursor-pointer appearance-none rounded-md border border-border bg-card bg-[length:1.25rem] bg-[right_0.65rem_center] bg-no-repeat py-0 pl-3 pr-9 text-left text-sm font-medium text-foreground shadow-sm transition-colors",
        "hover:bg-background",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-card",
        className,
      )}
      style={{ backgroundImage: chevron, ...style }}
      {...props}
    />
  );
}
