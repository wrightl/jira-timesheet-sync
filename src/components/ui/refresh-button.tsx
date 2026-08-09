import type { SVGProps } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type IconProps = SVGProps<SVGSVGElement>;

export function IconRefresh({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={cn("h-4 w-4", className)}
      {...props}
    >
      <path
        d="M21 12a9 9 0 0 0-15.5-6.3M3 4v4h4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 12a9 9 0 0 0 15.5 6.3M21 20v-4h-4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Cloud-download style icon for invalidating remote list caches. */
export function IconReloadLists({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={cn("h-4 w-4", className)}
      {...props}
    >
      <path
        d="M12 3v12M8 11l4 4 4-4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type RefreshButtonProps = {
  pending?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  title?: string;
  "aria-label"?: string;
  icon?: "refresh" | "reload";
};

export function RefreshButton({
  pending = false,
  disabled = false,
  onClick,
  className,
  title = "Refresh",
  "aria-label": ariaLabel,
  icon = "refresh",
}: RefreshButtonProps) {
  const Icon = icon === "reload" ? IconReloadLists : IconRefresh;
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={disabled || pending}
      onClick={onClick}
      aria-label={ariaLabel ?? (pending ? "Refreshing" : title)}
      title={title}
      className={cn("w-10 px-0", className)}
    >
      <Icon className={cn(pending && "animate-spin")} />
    </Button>
  );
}
