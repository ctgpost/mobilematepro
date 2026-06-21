import { useEffect } from "react";
import { toast } from "sonner";

const RELOAD_FLAG = "apple-store-pending-online-reload";

/**
 * Blocks page refresh while offline and triggers a single auto-reload
 * once connectivity returns.
 *
 * - F5 / Ctrl+R / Cmd+R: blocked via keydown
 * - Right-click menu: blocked via contextmenu
 * - Browser refresh button / tab close: beforeunload prompt
 * - Mobile pull-to-refresh: overscroll-behavior CSS lock
 */
export function useOfflineRefreshGuard() {
  useEffect(() => {
    // 1. Add overscroll lock for pull-to-refresh on mobile
    const styleEl = document.createElement("style");
    styleEl.id = "offline-overscroll-lock";
    styleEl.textContent = `
      html.offline-locked, html.offline-locked body {
        overscroll-behavior-y: contain !important;
        overflow-anchor: none;
        touch-action: pan-x pan-y;
      }
    `;
    document.head.appendChild(styleEl);

    const applyLock = () => {
      document.documentElement.classList.add("offline-locked");
    };
    const removeLock = () => {
      document.documentElement.classList.remove("offline-locked");
    };

    // 2. Keyboard: block F5, Ctrl+R, Cmd+R, Ctrl+Shift+R, Ctrl+F5
    const handleKeyDown = (e: KeyboardEvent) => {
      if (navigator.onLine) return;
      const key = e.key.toLowerCase();
      const isReload =
        key === "f5" ||
        ((e.ctrlKey || e.metaKey) && key === "r");
      if (isReload) {
        e.preventDefault();
        e.stopPropagation();
        toast.error("⚠️ অফলাইন মোড — ইন্টারনেট ছাড়া রিফ্রেশ করা যাবে না", {
          duration: 3000,
        });
      }
    };

    // 3. Right-click context menu (only when offline)
    const handleContextMenu = (e: MouseEvent) => {
      if (!navigator.onLine) {
        e.preventDefault();
        toast.error("⚠️ অফলাইন মোড — রিফ্রেশ অপশন উপলব্ধ নেই", {
          duration: 2500,
        });
      }
    };

    // 4. beforeunload to prompt confirm when offline (browser refresh button / tab close)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!navigator.onLine) {
        e.preventDefault();
        e.returnValue = "অফলাইন মোড — পেজ রিফ্রেশ করলে অসিঙ্ক ডাটা হারাতে পারেন";
        return e.returnValue;
      }
    };

    // 5. Auto-reload once when coming back online (if flag set)
    const handleOnline = () => {
      removeLock();
      const flag = sessionStorage.getItem(RELOAD_FLAG);
      if (flag === "1") {
        sessionStorage.removeItem(RELOAD_FLAG);
        toast.success("✅ ইন্টারনেট ফিরে এসেছে — সিঙ্ক করে রিফ্রেশ হচ্ছে...");
        // Give outbox sync ~3s, then reload
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }
    };

    const handleOffline = () => {
      applyLock();
      sessionStorage.setItem(RELOAD_FLAG, "1");
      toast.warning("📴 ইন্টারনেট নেই — রিফ্রেশ ব্লক করা হয়েছে। ডাটা অফলাইনে সংরক্ষিত হবে।", {
        duration: 5000,
      });
    };

    // Initialize state
    if (!navigator.onLine) {
      applyLock();
      sessionStorage.setItem(RELOAD_FLAG, "1");
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("contextmenu", handleContextMenu, { capture: true });
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true } as any);
      window.removeEventListener("contextmenu", handleContextMenu, { capture: true } as any);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      removeLock();
      styleEl.remove();
    };
  }, []);
}
