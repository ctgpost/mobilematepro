import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoZoomProps {
  url?: string | null;
  alt?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  fallbackInitials?: string;
}

const SIZE_MAP = {
  xs: "w-10 h-12",
  sm: "w-14 h-16",
  md: "w-20 h-24", // passport size ~ 35x45mm ratio
  lg: "w-28 h-32",
};

export function PhotoZoom({ url, alt = "ছবি", size = "md", className, fallbackInitials }: PhotoZoomProps) {
  const [open, setOpen] = useState(false);

  if (!url) {
    return (
      <div
        className={cn(
          SIZE_MAP[size],
          "rounded-md bg-muted flex items-center justify-center text-muted-foreground border border-border",
          className
        )}
      >
        {fallbackInitials ? (
          <span className="font-semibold text-sm">{fallbackInitials.slice(0, 2).toUpperCase()}</span>
        ) : (
          <User className="w-1/2 h-1/2 opacity-50" />
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          SIZE_MAP[size],
          "rounded-md overflow-hidden border border-border bg-muted shadow-sm hover:ring-2 hover:ring-primary transition cursor-zoom-in",
          className
        )}
        aria-label="ছবি বড় করে দেখুন"
      >
        <img src={url} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-2 bg-background">
          <img
            src={url}
            alt={alt}
            className="w-full h-auto max-h-[85vh] object-contain rounded-md"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
