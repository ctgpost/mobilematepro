import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScanBarcode } from "lucide-react";
import { useShopSettings } from "@/hooks/useShopSettings";
import { PageHeader } from "@/components/PageHeader";

interface POSHeaderProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  imeiSearch: string;
  onImeiSearchChange: (value: string) => void;
  showOutOfStock: boolean;
  onShowOutOfStockChange: (checked: boolean) => void;
  onOpenScanner: () => void;
}

export function POSHeader({
  searchTerm,
  onSearchChange,
  imeiSearch,
  onImeiSearchChange,
  showOutOfStock,
  onShowOutOfStockChange,
  onOpenScanner,
}: POSHeaderProps) {
  const { settings, logoSrc } = useShopSettings();

  return (
    <PageHeader
      storageKey="pos"
      title="পয়েন্ট অব সেল"
      subtitle="বিক্রয় প্রক্রিয়া ও লেনদেন ব্যবস্থাপনা"
      icon={<img src={logoSrc} alt={settings.shop_name} className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 object-contain" />}
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="🔍 নাম, ব্র্যান্ড বা SKU দিয়ে খুঁজুন..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 min-w-0"
          />
          <Input
            placeholder="📱 IMEI..."
            value={imeiSearch}
            onChange={(e) => onImeiSearchChange(e.target.value)}
            className="w-28 sm:w-40"
          />
          <Button variant="outline" onClick={onOpenScanner} className="shrink-0">
            <ScanBarcode className="w-4 h-4 lg:mr-2" />
            <span className="hidden lg:inline">স্ক্যান</span>
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="showOutOfStockPOS"
            checked={showOutOfStock}
            onCheckedChange={(checked) => onShowOutOfStockChange(checked as boolean)}
          />
          <label
            htmlFor="showOutOfStockPOS"
            className="text-xs lg:text-sm font-medium leading-none cursor-pointer"
          >
            স্টক শেষ পণ্যগুলি দেখান (০ স্টক)
          </label>
        </div>
      </div>
    </PageHeader>
  );
}
