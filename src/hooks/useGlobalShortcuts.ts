import { useEffect } from "react";

type ShortcutHandler = (e: KeyboardEvent) => void;

/**
 * Global keyboard shortcuts for the whole app.
 * Mounted once in the root layout (Index.tsx).
 *
 * Standard Windows-style shortcuts:
 * - Ctrl+N : New Sale (POS)
 * - Ctrl+Shift+P : Add new Product
 * - Ctrl+P : Print (browser default — let through)
 * - Ctrl+F : Focus search input on current page
 * - Ctrl+B : Toggle sidebar / mobile menu
 * - Ctrl+, : Open Settings
 * - Ctrl+H : Dashboard (Home)
 * - F1 : Help
 * - F2 : Edit (dispatch event so the active page can handle)
 * - Alt+1..9 : Quick navigation tabs
 * - Esc : already handled per-dialog
 */
export function useGlobalShortcuts(opts: {
  onNavigate: (tab: string) => void;
  onToggleMenu: () => void;
}) {
  const { onNavigate, onToggleMenu } = opts;

  useEffect(() => {
    const handler: ShortcutHandler = (e) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const ctrl = e.ctrlKey || e.metaKey;
      const alt = e.altKey;
      const shift = e.shiftKey;
      const k = e.key.toLowerCase();

      // Ctrl+N -> POS new sale (don't fire while typing)
      if (ctrl && !shift && k === "n" && !isTyping) {
        e.preventDefault();
        onNavigate("pos");
        return;
      }

      // Ctrl+Shift+P -> add new product
      if (ctrl && shift && k === "p") {
        e.preventDefault();
        onNavigate("products");
        window.dispatchEvent(new CustomEvent("shortcut:add-product"));
        return;
      }

      // Ctrl+, -> settings
      if (ctrl && k === ",") {
        e.preventDefault();
        onNavigate("settings");
        return;
      }

      // Ctrl+H -> dashboard
      if (ctrl && k === "h" && !isTyping) {
        e.preventDefault();
        onNavigate("dashboard");
        return;
      }

      // Ctrl+B -> toggle menu
      if (ctrl && k === "b") {
        e.preventDefault();
        onToggleMenu();
        return;
      }

      // Ctrl+F -> focus search input (override browser find on app pages)
      if (ctrl && k === "f" && !isTyping) {
        const input =
          document.querySelector<HTMLInputElement>(
            'input[type="search"], input[placeholder*="খুঁজুন" i], input[placeholder*="search" i]'
          );
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
          return;
        }
      }

      // Alt+1..9 -> tabs in order
      if (alt && /^[1-9]$/.test(e.key)) {
        const map: Record<string, string> = {
          "1": "dashboard",
          "2": "pos",
          "3": "sales",
          "4": "products",
          "5": "due-collection",
          "6": "returns",
          "7": "reports",
          "8": "investments",
          "9": "settings",
        };
        const tab = map[e.key];
        if (tab) {
          e.preventDefault();
          onNavigate(tab);
        }
        return;
      }

      // F2 -> dispatch edit event for active page
      if (e.key === "F2") {
        window.dispatchEvent(new CustomEvent("shortcut:edit"));
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNavigate, onToggleMenu]);
}
