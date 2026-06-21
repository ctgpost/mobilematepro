import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import defaultLogo from "@/assets/3926e988-d85b-4bf1-8f3e-71bdbe4a2e70.png";

export type PaperSize = "a4" | "80mm" | "58mm";

export interface ShopSettings {
  id: string;
  shop_name: string;
  shop_subtitle: string;
  shop_address: string;
  shop_phone: string;
  logo_url: string;
  favicon_url: string;
  default_paper_size: PaperSize;
  print_item_barcodes: boolean;
  barcode_format: string;
  cloudinary_cloud_name: string;
  cloudinary_upload_preset: string;
}

const DEFAULT_SETTINGS: ShopSettings = {
  id: "",
  shop_name: "MOBILE MATE PRO",
  shop_subtitle: "Sales & Stock Management System",
  shop_address: "Goli No-6, Shop No-13, New Market, Karanihat, Satkania, Chittagong",
  shop_phone: "",
  logo_url: "",
  favicon_url: "",
  default_paper_size: "80mm",
  print_item_barcodes: true,
  barcode_format: "CODE128",
  cloudinary_cloud_name: "",
  cloudinary_upload_preset: "",
};

export function useShopSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["shop-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Error fetching shop settings:", error);
        return DEFAULT_SETTINGS;
      }
      return (data as ShopSettings) || DEFAULT_SETTINGS;
    },
    staleTime: 1000 * 60 * 5,
  });

  const resolvedSettings = settings || DEFAULT_SETTINGS;
  const logoSrc = resolvedSettings.logo_url || defaultLogo;

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["shop-settings"] });

  return { settings: resolvedSettings, logoSrc, isLoading, refetch };
}
