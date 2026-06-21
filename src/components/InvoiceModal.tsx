import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Button } from "@/components/ui/button";
import { useShopSettings, type PaperSize } from "@/hooks/useShopSettings";
import { BarcodeImage } from "./BarcodeImage";
import { Printer } from "lucide-react";

interface InvoiceModalProps {
  isOpen: boolean;
  sale: any;
  onClose: () => void;
}

export function InvoiceModal({ isOpen, sale, onClose }: InvoiceModalProps) {
  const { settings } = useShopSettings();
  const componentRef = useRef<HTMLDivElement>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>(settings.default_paper_size);
  useEffect(() => {
    setPaperSize(settings.default_paper_size);
  }, [settings.default_paper_size]);

  const pageStyle =
    paperSize === "a4"
      ? `@page { size: A4; margin: 12mm; }`
      : paperSize === "80mm"
      ? `@page { size: 80mm auto; margin: 2mm; }`
      : `@page { size: 58mm auto; margin: 2mm; }`;

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    pageStyle: `${pageStyle} body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
  });

  if (!isOpen || !sale) return null;

  const formatDate = (timestamp: string) =>
    new Date(timestamp).toLocaleString("bn-BD", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getPaymentMethodBn = (m: string) =>
    ({ cash: "নগদ", card: "কার্ড", mobile: "মোবাইল ব্যাংকিং" } as any)[m] || m;

  const invoiceNo = sale.id.slice(0, 8).toUpperCase();
  const isThermal = paperSize !== "a4";
  const isMini = paperSize === "58mm";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-foreground">ইনভয়েস</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="inline-flex rounded-md border overflow-hidden text-sm">
              {(["a4", "80mm", "58mm"] as PaperSize[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setPaperSize(s)}
                  className={`px-3 py-1.5 ${
                    paperSize === s ? "bg-primary text-primary-foreground" : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {s === "a4" ? "A4" : s.toUpperCase()}
                </button>
              ))}
            </div>
            <Button onClick={() => handlePrint()} size="sm">
              <Printer className="w-4 h-4 mr-1" /> প্রিন্ট
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              বন্ধ
            </Button>
          </div>
        </div>

        <div className="p-4 bg-gray-100">
          <div
            ref={componentRef}
            className="bg-white text-black mx-auto"
            style={
              isThermal
                ? {
                    width: isMini ? "58mm" : "80mm",
                    padding: "4mm",
                    fontFamily: "monospace, 'Courier New'",
                    fontSize: isMini ? "10px" : "11px",
                    lineHeight: 1.4,
                  }
                : { padding: "24px", maxWidth: "210mm" }
            }
          >
            {isThermal ? (
              <ThermalReceipt
                sale={sale}
                settings={settings}
                invoiceNo={invoiceNo}
                isMini={isMini}
                formatDate={formatDate}
                getPaymentMethodBn={getPaymentMethodBn}
              />
            ) : (
              <A4Invoice
                sale={sale}
                settings={settings}
                invoiceNo={invoiceNo}
                formatDate={formatDate}
                getPaymentMethodBn={getPaymentMethodBn}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const INVOICE_BRAND = "MOBILE MATE PRO";

function A4Invoice({ sale, settings, invoiceNo, formatDate, getPaymentMethodBn }: any) {
  return (
    <>
      <div className="text-center mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold mb-1">{INVOICE_BRAND}</h1>
        <p className="text-sm text-gray-600">{settings.shop_subtitle || "Sales & Stock Management System"}</p>
        {settings.shop_address && <p className="text-xs text-gray-600 mt-1">ঠিকানা: {settings.shop_address}</p>}
        {settings.shop_phone && <p className="text-xs text-gray-600">ফোন: {settings.shop_phone}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="flex items-start gap-3">
          {(sale.customers?.photo_url || sale.customer_photo_url) && (
            <img
              src={sale.customers?.photo_url || sale.customer_photo_url}
              alt="ক্রেতা"
              style={{ width: "60px", height: "72px", objectFit: "cover", borderRadius: "4px", border: "1px solid #ddd" }}
            />
          )}
          <div>
            <h3 className="font-semibold text-sm text-gray-600 mb-2">ক্রেতা:</h3>
            <p className="font-medium">{sale.customers?.name || sale.instant_customer_name || "সাধারণ ক্রেতা"}</p>
            {(sale.customers?.phone || sale.instant_customer_phone) && (
              <p className="text-sm">📞 {sale.customers?.phone || sale.instant_customer_phone}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm">
            <span className="font-semibold">ইনভয়েস #:</span> {invoiceNo}
          </p>
          <p className="text-sm">
            <span className="font-semibold">তারিখ:</span> {formatDate(sale.created_at)}
          </p>
          <p className="text-sm">
            <span className="font-semibold">পেমেন্ট:</span> {getPaymentMethodBn(sale.payment_method)}
          </p>
        </div>
      </div>

      <table className="w-full mb-6 text-sm">
        <thead>
          <tr className="border-b-2 border-gray-300">
            <th className="text-left py-2">পণ্য</th>
            <th className="text-center py-2">পরিমাণ</th>
            <th className="text-right py-2">মূল্য</th>
            <th className="text-right py-2">মোট</th>
          </tr>
        </thead>
        <tbody>
          {sale.sale_items?.map((item: any, i: number) => {
            const itemCode =
              item.products?.barcode || item.products?.sku || item.products?.imei || (item.product_id || "").slice(0, 12);
            return (
            <tr key={i} className="border-b">
              <td className="py-3">
                <p className="font-medium">{item.products?.name || "পণ্য"}</p>
                {item.products?.imei && <p className="text-xs text-gray-600">IMEI: {item.products.imei}</p>}
                {item.products?.brand && <p className="text-xs text-gray-600">ব্র্যান্ড: {item.products.brand}</p>}
                {settings.print_item_barcodes && itemCode && (
                  <div className="mt-1">
                    <BarcodeImage value={String(itemCode)} format={settings.barcode_format} height={28} fontSize={9} width={1.1} margin={0} />
                  </div>
                )}
              </td>
              <td className="text-center py-3">{item.quantity}</td>
              <td className="text-right py-3">৳{Number(item.unit_price).toLocaleString("bn-BD")}</td>
              <td className="text-right py-3 font-semibold">
                ৳{Number(item.total_price).toLocaleString("bn-BD")}
              </td>
            </tr>
          );})}
        </tbody>
      </table>

      <div className="flex justify-end mb-6">
        <div className="w-64">
          <div className="flex justify-between py-2 border-t">
            <span className="font-semibold">সাবটোটাল:</span>
            <span>৳{Number(sale.total_amount).toLocaleString("bn-BD")}</span>
          </div>
          {Number(sale.paid_amount) > 0 && (
            <div className="flex justify-between py-1">
              <span className="text-sm">প্রদত্ত:</span>
              <span className="text-sm">৳{Number(sale.paid_amount).toLocaleString("bn-BD")}</span>
            </div>
          )}
          {Number(sale.due_amount) > 0 && (
            <div className="flex justify-between py-1 text-red-600">
              <span className="text-sm font-semibold">বাকি:</span>
              <span className="text-sm font-semibold">৳{Number(sale.due_amount).toLocaleString("bn-BD")}</span>
            </div>
          )}
          <div className="flex justify-between py-2 border-t-2 border-gray-800">
            <span className="font-bold text-lg">সর্বমোট:</span>
            <span className="font-bold text-lg">৳{Number(sale.total_amount).toLocaleString("bn-BD")}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-center my-4">
        <BarcodeImage value={sale.id.slice(0, 16)} height={50} fontSize={11} />
      </div>

      <div className="text-center border-t pt-4 text-sm text-gray-600">
        <p>ধন্যবাদ আপনার ক্রয়ের জন্য!</p>
        <p className="mt-2">{INVOICE_BRAND}</p>
      </div>
    </>
  );
}

function ThermalReceipt({ sale, settings, invoiceNo, isMini, formatDate, getPaymentMethodBn }: any) {
  const dashed = "------------------------------";
  const shortDashed = "--------------------------";
  const sep = isMini ? shortDashed : dashed;
  return (
    <div style={{ color: "#000" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: isMini ? "13px" : "15px", fontWeight: 700 }}>{INVOICE_BRAND}</div>
        {settings.shop_subtitle && <div style={{ fontSize: isMini ? "9px" : "10px" }}>{settings.shop_subtitle}</div>}
        {settings.shop_address && <div style={{ fontSize: isMini ? "9px" : "10px" }}>{settings.shop_address}</div>}
        {settings.shop_phone && <div style={{ fontSize: isMini ? "9px" : "10px" }}>ফোন: {settings.shop_phone}</div>}
      </div>
      <div style={{ textAlign: "center", margin: "4px 0" }}>{sep}</div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>#{invoiceNo}</span>
        <span>{formatDate(sale.created_at)}</span>
      </div>
      <div>ক্রেতা: {sale.customers?.name || sale.instant_customer_name || "সাধারণ ক্রেতা"}</div>
      {(sale.customers?.phone || sale.instant_customer_phone) && (
        <div>ফোন: {sale.customers?.phone || sale.instant_customer_phone}</div>
      )}
      <div>পেমেন্ট: {getPaymentMethodBn(sale.payment_method)}</div>
      <div style={{ textAlign: "center", margin: "4px 0" }}>{sep}</div>

      <table style={{ width: "100%", fontSize: isMini ? "10px" : "11px", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>পণ্য</th>
            <th style={{ textAlign: "right" }}>মোট</th>
          </tr>
        </thead>
        <tbody>
          {sale.sale_items?.map((item: any, i: number) => {
            const itemCode =
              item.products?.barcode || item.products?.sku || item.products?.imei || (item.product_id || "").slice(0, 12);
            return (
            <tr key={i}>
              <td style={{ paddingTop: 3, paddingBottom: 3 }}>
                <div style={{ fontWeight: 600 }}>{item.products?.name || "পণ্য"}</div>
                <div style={{ fontSize: isMini ? "9px" : "10px" }}>
                  {item.quantity} x ৳{Number(item.unit_price).toLocaleString("bn-BD")}
                </div>
                {item.products?.imei && (
                  <div style={{ fontSize: "9px" }}>IMEI: {item.products.imei}</div>
                )}
                {settings.print_item_barcodes && itemCode && (
                  <div style={{ marginTop: 2 }}>
                    <BarcodeImage value={String(itemCode)} format={settings.barcode_format} height={isMini ? 22 : 26} fontSize={isMini ? 7 : 8} width={isMini ? 0.9 : 1} margin={0} />
                  </div>
                )}
              </td>
              <td style={{ textAlign: "right", verticalAlign: "top", paddingTop: 3 }}>
                ৳{Number(item.total_price).toLocaleString("bn-BD")}
              </td>
            </tr>
          );})}
        </tbody>
      </table>

      <div style={{ textAlign: "center", margin: "4px 0" }}>{sep}</div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>সাবটোটাল:</span>
        <span>৳{Number(sale.total_amount).toLocaleString("bn-BD")}</span>
      </div>
      {Number(sale.paid_amount) > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>প্রদত্ত:</span>
          <span>৳{Number(sale.paid_amount).toLocaleString("bn-BD")}</span>
        </div>
      )}
      {Number(sale.due_amount) > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>বাকি:</span>
          <span>৳{Number(sale.due_amount).toLocaleString("bn-BD")}</span>
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 700,
          fontSize: isMini ? "12px" : "13px",
          borderTop: "1px dashed #000",
          marginTop: 4,
          paddingTop: 4,
        }}
      >
        <span>সর্বমোট:</span>
        <span>৳{Number(sale.total_amount).toLocaleString("bn-BD")}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 4px" }}>
        <BarcodeImage
          value={sale.id.slice(0, 16)}
          height={isMini ? 30 : 40}
          fontSize={isMini ? 8 : 10}
          width={isMini ? 1 : 1.2}
          margin={2}
        />
      </div>

      <div style={{ textAlign: "center", fontSize: isMini ? "9px" : "10px", marginTop: 4 }}>
        <div>ধন্যবাদ আপনার ক্রয়ের জন্য!</div>
        <div style={{ marginTop: 2 }}>** {INVOICE_BRAND} **</div>
      </div>
    </div>
  );
}
