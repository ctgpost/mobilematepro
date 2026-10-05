import { bengaliToEnglish, englishToBengali } from "./uiTranslations";

export type Language = "bn" | "en";
export const LANGUAGE_KEY = "mobile-mate-pro.language";
export function getLanguage(): Language {
  try { return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "bn"; }
  catch { return "bn"; }
}

// Keep business data, form values, and currency untouched. Only translate interface copy.
const translate = (source: string, lang: Language): string => {
  const table = lang === "en" ? bengaliToEnglish : englishToBengali;
  const exact = table[source];
  if (exact) return exact;
  const trimmed = source.trim();
  if (table[trimmed]) return source.replace(trimmed, table[trimmed]);
  // Labels alongside a changing count, e.g. "Sales List (25)".
  if (lang === "bn") {
    const match = trimmed.match(/^(Sales List|In Stock|Found|Page)\s*([(:].*)$/);
    if (match && table[match[1]]) return source.replace(match[1], table[match[1]]);
  }
  return source;
};

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const watchedAttributes = ["placeholder", "title", "aria-label", "aria-description", "alt"];
const excluded = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION", "CODE", "PRE"]);

export function localizeTree(root: Node, lang: Language) {
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (text.parentElement?.closest('[data-no-translate], [contenteditable="true"]')) return;
      const parent = text.parentElement;
      if (!parent || excluded.has(parent.tagName)) return;
      const known = originalText.get(text);
      // React may reuse a text node for new content; adopt its new value.
      const source = known !== undefined && text.data === translate(known, "en") || known !== undefined && text.data === translate(known, "bn") ? known : text.data;
      originalText.set(text, source);
      const result = translate(source, lang);
      if (text.data !== result) text.data = result;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.hasAttribute("data-no-translate") || excluded.has(el.tagName)) return;
    let sources = originalAttributes.get(el);
    if (!sources) { sources = new Map(); originalAttributes.set(el, sources); }
    for (const attr of watchedAttributes) {
      const value = el.getAttribute(attr);
      if (value === null) continue;
      const previous = sources.get(attr);
      const source = previous !== undefined && (value === translate(previous, "en") || value === translate(previous, "bn")) ? previous : value;
      sources.set(attr, source);
      const result = translate(source, lang);
      if (value !== result) el.setAttribute(attr, result);
    }
    el.childNodes.forEach(visit);
  };
  visit(root);
}
