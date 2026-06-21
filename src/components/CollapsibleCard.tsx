import { ReactNode, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Props {
  title: ReactNode;
  actions?: ReactNode;
  storageKey?: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

/** Card with a collapsible body. Title row stays visible; body toggles. */
export function CollapsibleCard({
  title,
  actions,
  storageKey,
  defaultOpen = true,
  className = "",
  children,
}: Props) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const v = localStorage.getItem(`collapse-card:${storageKey}`);
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try { localStorage.setItem(`collapse-card:${storageKey}`, next ? "1" : "0"); } catch {}
    }
  };

  return (
    <Card className={`p-4 sm:p-6 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">{title}</div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-expanded={open}
            aria-label={open ? "Collapse" : "Expand"}
            className="h-9 w-9"
          >
            {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </Button>
        </div>
      </div>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-[8000px] opacity-100 mt-4 sm:mt-6" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </Card>
  );
}
