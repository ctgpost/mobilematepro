import { ReactNode, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** Persists collapsed state across reloads. */
  storageKey?: string;
  /** When true, collapse only affects mobile; desktop always shows everything. */
  mobileOnly?: boolean;
  /** Extra blocks rendered below (e.g. stats cards); also collapsed on mobile. */
  children?: ReactNode;
  className?: string;
}

/**
 * Sticky, mobile-friendly page header with collapsible subtitle + actions.
 * Use this on every top-level page so headings stay tidy on small screens.
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  storageKey,
  mobileOnly = true,
  children,
  className = "",
}: PageHeaderProps) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return true;
    try {
      const v = localStorage.getItem(`page-header:${storageKey}`);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try { localStorage.setItem(`page-header:${storageKey}`, next ? "1" : "0"); } catch {}
    }
  };

  return (
    <div
      className={`sticky top-0 z-10 bg-background/85 backdrop-blur-xl border-b border-border/60 pb-3 sm:pb-4 space-y-3 sm:space-y-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground leading-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p
                className={`text-xs sm:text-sm md:text-base text-muted-foreground mt-0.5 sm:mt-1 ${
                  mobileOnly ? (open ? "block" : "hidden sm:block") : (open ? "block" : "hidden")
                }`}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "Hide" : "Show"}
          className={`shrink-0 h-9 w-9 ${mobileOnly ? "sm:hidden" : ""}`}
        >
          {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </Button>
      </div>

      {actions && (
        <div
          className={`flex flex-wrap items-center gap-2 ${
            mobileOnly ? (open ? "flex" : "hidden sm:flex") : (open ? "flex" : "hidden")
          }`}
        >
          {actions}
        </div>
      )}

      {children && (
        <div
          className={`${
            mobileOnly ? (open ? "block" : "hidden sm:block") : (open ? "block" : "hidden")
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
