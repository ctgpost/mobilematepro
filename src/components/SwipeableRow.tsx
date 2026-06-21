import { ReactNode, useRef, useState, useEffect, useCallback } from "react";
import { LucideIcon, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the action background. */
  color?: string;
  onAction: () => void;
}

interface SwipeableRowProps {
  /** Up to 3 actions revealed when swiping LEFT (action panel slides in from the right). */
  rightActions?: SwipeAction[];
  /** Up to 3 actions revealed when swiping RIGHT (action panel slides in from the left). */
  leftActions?: SwipeAction[];
  children: ReactNode;
  /** Height in px per action button (default 64). */
  actionWidth?: number;
  className?: string;
  /** Show an always-visible 3-dot menu button as fallback (default true). */
  showActionsButton?: boolean;
}

/**
 * iOS-style swipeable row. Drag horizontally to reveal up to 3 actions on each side.
 * Tap the revealed action to fire it; tap anywhere else to close.
 */
export function SwipeableRow({
  rightActions = [],
  leftActions = [],
  children,
  actionWidth = 72,
  className = "",
  showActionsButton = true,
}: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const rightWidth = rightActions.length * actionWidth;
  const leftWidth = leftActions.length * actionWidth;

  const close = useCallback(() => setOffset(0), []);

  // Close when tapping outside
  useEffect(() => {
    if (offset === 0) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [offset, close]);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startOffset.current = offset;
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX.current;
    let next = startOffset.current + dx;
    // Clamp
    if (next < -rightWidth) next = -rightWidth - (next + rightWidth) * 0.2;
    if (next > leftWidth) next = leftWidth + (next - leftWidth) * 0.2;
    setOffset(next);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    // Snap
    if (offset < -rightWidth / 2 && rightActions.length > 0) setOffset(-rightWidth);
    else if (offset > leftWidth / 2 && leftActions.length > 0) setOffset(leftWidth);
    else setOffset(0);
  };

  const fireAction = (action: SwipeAction) => {
    action.onAction();
    close();
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden select-none ${className}`}
      style={{ touchAction: "pan-y" }}
    >
      {/* Right-side actions (revealed on swipe left) */}
      {rightActions.length > 0 && (
        <div
          className="absolute inset-y-0 right-0 flex"
          style={{ width: rightWidth }}
          aria-hidden={offset >= 0}
        >
          {rightActions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => fireAction(a)}
                className={`flex flex-col items-center justify-center text-xs font-semibold text-white gap-1 ${
                  a.color || "bg-destructive"
                }`}
                style={{ width: actionWidth }}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] leading-tight">{a.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Left-side actions (revealed on swipe right) */}
      {leftActions.length > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex"
          style={{ width: leftWidth }}
          aria-hidden={offset <= 0}
        >
          {leftActions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => fireAction(a)}
                className={`flex flex-col items-center justify-center text-xs font-semibold text-white gap-1 ${
                  a.color || "bg-primary"
                }`}
                style={{ width: actionWidth }}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] leading-tight">{a.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Foreground content */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative bg-card"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 200ms ease-out",
        }}
      >
        {children}
        {showActionsButton && (leftActions.length > 0 || rightActions.length > 0) && (
          <div className="absolute top-2 right-2 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="অ্যাকশন মেনু"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur border border-border shadow-sm hover:bg-accent"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {leftActions.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs">যোগাযোগ</DropdownMenuLabel>
                    {leftActions.map((a, i) => {
                      const Icon = a.icon;
                      return (
                        <DropdownMenuItem key={`l-${i}`} onSelect={() => a.onAction()}>
                          <Icon className="h-4 w-4 mr-2" /> {a.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
                {leftActions.length > 0 && rightActions.length > 0 && <DropdownMenuSeparator />}
                {rightActions.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs">পরিচালনা</DropdownMenuLabel>
                    {rightActions.map((a, i) => {
                      const Icon = a.icon;
                      return (
                        <DropdownMenuItem key={`r-${i}`} onSelect={() => a.onAction()}>
                          <Icon className="h-4 w-4 mr-2" /> {a.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
}

/** Helper: open native dialer / mailto / SMS link. */
export const swipeIntents = {
  call: (phone?: string | null) => {
    if (!phone) return;
    window.location.href = `tel:${phone.replace(/\s+/g, "")}`;
  },
  sms: (phone?: string | null, body?: string) => {
    if (!phone) return;
    const q = body ? `?body=${encodeURIComponent(body)}` : "";
    window.location.href = `sms:${phone.replace(/\s+/g, "")}${q}`;
  },
  email: (email?: string | null, subject?: string) => {
    if (!email) return;
    const q = subject ? `?subject=${encodeURIComponent(subject)}` : "";
    window.location.href = `mailto:${email}${q}`;
  },
  share: async (data: { title?: string; text?: string; url?: string }) => {
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {
        /* user cancelled */
      }
    } else if (data.text || data.url) {
      try {
        await navigator.clipboard.writeText(`${data.text || ""} ${data.url || ""}`.trim());
      } catch {}
    }
  },
};
