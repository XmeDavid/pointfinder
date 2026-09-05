import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { resources } from '@pointfinder/i18n';

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
    resources,
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
    initImmediate: false,
  });

export default i18n;
