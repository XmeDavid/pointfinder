const APP_STORE_COUNTRY: Record<string, string> = {
  "pointfinder.pt": "pt",
  "pointfinder.ch": "ch",
};

export function appStoreUrl() {
  if (typeof window === "undefined") {
    return "https://apps.apple.com/app/pointfinder/id6759060734";
  }
  const country = APP_STORE_COUNTRY[window.location.hostname.toLowerCase()];
  const prefix = country ? `/${country}` : "";
  return `https://apps.apple.com${prefix}/app/pointfinder/id6759060734`;
}

export const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.prayer.pointfinder";
