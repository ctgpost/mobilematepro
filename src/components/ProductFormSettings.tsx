import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const SUPPLIER_PHOTO_FLAG_KEY = "products:show_instant_supplier_photo";

export function ProductFormSettings() {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(SUPPLIER_PHOTO_FLAG_KEY) === "1");
    } catch {}
  }, []);

  const toggle = (val: boolean) => {
    setEnabled(val);
    try { localStorage.setItem(SUPPLIER_PHOTO_FLAG_KEY, val ? "1" : "0"); } catch {}
    window.dispatchEvent(new Event("instant-supplier-photo-toggle"));
    toast.success(val ? "ইন্সট্যান্ট সাপ্লায়ার ছবি ফিল্ড চালু" : "ইন্সট্যান্ট সাপ্লায়ার ছবি ফিল্ড বন্ধ");
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4 text-foreground">📷 প্রোডাক্ট ফর্ম সেটিংস</h2>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="font-medium text-foreground">ইন্সট্যান্ট সাপ্লায়ারের ছবি ফিল্ড</p>
          <p className="text-xs text-muted-foreground mt-1">
            চালু করলে <b>Add New Product</b> পেজে "ইন্সট্যান্ট" সাপ্লায়ার মোডে ছবি আপলোড করার অপশন দেখা যাবে।
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} />
      </div>
    </Card>
  );
}
