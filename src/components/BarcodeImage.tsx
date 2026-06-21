import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeImageProps {
  value: string;
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
  className?: string;
}

export function BarcodeImage({
  value,
  format = "CODE128",
  width = 1.6,
  height = 50,
  displayValue = true,
  fontSize = 12,
  margin = 4,
  className,
}: BarcodeImageProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format,
          width,
          height,
          displayValue,
          fontSize,
          margin,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch (e) {
        console.error("Barcode error:", e);
      }
    }
  }, [value, format, width, height, displayValue, fontSize, margin]);

  return <svg ref={ref} className={className} />;
}
