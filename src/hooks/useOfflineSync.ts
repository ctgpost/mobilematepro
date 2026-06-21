import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { drainOutbox } from "@/lib/offlineMutate";
import { getOutboxCount } from "@/lib/offlineDB";
import { toast } from "sonner";
import { useOnlineStatus } from "./useOnlineStatus";

export function useOfflineSync() {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    setPendingCount(await getOutboxCount());
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await drainOutbox();
      await refreshCount();
      if (result.processed > 0) {
        toast.success(`✅ ${result.processed}টি অফলাইন পরিবর্তন সিঙ্ক হয়েছে`);
        queryClient.invalidateQueries();
      }
      if (result.errors.length > 0) {
        toast.error(
          `${result.errors.length}টি সিঙ্ক ব্যর্থ: ${result.errors[0]}`
        );
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing, queryClient, refreshCount]);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 5000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  useEffect(() => {
    if (online) {
      sync();
    }
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  return { online, pendingCount, syncing, sync };
}
