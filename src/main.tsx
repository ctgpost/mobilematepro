import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register service worker only in production AND outside iframes/preview hosts.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const host = window.location.hostname;
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("preview--") ||
  host.includes("lovableproject.com") ||
  host.includes("lovableproject-dev.com") ||
  host === "localhost" ||
  host === "127.0.0.1";

if (!isInIframe && !isPreviewHost && "serviceWorker" in navigator) {
  // Lazy import so it only runs in production
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      /* ignore */
    });
} else if (isInIframe || isPreviewHost) {
  // Clean up any previously registered SW in preview/editor
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

createRoot(document.getElementById("root")!).render(<App />);
