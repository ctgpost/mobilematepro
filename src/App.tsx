import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useOfflineRefreshGuard } from "@/hooks/useOfflineRefreshGuard";
import defaultLogo from "@/assets/mobile-mate-pro-logo.png";
import { LanguageProvider } from "@/components/LanguageProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days for offline persistence
      staleTime: 1000 * 30,
      retry: (failureCount, error: any) => {
        // Don't retry when offline; sync will handle it
        if (typeof navigator !== "undefined" && !navigator.onLine) return false;
        return failureCount < 2;
      },
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});

// IndexedDB-backed persister so cached data survives reloads & offline restarts
const idbStorage = {
  getItem: async (key: string) => (await get(key)) ?? null,
  setItem: async (key: string, value: string) => {
    await set(key, value);
  },
  removeItem: async (key: string) => {
    await del(key);
  },
};

const persister = createAsyncStoragePersister({
  storage: idbStorage,
  key: "mobile-mate-pro-rq-cache",
  throttleTime: 1000,
});

function OfflineGuardLayer() {
  useOfflineRefreshGuard();
  return null;
}

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Apply dynamic favicon from shop settings
  useEffect(() => {
    supabase
      .from("shop_settings")
      .select("favicon_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.favicon_url) {
          const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
          if (link) link.href = data.favicon_url;
        }
      });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-2xl mb-4 animate-pulse shadow-xl">
            <img src={defaultLogo} alt="MOBILE MATE PRO" className="w-28 h-28 animate-scale-in" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">MOBILE MATE PRO</h2>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        buster: "v1",
      }}
    >
      <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <OfflineGuardLayer />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<Index user={user} />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <OfflineIndicator />
        </BrowserRouter>
      </TooltipProvider>
      </LanguageProvider>
    </PersistQueryClientProvider>
  );
};

export default App;
