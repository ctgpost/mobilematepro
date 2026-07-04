import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats, type CameraDevice } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Camera, FlashlightOff, Flashlight, RefreshCcw, ShieldAlert } from "lucide-react";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  onError?: (message: string) => void;
}

// Retail-grade formats most relevant for products + IMEI labels.
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

const READER_ID = "barcode-reader-region";

export function BarcodeScanner({ isOpen, onClose, onScan, onError }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef(false);
  const lockedRef = useRef(false);
  const lastScanRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // Cold start when dialog opens
  useEffect(() => {
    if (isOpen) {
      lockedRef.current = false;
      lastScanRef.current = { text: "", at: 0 };
      void initAndStart();
    } else {
      void teardown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const initAndStart = async () => {
    setErrorMsg(null);

    // 1) HTTPS / secure context check (camera requires it on mobile)
    const isSecure = window.isSecureContext || location.hostname === "localhost";
    if (!isSecure) {
      setErrorMsg("ক্যামেরা ব্যবহারের জন্য HTTPS সংযোগ প্রয়োজন।");
      return;
    }

    // 2) getUserMedia available?
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg("এই ব্রাউজারে ক্যামেরা সাপোর্ট নেই। অন্য ব্রাউজার ব্যবহার করুন।");
      return;
    }

    setIsStarting(true);
    try {
      // 3) Explicit permission prompt — gives a clear native dialog on mobile
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      // Release immediately; html5-qrcode will reopen properly.
      stream.getTracks().forEach((t) => t.stop());

      // 4) Enumerate cameras
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setErrorMsg("কোন ক্যামেরা পাওয়া যায়নি।");
        setIsStarting(false);
        return;
      }
      setCameras(devices);

      // Prefer back camera (label contains "back" / "rear" / "environment")
      const back =
        devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[devices.length - 1];
      setActiveCameraId(back.id);
      await startWithCamera(back.id);
    } catch (err: any) {
      console.error("Camera permission/enumerate error:", err);
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        emitError(
          "ক্যামেরার অনুমতি বন্ধ রয়েছে। ব্রাউজার সেটিংস → সাইট পারমিশনে গিয়ে ক্যামেরা 'Allow' করে আবার চেষ্টা করুন।"
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        emitError("ডিভাইসে কোন ক্যামেরা পাওয়া যায়নি।");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        emitError("ক্যামেরা অন্য একটি অ্যাপ ব্যবহার করছে। সেটি বন্ধ করে আবার চেষ্টা করুন।");
      } else if (name === "OverconstrainedError") {
        emitError("রিয়ার ক্যামেরা পাওয়া যায়নি। অন্য ক্যামেরা ব্যবহার করুন।");
      } else {
        emitError(err?.message || "ক্যামেরা চালু করা যায়নি।");
      }
    } finally {
      setIsStarting(false);
    }
  };

  const emitError = (msg: string) => {
    setErrorMsg(msg);
    onError?.(msg);
  };

  const startWithCamera = async (cameraId: string) => {
    // Tear down any prior instance
    await teardown(false);

    setIsStarting(true);
    setErrorMsg(null);
    try {
      const inst = new Html5Qrcode(READER_ID, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      scannerRef.current = inst;

      await inst.start(
        cameraId,
        {
          fps: 15,
          qrbox: (vw, vh) => {
            const min = Math.min(vw, vh);
            const size = Math.floor(min * 0.75);
            // Rectangular for 1D barcodes; works for QR too.
            return { width: size, height: Math.floor(size * 0.6) };
          },
          aspectRatio: 1.7777,
          disableFlip: false,
        } as any,
        (decodedText) => {
          if (!decodedText) return;
          // Prevent duplicate callback: lock after first success + dedupe same code within 1.5s
          const now = Date.now();
          if (lockedRef.current) return;
          if (
            lastScanRef.current.text === decodedText &&
            now - lastScanRef.current.at < 1500
          ) {
            return;
          }
          lockedRef.current = true;
          lastScanRef.current = { text: decodedText, at: now };
          // Beep via vibration on mobile
          try { (navigator as any).vibrate?.(60); } catch {}
          toast.success(`স্ক্যান সফল: ${decodedText}`);
          onScan(decodedText);
          void teardown();
          onClose();
        },
        () => {
          // Per-frame errors; ignore noise.
        }
      );

      startedRef.current = true;
      setIsScanning(true);
      setActiveCameraId(cameraId);

      // Detect torch capability
      try {
        const caps: any = (inst as any).getRunningTrackCameraCapabilities?.();
        if (caps && typeof caps.torchFeature === "function") {
          setTorchSupported(!!caps.torchFeature().isSupported());
        } else {
          setTorchSupported(false);
        }
      } catch {
        setTorchSupported(false);
      }
    } catch (err: any) {
      console.error("startWithCamera error:", err);
      setErrorMsg(err?.message || "ক্যামেরা চালু করা যায়নি।");
    } finally {
      setIsStarting(false);
    }
  };

  const teardown = async (clearRef = true) => {
    try {
      if (scannerRef.current && startedRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      }
    } catch (e) {
      // ignore
    } finally {
      startedRef.current = false;
      setIsScanning(false);
      setTorchOn(false);
      if (clearRef) scannerRef.current = null;
    }
  };

  const switchCamera = async () => {
    if (cameras.length < 2 || !activeCameraId) return;
    const idx = cameras.findIndex((c) => c.id === activeCameraId);
    const next = cameras[(idx + 1) % cameras.length];
    await startWithCamera(next.id);
  };

  const toggleTorch = async () => {
    const inst = scannerRef.current as any;
    if (!inst) return;
    try {
      const caps = inst.getRunningTrackCameraCapabilities?.();
      const torch = caps?.torchFeature?.();
      if (torch?.isSupported()) {
        await torch.apply(!torchOn);
        setTorchOn(!torchOn);
      }
    } catch (e) {
      console.error("Torch toggle error:", e);
      toast.error("টর্চ চালু করা যায়নি");
    }
  };

  const handleClose = async () => {
    await teardown();
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void handleClose();
      }}
    >
      <DialogContent
        className="max-w-md w-[95vw] p-4 sm:p-6"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> বারকোড / QR স্ক্যান
          </DialogTitle>
          <DialogDescription>
            পণ্যের বারকোড বা IMEI লেবেল ক্যামেরার সামনে ধরুন।
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {errorMsg ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex gap-2">
              <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p>{errorMsg}</p>
                <Button size="sm" variant="outline" onClick={() => void initAndStart()}>
                  আবার চেষ্টা করুন
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div
                id={READER_ID}
                className="w-full rounded-lg overflow-hidden bg-black"
                style={{ minHeight: 280 }}
              />

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  {isStarting && <span>ক্যামেরা চালু হচ্ছে...</span>}
                  {isScanning && (
                    <>
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span>স্ক্যান চলছে — ফ্রেমে রাখুন</span>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  {torchSupported && (
                    <Button
                      type="button"
                      size="sm"
                      variant={torchOn ? "default" : "outline"}
                      onClick={toggleTorch}
                    >
                      {torchOn ? <Flashlight className="h-4 w-4" /> : <FlashlightOff className="h-4 w-4" />}
                    </Button>
                  )}
                  {cameras.length > 1 && (
                    <Button type="button" size="sm" variant="outline" onClick={switchCamera}>
                      <RefreshCcw className="h-4 w-4 mr-1" /> ক্যামেরা পাল্টান
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          <Button variant="outline" onClick={handleClose} className="w-full">
            বন্ধ করুন (Esc)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
