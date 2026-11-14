import { bengaliToEnglish, englishToBengali } from "./uiTranslations";

export type Language = "bn" | "en";
export const LANGUAGE_KEY = "mobile-mate-pro.language";
export function getLanguage(): Language {
  try { return localStorage.getItem(LANGUAGE_KEY) === "bn" ? "bn" : "en"; }
  catch { return "en"; }
}

// Translate complete phrases first, then known UI fragments around dynamic values.
const orderedEntries = {
  en: Object.entries(bengaliToEnglish).filter(([key]) => key.length > 1).sort((a, b) => b[0].length - a[0].length),
  bn: Object.entries(englishToBengali).filter(([key]) => key.length > 1).sort((a, b) => b[0].length - a[0].length),
} as const;

const normalizeDigits = (value: string, lang: Language, source: string): string => {
  if (lang === "en") return value.replace(/[০-৯]/g, digit => String("০১২৩৪৫৬৭৮৯".indexOf(digit)));
  // Keep pure numbers and technical identifiers intact; localize digits in Bengali UI copy.
  if (/[\u0980-\u09FF]/.test(value) || /[০-৯]/.test(source)) {
    return value.replace(/[0-9]/g, digit => "০১২৩৪৫৬৭৮৯"[Number(digit)]);
  }
  return value;
};

const translate = (source: string, lang: Language): string => {
  const hasSourceLanguageText = lang === "en" ? /[\\u0980-\\u09FF]/.test(source) : /[A-Za-z]/.test(source);
  if (!hasSourceLanguageText) return normalizeDigits(source, lang, source);
  const table = lang === "en" ? bengaliToEnglish : englishToBengali;
  const exact = table[source];
  if (exact) return normalizeDigits(exact, lang, source);
  const trimmed = source.trim();
  if (table[trimmed]) return normalizeDigits(source.replace(trimmed, table[trimmed]), lang, source);

  let result = source;
  for (const [key, value] of orderedEntries[lang]) {
    if (result.includes(key)) result = result.split(key).join(value);
  }
  // Labels alongside a changing count, e.g. "Sales List (25)".
  if (result === source && lang === "bn") {
    const match = trimmed.match(/^(Sales List|In Stock|Found|Page)\s*([(:].*)$/);
    if (match && table[match[1]]) result = source.replace(match[1], table[match[1]]);
  }
  return normalizeDigits(result, lang, source);
};

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const watchedAttributes = ["placeholder", "title", "aria-label", "aria-description", "alt"];
const excludedText = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE"]);

export function localizeTree(root: Node, lang: Language) {
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (text.parentElement?.closest('[data-no-translate], [contenteditable="true"]')) return;
      const parent = text.parentElement;
      if (!parent || excludedText.has(parent.tagName)) return;
      const known = originalText.get(text);
      // React may reuse a text node for new content; adopt its new value.
      const source = known !== undefined && (text.data === translate(known, "en") || text.data === translate(known, "bn")) ? known : text.data;
      originalText.set(text, source);
      const result = translate(source, lang);
      if (text.data !== result) text.data = result;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.hasAttribute("data-no-translate") || el.closest('[contenteditable="true"]')) return;
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
    if (excludedText.has(el.tagName)) return;
    el.childNodes.forEach(visit);
  };
  visit(root);
}
