import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import de from "./locales/de.json";
import pt from "./locales/pt.json";

const languageByHost: Record<string, string> = {
  "pointfinder.pt": "pt",
  "pointfinder.ch": "de",
};

const hostLanguageDetector = {
  name: "hostname",
  lookup() {
    if (typeof window === "undefined") {
      return undefined;
    }
    const host = window.location.hostname.toLowerCase();
    return languageByHost[host];
  },
  cacheUserLanguage() {
    // Persisted user preference remains managed by localStorage cache.
  },
};

const languageDetector = new LanguageDetector();
languageDetector.addDetector(hostLanguageDetector);

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
      pt: { translation: pt },
    },
    fallbackLng: ["en", "pt"],
    supportedLngs: ["en", "pt", "de"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "hostname", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "pointfinder-lang",
    },
  });

export default i18n;
