import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useShopSettings } from "@/hooks/useShopSettings";
import { Smartphone, Palette } from "lucide-react";

export function PWASettings() {
  const { settings, refetch } = useShopSettings();
  const [shortName, setShortName] = useState("");
  const [themeColor, setThemeColor] = useState("#1B5F74");
  const [bgColor, setBgColor] = useState("#1B5F74");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const s = settings as any;
    setShortName(s.pwa_short_name || "MOBILE MATE PRO");
    setThemeColor(s.pwa_theme_color || "#1B5F74");
    setBgColor(s.pwa_background_color || "#1B5F74");
  }, [settings]);

  // Apply theme-color live so the address bar / status bar updates without rebuild
  useEffect(() => {
    if (!themeColor) return;
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = themeColor;
  }, [themeColor]);

  const save = async () => {
    if (!settings?.id) {
      toast.error("সেটিংস লোড হয়নি");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("shop_settings")
      .update({
        pwa_short_name: shortName,
        pwa_theme_color: themeColor,
        pwa_background_color: bgColor,
      } as any)
      .eq("id", settings.id);
    setSaving(false);
    if (error) {
      toast.error("সেভ করতে সমস্যা হয়েছে: " + error.message);
      return;
    }
    toast.success("PWA সেটিংস সংরক্ষণ হয়েছে");
    refetch();
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">PWA অ্যাপ সেটিংস</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        মোবাইলে ইনস্টল করার পরে অ্যাপটি কীভাবে দেখাবে তা পরিচালনা করুন। থিম কালার তাৎক্ষণিকভাবে প্রযোজ্য
        হবে; ইনস্টলড অ্যাপের নাম পরবর্তী পাবলিশ / রিইনস্টলে আপডেট হবে।
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="pwa-short-name">অ্যাপ শর্ট নাম</Label>
          <Input
            id="pwa-short-name"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="MOBILE MATE PRO"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="pwa-theme-color" className="flex items-center gap-1">
            <Palette className="w-3 h-3" /> থিম কালার
          </Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="pwa-theme-color"
              type="color"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              className="w-16 h-10 p-1 cursor-pointer"
            />
            <Input
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              placeholder="#1B5F74"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="pwa-bg-color">ব্যাকগ্রাউন্ড কালার</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="pwa-bg-color"
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-16 h-10 p-1 cursor-pointer"
            />
            <Input
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              placeholder="#1B5F74"
            />
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
      </Button>
    </Card>
  );
}