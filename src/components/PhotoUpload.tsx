import { useRef, useState } from "react";
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { PhotoZoom } from "./PhotoZoom";

interface PhotoUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}

export function PhotoUpload({ value, onChange, label = "ছবি", size = "md", disabled }: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("শুধুমাত্র ছবি আপলোড করা যাবে");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("ছবি ৮ MB এর কম হতে হবে");
      return;
    }
    setUploading(true);
    try {
      const previousUrl = value || null;
      const url = await uploadToCloudinary(file);
      onChange(url);
      toast.success("ছবি আপলোড হয়েছে");
      // Auto-cleanup: delete the previous Cloudinary asset (if any) so it doesn't orphan
      if (previousUrl && previousUrl !== url) {
        deleteFromCloudinary([previousUrl]);
      }
    } catch (e: any) {
      toast.error(e.message || "আপলোড ব্যর্থ");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const handleRemove = () => {
    const previousUrl = value || null;
    onChange(null);
    if (previousUrl) deleteFromCloudinary([previousUrl]);
  };

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium block">{label}</label>}
      <div className="flex items-center gap-3 flex-wrap">
        <PhotoZoom url={value || undefined} size={size} />
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled || uploading}
            >
              {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Camera className="w-3 h-3 mr-1" />}
              ক্যামেরা
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
            >
              <Upload className="w-3 h-3 mr-1" /> আপলোড
            </Button>
            {value && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={handleRemove}
                disabled={disabled || uploading}
              >
                <X className="w-3 h-3 mr-1" /> মুছুন
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">পাসপোর্ট সাইজ ছবি — ক্লিক করলে বড় হবে</p>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
    </div>
  );
}
