import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getLanguage, LANGUAGE_KEY, localizeTree, type Language } from "@/lib/language";
import { Switch } from "@/components/ui/switch";

const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({
  language: "en", setLanguage: () => {},
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
    <Switch
      checked={language === "bn"}
      onCheckedChange={(checked) => setLanguage(checked ? "bn" : "en")}
      aria-label={language === "bn" ? "ইংরেজিতে পরিবর্তন করুন" : "Switch to Bengali"}
      title={language === "bn" ? "ইংরেজিতে পরিবর্তন করুন" : "Switch to Bengali"}
    />
  );
}
