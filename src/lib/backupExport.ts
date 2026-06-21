import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "./fetchAll";

export type TableKey =
  | "products"
  | "sales"
  | "sale_items"
  | "customers"
  | "suppliers"
  | "categories"
  | "due_payments"
  | "returns"
  | "supplier_returns"
  | "customer_ledger_entries"
  | "investment_entries"
  | "investment_incomes"
  | "investment_sectors"
  | "activity_logs"
  | "shop_settings";

export const ALL_TABLES: { key: TableKey; label: string; dateField?: string }[] = [
  { key: "products", label: "প্রোডাক্ট", dateField: "created_at" },
  { key: "categories", label: "ক্যাটাগরি", dateField: "created_at" },
  { key: "suppliers", label: "সাপ্লায়ার", dateField: "created_at" },
  { key: "customers", label: "কাস্টমার", dateField: "created_at" },
  { key: "sales", label: "বিক্রয়", dateField: "created_at" },
  { key: "sale_items", label: "বিক্রয় আইটেম", dateField: "created_at" },
  { key: "due_payments", label: "বাকি আদায়", dateField: "created_at" },
  { key: "returns", label: "কাস্টমার রিটার্ন", dateField: "created_at" },
  { key: "supplier_returns", label: "সাপ্লায়ার রিটার্ন", dateField: "created_at" },
  { key: "customer_ledger_entries", label: "কাস্টমার লেজার", dateField: "entry_date" },
  { key: "investment_sectors", label: "ইনভেস্টমেন্ট সেক্টর", dateField: "created_at" },
  { key: "investment_entries", label: "ইনভেস্টমেন্ট এন্ট্রি", dateField: "entry_date" },
  { key: "investment_incomes", label: "ইনভেস্টমেন্ট আয়", dateField: "income_date" },
  { key: "activity_logs", label: "অ্যাক্টিভিটি লগ", dateField: "created_at" },
  { key: "shop_settings", label: "শপ সেটিংস" },
];

export interface BackupOptions {
  tables: TableKey[];
  dateFrom?: string | null;
  dateTo?: string | null;
}

const flatten = (obj: any): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = JSON.stringify(v);
    } else if (Array.isArray(v)) {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
};

async function fetchTable(
  key: TableKey,
  dateField: string | undefined,
  dateFrom?: string | null,
  dateTo?: string | null,
): Promise<any[]> {
  return fetchAll<any>(key, "*", (q) => {
    if (dateField && dateFrom) q = q.gte(dateField, dateFrom);
    if (dateField && dateTo) q = q.lte(dateField, dateTo + "T23:59:59");
    return q;
  });
}

function buildSummarySheet(data: Record<TableKey, any[]>) {
  const rows: any[] = [];
  rows.push({ Section: "📊 MOBILE MATE PRO — সম্পূর্ণ ব্যাকআপ", Value: "" });
  rows.push({ Section: "তৈরির সময়", Value: new Date().toLocaleString("bn-BD") });
  rows.push({ Section: "", Value: "" });
  rows.push({ Section: "টেবিল", Value: "মোট রেকর্ড" });
  for (const t of ALL_TABLES) {
    if (data[t.key]) rows.push({ Section: t.label, Value: data[t.key].length });
  }

  // Quick KPIs
  const sales = data.sales || [];
  const products = data.products || [];
  const totalRevenue = sales.reduce((s, x) => s + Number(x.total_amount || 0), 0);
  const totalDue = sales.reduce((s, x) => s + Number(x.due_amount || 0), 0);
  const totalStockValue = products.reduce(
    (s, p) => s + Number(p.cost || 0) * Number(p.stock_quantity || 0),
    0,
  );
  rows.push({ Section: "", Value: "" });
  const totalPaid = sales.reduce((s, x) => s + Number(x.paid_amount || 0), 0);
  const saleItems = data.sale_items || [];
  const productMap = new Map(products.map((p) => [p.id, p]));
  let totalCost = 0;
  for (const it of saleItems) {
    const p = productMap.get(it.product_id);
    if (p) totalCost += Number(p.cost || 0) * Number(it.quantity || 0);
  }
  const totalProfit = saleItems.reduce(
    (s, it) => s + Number(it.total_price || 0),
    0,
  ) - totalCost;
  rows.push({ Section: "💰 মোট বিক্রয় (৳)", Value: totalRevenue });
  rows.push({ Section: "✅ মোট আদায় (৳)", Value: totalPaid });
  rows.push({ Section: "💸 মোট বাকি (৳)", Value: totalDue });
  rows.push({ Section: "📈 মোট লাভ (৳)", Value: totalProfit });
  rows.push({ Section: "📦 স্টক মূল্য (৳)", Value: totalStockValue });
  return rows;
}

function buildReportSheets(data: Record<string, any[]>) {
  const sheets: { name: string; rows: any[] }[] = [];
  const sales = data.sales || [];
  const items = data.sale_items || [];
  const products = data.products || [];
  const customers = data.customers || [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Daily Sales
  const byDay = new Map<string, { revenue: number; due: number; count: number }>();
  for (const s of sales) {
    const d = (s.created_at || "").slice(0, 10);
    if (!d) continue;
    const cur = byDay.get(d) || { revenue: 0, due: 0, count: 0 };
    cur.revenue += Number(s.total_amount || 0);
    cur.due += Number(s.due_amount || 0);
    cur.count += 1;
    byDay.set(d, cur);
  }
  sheets.push({
    name: "📅 দৈনিক বিক্রয়",
    rows: Array.from(byDay.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, v]) => ({
        তারিখ: date,
        "বিক্রয় সংখ্যা": v.count,
        "মোট বিক্রয় (৳)": v.revenue,
        "বাকি (৳)": v.due,
      })),
  });

  // Top Products by qty/revenue/profit
  const byProd = new Map<string, { qty: number; revenue: number; profit: number; name: string }>();
  for (const it of items) {
    const p: any = productMap.get(it.product_id);
    const name = p?.name || "(unknown)";
    const cur = byProd.get(it.product_id) || { qty: 0, revenue: 0, profit: 0, name };
    const qty = Number(it.quantity || 0);
    const rev = Number(it.total_price || 0);
    const cost = Number(p?.cost || 0) * qty;
    cur.qty += qty;
    cur.revenue += rev;
    cur.profit += rev - cost;
    byProd.set(it.product_id, cur);
  }
  sheets.push({
    name: "🏆 শীর্ষ প্রোডাক্ট",
    rows: Array.from(byProd.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((v) => ({
        প্রোডাক্ট: v.name,
        "বিক্রি (পিস)": v.qty,
        "বিক্রয় (৳)": v.revenue,
        "লাভ (৳)": v.profit,
      })),
  });

  // Customer Dues
  const dueBy = new Map<string, number>();
  for (const s of sales) {
    const due = Number(s.due_amount || 0);
    if (due <= 0) continue;
    const key = s.customer_id || s.instant_customer_phone || s.instant_customer_name || "—";
    dueBy.set(key, (dueBy.get(key) || 0) + due);
  }
  const custMap = new Map(customers.map((c) => [c.id, c]));
  sheets.push({
    name: "💸 কাস্টমার বাকি",
    rows: Array.from(dueBy.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => {
        const c: any = custMap.get(k);
        return {
          কাস্টমার: c?.name || k,
          ফোন: c?.phone || "",
          "মোট বাকি (৳)": v,
        };
      }),
  });

  // Stock Status
  sheets.push({
    name: "📦 স্টক স্ট্যাটাস",
    rows: products
      .map((p: any) => ({
        নাম: p.name,
        ব্র্যান্ড: p.brand || "",
        IMEI: p.imei || "",
        স্টক: p.stock_quantity || 0,
        "ক্রয় মূল্য (৳)": p.cost || 0,
        "বিক্রয় মূল্য (৳)": p.price || 0,
        "স্টক মূল্য (৳)": Number(p.cost || 0) * Number(p.stock_quantity || 0),
      }))
      .sort((a, b) => (b["স্টক মূল্য (৳)"] as number) - (a["স্টক মূল্য (৳)"] as number)),
  });

  return sheets;
}

export async function generateFullBackup(opts: BackupOptions) {
  const data: Record<string, any[]> = {};
  for (const t of ALL_TABLES) {
    if (!opts.tables.includes(t.key)) continue;
    try {
      data[t.key] = await fetchTable(t.key, t.dateField, opts.dateFrom, opts.dateTo);
    } catch (e) {
      console.error(`fetch ${t.key} failed`, e);
      data[t.key] = [];
    }
  }

  // 1) Multi-sheet Excel
  const wb = XLSX.utils.book_new();
  const summary = buildSummarySheet(data as any);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "📊 সারাংশ");

  // Analytical report sheets
  for (const r of buildReportSheets(data)) {
    const ws = XLSX.utils.json_to_sheet(r.rows.length ? r.rows : [{ note: "কোন ডাটা নেই" }]);
    XLSX.utils.book_append_sheet(wb, ws, r.name.slice(0, 30));
  }

  for (const t of ALL_TABLES) {
    if (!data[t.key]) continue;
    const rows = (data[t.key] || []).map(flatten);
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "কোন ডাটা নেই" }]);
    XLSX.utils.book_append_sheet(wb, ws, t.label.slice(0, 30));
  }
  const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const xlsxBlob = new Blob([xlsxBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // 2) ZIP package: Excel + JSON-per-table + manifest
  const zip = new JSZip();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  zip.file(`apple-store-backup-${stamp}.xlsx`, xlsxBuffer);
  const jsonDir = zip.folder("json")!;
  for (const t of ALL_TABLES) {
    if (!data[t.key]) continue;
    jsonDir.file(`${t.key}.json`, JSON.stringify(data[t.key], null, 2));
  }
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        version: 1,
        app: "MOBILE MATE PRO",
        tables: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, v.length]),
        ),
        options: opts,
      },
      null,
      2,
    ),
  );
  const zipBlob = await zip.generateAsync({ type: "blob" });

  return {
    xlsxBlob,
    zipBlob,
    timestamp: stamp,
    counts: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v.length]),
    ) as Record<string, number>,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  saveAs(blob, filename);
}

/**
 * Upload a Blob to Cloudinary as a `raw` resource using a signed upload from
 * an edge function. Returns the secure_url (or null on failure).
 */
export async function uploadBackupToCloudinary(
  blob: Blob,
  filename: string,
): Promise<string | null> {
  try {
    // Get cloud_name from shop_settings (publicly readable for auth users)
    const { data: settings } = await supabase
      .from("shop_settings")
      .select("cloudinary_cloud_name")
      .limit(1)
      .maybeSingle();
    const cloudName = settings?.cloudinary_cloud_name;
    if (!cloudName) {
      console.warn("Cloudinary cloud_name not configured");
      return null;
    }

    // Ask the edge function to sign the upload
    const folder = "apple-store-backups";
    const publicId = filename.replace(/\.(zip|xlsx)$/i, "");
    const { data: signed, error } = await supabase.functions.invoke(
      "cloudinary-sign-upload",
      {
        body: { folder, public_id: publicId, resource_type: "raw" },
      },
    );
    if (error || !signed) {
      console.error("sign error", error);
      return null;
    }

    const form = new FormData();
    form.append("file", blob, filename);
    form.append("api_key", signed.api_key);
    form.append("timestamp", String(signed.timestamp));
    form.append("signature", signed.signature);
    form.append("folder", folder);
    form.append("public_id", publicId);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
      { method: "POST", body: form },
    );
    const j = await res.json();
    if (!res.ok) {
      console.error("Cloudinary upload failed:", j);
      return null;
    }
    return j.secure_url || null;
  } catch (e) {
    console.error("uploadBackupToCloudinary error", e);
    return null;
  }
}
