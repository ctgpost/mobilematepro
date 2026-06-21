import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";

export function OfflineIndicator() {
  const { online, pendingCount, syncing, sync } = useOfflineSync();

  if (online && pendingCount === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-[100]",
        "flex items-center gap-2 px-4 py-2 rounded-full shadow-lg",
        "text-sm font-medium border backdrop-blur-md",
        online
          ? "bg-amber-500/90 text-white border-amber-600"
          : "bg-destructive/90 text-destructive-foreground border-destructive"
      )}
    >
      {online ? (
        <Cloud className="w-4 h-4" />
      ) : (
        <CloudOff className="w-4 h-4" />
      )}
      <span>
        {online
          ? `${pendingCount}টি পরিবর্তন সিঙ্ক হচ্ছে...`
          : pendingCount > 0
          ? `অফলাইন মোড — ${pendingCount}টি pending`
          : "অফলাইন মোড"}
      </span>
      {online && pendingCount > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-white hover:bg-white/20"
          onClick={sync}
          disabled={syncing}
        >
          <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
        </Button>
      )}
    </div>
  );
}
