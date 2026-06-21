import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useShopSettings, type PaperSize } from "@/hooks/useShopSettings";
import { BarcodeImage } from "./BarcodeImage";

export function PrinterSettings() {
  const { settings, refetch } = useShopSettings();
  const [paperSize, setPaperSize] = useState<PaperSize>(settings.default_paper_size);
  const [printItemBarcodes, setPrintItemBarcodes] = useState<boolean>(settings.print_item_barcodes);
  const [barcodeFormat, setBarcodeFormat] = useState<string>(settings.barcode_format || "CODE128");
  const [saving, setSaving] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPaperSize(settings.default_paper_size);
    setPrintItemBarcodes(settings.print_item_barcodes);
    setBarcodeFormat(settings.barcode_format || "CODE128");
  }, [settings.id]);

  const pageStyle =
    paperSize === "a4"
      ? `@page { size: A4; margin: 12mm; }`
      : paperSize === "80mm"
      ? `@page { size: 80mm auto; margin: 2mm; }`
      : `@page { size: 58mm auto; margin: 2mm; }`;

  const handleTestPrint = useReactToPrint({
    contentRef: printRef,
    pageStyle: `${pageStyle} body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
  });

  const handleSave = async () => {
    if (!settings.id) {
      toast.error("সেটিংস লোড হয়নি");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("shop_settings")
      .update({
        default_paper_size: paperSize,
        print_item_barcodes: printItemBarcodes,
        barcode_format: barcodeFormat,
      })
      .eq("id", settings.id);
    setSaving(false);
    if (error) {
      toast.error("সেভ করা যায়নি: " + error.message);
    } else {
      toast.success("প্রিন্টার সেটিংস সেভ হয়েছে");
      refetch();
    }
  };

  const isThermal = paperSize !== "a4";
  const isMini = paperSize === "58mm";

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <Printer className="w-5 h-5 text-accent" />
        <h2 className="text-xl font-bold">প্রিন্টার সেটিংস</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        ইনভয়েস ও লেবেল প্রিন্টিংয়ের ডিফল্ট কনফিগারেশন। থার্মাল প্রিন্টার (৮০mm/৫৮mm) ও A4 সাপোর্টেড।
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>ডিফল্ট পেপার সাইজ</Label>
          <Select value={paperSize} onValueChange={(v) => setPaperSize(v as PaperSize)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="a4">A4 (২১০mm)</SelectItem>
              <SelectItem value="80mm">80mm থার্মাল (৩-ইঞ্চি)</SelectItem>
              <SelectItem value="58mm">58mm থার্মাল (২-ইঞ্চি)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>বারকোড ফরম্যাট</Label>
          <Select value={barcodeFormat} onValueChange={setBarcodeFormat}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CODE128">CODE128 (সাধারণ)</SelectItem>
              <SelectItem value="CODE39">CODE39</SelectItem>
              <SelectItem value="EAN13">EAN13</SelectItem>
              <SelectItem value="UPC">UPC</SelectItem>
              <SelectItem value="ITF14">ITF14</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
          <div>
            <Label className="text-base">ইনভয়েসে প্রতিটি আইটেমের বারকোড প্রিন্ট করুন</Label>
            <p className="text-xs text-muted-foreground mt-1">
              সক্রিয় থাকলে ইনভয়েসের প্রতিটি পণ্যের নিচে বারকোড দেখাবে - স্ক্যান করে দ্রুত আইটেম খুঁজে পাবেন।
            </p>
          </div>
          <Switch checked={printItemBarcodes} onCheckedChange={setPrintItemBarcodes} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" /> {saving ? "সেভ হচ্ছে..." : "সেভ করুন"}
        </Button>
        <Button variant="outline" onClick={() => handleTestPrint()}>
          <Printer className="w-4 h-4 mr-2" /> টেস্ট প্রিন্ট
        </Button>
      </div>

      {/* Hidden test print template */}
      <div className="border rounded-lg p-3 bg-muted/30">
        <p className="text-xs text-muted-foreground mb-2">টেস্ট প্রিন্টের প্রিভিউ ({paperSize.toUpperCase()}):</p>
        <div className="bg-white text-black rounded inline-block max-w-full" style={{ overflow: "auto" }}>
          <div
            ref={printRef}
            style={
              isThermal
                ? {
                    width: isMini ? "58mm" : "80mm",
                    padding: "4mm",
                    fontFamily: "monospace, 'Courier New'",
                    fontSize: isMini ? "10px" : "11px",
                    lineHeight: 1.4,
                    color: "#000",
                  }
                : { padding: "16px", maxWidth: "210mm", color: "#000" }
            }
          >
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: isThermal ? (isMini ? "13px" : "15px") : "20px" }}>
              {settings.shop_name}
            </div>
            {settings.shop_address && (
              <div style={{ textAlign: "center", fontSize: isThermal ? (isMini ? "9px" : "10px") : "12px" }}>
                {settings.shop_address}
              </div>
            )}
            <div style={{ textAlign: "center", margin: "6px 0" }}>
              {isThermal ? "------------------------------" : "—————————————————"}
            </div>
            <div style={{ textAlign: "center", fontWeight: 600 }}>** টেস্ট প্রিন্ট **</div>
            <div style={{ marginTop: 6 }}>তারিখ: {new Date().toLocaleString("bn-BD")}</div>
            <div>পেপার: {paperSize.toUpperCase()}</div>
            <div>বারকোড ফরম্যাট: {barcodeFormat}</div>
            <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
              <BarcodeImage value="TEST123456" format={barcodeFormat} height={isThermal ? (isMini ? 30 : 40) : 50} />
            </div>
            <div style={{ textAlign: "center", fontSize: isThermal ? (isMini ? "9px" : "10px") : "12px" }}>
              যদি বারকোড ও লেখা স্পষ্ট দেখা যায়, প্রিন্টার সঠিকভাবে কনফিগার করা আছে।
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
