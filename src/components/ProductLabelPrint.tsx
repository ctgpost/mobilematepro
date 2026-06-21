import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarcodeImage } from "./BarcodeImage";
import { Printer } from "lucide-react";
import { useShopSettings } from "@/hooks/useShopSettings";

interface ProductLabelPrintProps {
  isOpen: boolean;
  onClose: () => void;
  product: any;
}

export function ProductLabelPrint({ isOpen, onClose, product }: ProductLabelPrintProps) {
  const { settings } = useShopSettings();
  const [quantity, setQuantity] = useState(4);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });

  if (!product) return null;

  const code = product.barcode || product.sku || product.imei || product.id.slice(0, 12);
  const labels = Array.from({ length: Math.max(1, Math.min(quantity, 100)) });

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>প্রোডাক্ট বারকোড লেবেল প্রিন্ট</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>কতগুলো লেবেল প্রিন্ট হবে?</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value) || 1)}
              />
            </div>
            <Button onClick={() => handlePrint()}>
              <Printer className="w-4 h-4 mr-2" /> প্রিন্ট
            </Button>
          </div>

          <div className="border rounded-lg p-4 bg-white text-black">
            <p className="text-xs text-muted-foreground mb-2">প্রিভিউ:</p>
            <div ref={printRef} className="print-labels">
              <style>{`
                @media print {
                  @page { size: A4; margin: 8mm; }
                  body { margin: 0; }
                }
                .print-labels {
                  display: grid;
                  grid-template-columns: repeat(3, 1fr);
                  gap: 6px;
                }
                .label-cell {
                  border: 1px dashed #999;
                  padding: 6px;
                  text-align: center;
                  page-break-inside: avoid;
                  background: #fff;
                  color: #000;
                }
                .label-cell .shop { font-size: 10px; font-weight: 700; margin-bottom: 2px; }
                .label-cell .pname { font-size: 11px; font-weight: 600; margin-bottom: 2px; line-height: 1.2; }
                .label-cell .price { font-size: 13px; font-weight: 700; margin-top: 2px; }
                .label-cell svg { width: 100% !important; height: auto !important; }
              `}</style>
              {labels.map((_, i) => (
                <div key={i} className="label-cell">
                  <div className="shop">{settings.shop_name}</div>
                  <div className="pname">{product.name}</div>
                  <BarcodeImage value={code} height={40} fontSize={10} width={1.2} margin={2} />
                  <div className="price">৳{Number(product.price).toLocaleString("bn-BD")}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
