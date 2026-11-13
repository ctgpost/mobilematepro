import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { drainOutbox } from "@/lib/offlineMutate";
import { getOutboxCount } from "@/lib/offlineDB";
import { toast } from "sonner";
import { useOnlineStatus } from "./useOnlineStatus";
import { supabase } from "@/integrations/supabase/client";

export function useOfflineSync() {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setPendingCount(session?.user?.id ? await getOutboxCount(session.user.id) : 0);
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

  // Periodic retry so a failed sync is retried automatically instead of
  // waiting for the next offline→online flip; queued data is never lost.
  useEffect(() => {
    if (!online) return;
    const interval = setInterval(() => {
      if (pendingCount > 0) sync();
    }, 30000);
    return () => clearInterval(interval);
  }, [online, pendingCount, sync]);

  return { online, pendingCount, syncing, sync };
}
