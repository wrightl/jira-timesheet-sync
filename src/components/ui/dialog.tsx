"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 flex max-h-[min(32rem,calc(100vh-2rem))] w-full max-w-lg flex-col rounded-lg border border-border bg-card p-4 shadow-xl",
          className,
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <Button
            ref={closeRef}
            variant="ghost"
            className="h-8 shrink-0 px-2 text-sm"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto text-sm text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}
