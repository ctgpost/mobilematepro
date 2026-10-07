import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getLanguage, LANGUAGE_KEY, localizeTree, type Language } from "@/lib/language";
import { Button } from "@/components/ui/button";

const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({
  language: "bn", setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Private browsing */ }
    localizeTree(document.body, language);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") localizeTree(mutation.target, language);
        if (mutation.type === "attributes") localizeTree(mutation.target, language);
        if (mutation.type === "childList") mutation.addedNodes.forEach(node => localizeTree(node, language));
      }
    });
    observer.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label", "aria-description", "alt"],
    });
    return () => observer.disconnect();
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  return {
    ...context,
    locale: context.language === "bn" ? "bn-BD" : "en-US",
  };
}

export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return (
    <div role="group" aria-label={language === "bn" ? "ভাষা নির্বাচন" : "Select language"} className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
      <Button type="button" size="sm" variant={language === "bn" ? "secondary" : "ghost"} className="h-8 min-w-10 px-2 text-xs" aria-pressed={language === "bn"} onClick={() => setLanguage("bn")}>বাংলা</Button>
      <Button type="button" size="sm" variant={language === "en" ? "secondary" : "ghost"} className="h-8 min-w-10 px-2 text-xs" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>ENG</Button>
    </div>
  );
}
