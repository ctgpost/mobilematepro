import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
  TestTube,
  Copy,
} from "lucide-react";
import { clearCloudinaryCache, uploadToCloudinary } from "@/lib/cloudinary";

export function CloudinarySettings() {
  const qc = useQueryClient();
  const [cloudName, setCloudName] = useState("");
  const [uploadPreset, setUploadPreset] = useState("");
  const [showPreset, setShowPreset] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "fail">("idle");
  const [testMsg, setTestMsg] = useState<string>("");

  const { data: settings } = useQuery({
    queryKey: ["shop-settings-cloudinary"],
    queryFn: async () => {
      const { data } = await supabase.from("shop_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setCloudName((settings as any).cloudinary_cloud_name || "");
      setUploadPreset((settings as any).cloudinary_upload_preset || "");
    }
  }, [settings]);

  const isConfigured = !!(cloudName.trim() && uploadPreset.trim());
  const isSaved =
    !!((settings as any)?.cloudinary_cloud_name) &&
    !!((settings as any)?.cloudinary_upload_preset);

  const save = useMutation({
    mutationFn: async () => {
      if (!settings) throw new Error("Shop settings পাওয়া যায়নি");
      if (!cloudName.trim() || !uploadPreset.trim()) {
        throw new Error("Cloud Name ও Upload Preset দুটোই দিতে হবে");
      }
      const { error } = await supabase
        .from("shop_settings")
        .update({
          cloudinary_cloud_name: cloudName.trim(),
          cloudinary_upload_preset: uploadPreset.trim(),
        } as any)
        .eq("id", (settings as any).id);
      if (error) throw error;
    },
    onSuccess: () => {
      clearCloudinaryCache();
      qc.invalidateQueries({ queryKey: ["shop-settings"] });
      qc.invalidateQueries({ queryKey: ["shop-settings-cloudinary"] });
      toast.success("Cloudinary সেটিংস সেভ হয়েছে");
      setTestResult("idle");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      if (!settings) throw new Error("Shop settings পাওয়া যায়নি");
      const { error } = await supabase
        .from("shop_settings")
        .update({
          cloudinary_cloud_name: "",
          cloudinary_upload_preset: "",
        } as any)
        .eq("id", (settings as any).id);
      if (error) throw error;
    },
    onSuccess: () => {
      clearCloudinaryCache();
      setCloudName("");
      setUploadPreset("");
      setTestResult("idle");
      qc.invalidateQueries({ queryKey: ["shop-settings"] });
      qc.invalidateQueries({ queryKey: ["shop-settings-cloudinary"] });
      toast.success("Cloudinary credentials মুছে ফেলা হয়েছে");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleTest = async () => {
    if (!cloudName.trim() || !uploadPreset.trim()) {
      toast.error("আগে Cloud Name ও Upload Preset দিন");
      return;
    }
    setTesting(true);
    setTestResult("idle");
    setTestMsg("");
    try {
      // 1×1 PNG (transparent) base64 → blob → File
      const b64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], "cloudinary-test.png", { type: "image/png" });

      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", uploadPreset.trim());
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName.trim()}/image/upload`,
        { method: "POST", body: form }
      );
      const json = await res.json();
      if (!res.ok || !json.secure_url) {
        throw new Error(json?.error?.message || "আপলোড ব্যর্থ");
      }
      setTestResult("success");
      setTestMsg(`টেস্ট আপলোড সফল ✓  ${json.secure_url}`);
      toast.success("Cloudinary সংযোগ সফল!");
    } catch (e: any) {
      setTestResult("fail");
      const msg = e?.message || "Unknown error";
      setTestMsg(msg);
      toast.error("টেস্ট ব্যর্থ: " + msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Cloudinary ছবি আপলোড</h2>
        </div>
        {isSaved ? (
          <Badge className="bg-green-600 hover:bg-green-600">
            <CheckCircle2 className="w-3 h-3 mr-1" /> কনফিগার্ড
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" /> কনফিগার্ড নয়
          </Badge>
        )}
      </div>

      {/* Step-by-step guide */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-2">
        <p className="font-semibold">📘 কিভাবে credentials পাবেন:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>
            <a
              href="https://cloudinary.com/users/register/free"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              Cloudinary তে ফ্রি একাউন্ট করুন <ExternalLink className="w-3 h-3" />
            </a>
          </li>
          <li>Dashboard থেকে <b>Cloud Name</b> কপি করুন (যেমন: <code>dxxxxxxxx</code>)</li>
          <li>
            <a
              href="https://console.cloudinary.com/settings/upload"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              Settings → Upload <ExternalLink className="w-3 h-3" />
            </a>{" "}
            → <b>Add upload preset</b>
          </li>
          <li>
            Signing Mode = <b className="text-foreground">Unsigned</b> দিন → Preset name (যেমন{" "}
            <code>customer_photos</code>) কপি করে নিচে বসান → Save
          </li>
          <li>নিচে <b>সেভ</b> করে <b>টেস্ট</b> বাটনে ক্লিক করে যাচাই করুন</li>
        </ol>
      </div>

      {/* Credentials form */}
      <div className="space-y-3">
        <div>
          <Label className="flex items-center justify-between">
            <span>Cloud Name</span>
            {cloudName && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(cloudName);
                  toast.success("কপি হয়েছে");
                }}
                className="text-xs text-primary inline-flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> কপি
              </button>
            )}
          </Label>
          <Input
            value={cloudName}
            onChange={(e) => setCloudName(e.target.value)}
            placeholder="যেমন: dxxxxxxxx"
            autoComplete="off"
          />
        </div>
        <div>
          <Label className="flex items-center justify-between">
            <span>Upload Preset (Unsigned)</span>
            <button
              type="button"
              onClick={() => setShowPreset((s) => !s)}
              className="text-xs text-muted-foreground inline-flex items-center gap-1"
            >
              {showPreset ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showPreset ? "লুকান" : "দেখুন"}
            </button>
          </Label>
          <Input
            type={showPreset ? "text" : "password"}
            value={uploadPreset}
            onChange={(e) => setUploadPreset(e.target.value)}
            placeholder="যেমন: customer_photos"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => save.mutate()} disabled={save.isPending || !isConfigured}>
            {save.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            সেভ করুন
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testing || !isConfigured}
          >
            {testing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <TestTube className="w-4 h-4 mr-1" />
            )}
            সংযোগ টেস্ট করুন
          </Button>
          {isSaved && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Cloudinary credentials মুছে দেবেন?")) clearAll.mutate();
              }}
              disabled={clearAll.isPending}
            >
              <Trash2 className="w-4 h-4 mr-1" /> মুছুন
            </Button>
          )}
        </div>

        {testResult !== "idle" && (
          <div
            className={`text-xs p-3 rounded-lg border ${
              testResult === "success"
                ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900"
                : "bg-destructive/10 border-destructive/30 text-destructive"
            }`}
          >
            {testResult === "success" ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {testMsg}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <XCircle className="w-3 h-3" /> {testMsg}
              </span>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground border-t pt-3">
        🔒 আপনার credentials শুধু এই অ্যাপের ডাটাবেইসে সংরক্ষিত — Unsigned preset হওয়ায় ব্রাউজার থেকে সরাসরি আপলোড নিরাপদ।
      </p>
    </Card>
  );
}
