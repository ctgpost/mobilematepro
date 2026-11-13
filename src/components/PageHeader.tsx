import { ReactNode, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  cornerControl?: ReactNode;
  /** Persists collapsed state across reloads. */
  storageKey?: string;
  /** When true, collapse only affects mobile; desktop always shows everything. */
  mobileOnly?: boolean;
  /** Extra blocks rendered below the title/actions. These remain scrollable page content. */
  children?: ReactNode;
  className?: string;
}

/**
 * Compact sticky page toolbar shared by top-level screens.
 * Only the title/subtitle/actions stay pinned; children remain in normal page flow.
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  cornerControl,
  storageKey,
  mobileOnly = true,
  children,
  className = "",
}: PageHeaderProps) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return true;
    try {
      const value = localStorage.getItem(`page-header:${storageKey}`);
      return value === null ? true : value === "1";
    } catch {
      return true;
    }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try {
        localStorage.setItem(`page-header:${storageKey}`, next ? "1" : "0");
      } catch {}
    }
  };

  return (
    <>
      <div
        className={`sticky top-16 lg:top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mb-3 border-b border-border/60 bg-background/95 px-4 py-2 sm:px-6 lg:px-8 backdrop-blur-xl ${className}`}
      >
        <div className="flex min-h-9 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {icon && <div className="shrink-0">{icon}</div>}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold leading-tight text-foreground sm:text-xl lg:text-2xl">
                {title}
              </h1>
              {subtitle && (
                <p
                  className={`mt-0.5 truncate text-xs leading-tight text-muted-foreground sm:text-sm ${
                    mobileOnly ? (open ? "block" : "hidden sm:block") : (open ? "block" : "hidden")
                  }`}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={toggle}
              aria-expanded={open}
              aria-label={open ? "Hide page details" : "Show page details"}
              className={`h-8 w-8 shrink-0 ${mobileOnly ? "sm:hidden" : ""}`}
            >
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            {cornerControl}
          </div>
        </div>
        {actions && (
          <div
            className={`mt-2 flex flex-wrap items-center gap-1.5 ${
              mobileOnly ? (open ? "flex" : "hidden sm:flex") : (open ? "flex" : "hidden")
            }`}
          >
            {actions}
          </div>
        )}
      </div>
      {children && (
        <div className={`mb-3 ${mobileOnly ? (open ? "block" : "hidden sm:block") : (open ? "block" : "hidden")}`}>
          {children}
        </div>
      )}
    </>
  );
}
