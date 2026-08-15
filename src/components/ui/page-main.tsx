import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function PageMain({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <main className={cn("w-full flex-1 px-6 py-8", className)} {...props} />
  );
}
