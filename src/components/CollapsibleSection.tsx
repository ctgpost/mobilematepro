import { useState, ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CollapsibleSectionProps {
  title?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  storageKey?: string;
  hideLabel?: string;
  showLabel?: string;
}

/**
 * Reusable collapse/expand wrapper for page filters/search/category sections.
 * Works on both mobile and desktop. Persists state in localStorage if storageKey provided.
 */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  className = "",
  storageKey,
  hideLabel = "লুকান",
  showLabel = "ফিল্টার দেখান",
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const v = localStorage.getItem(`collapse:${storageKey}`);
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try { localStorage.setItem(`collapse:${storageKey}`, next ? "1" : "0"); } catch {}
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">{title}</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggle}
          className="shrink-0 gap-1 text-xs font-semibold"
          aria-expanded={open}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span className="hidden sm:inline">{open ? hideLabel : showLabel}</span>
        </Button>
      </div>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
