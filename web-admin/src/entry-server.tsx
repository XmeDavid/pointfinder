import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import en from "./i18n/locales/en.json";
import { LandingPage } from "./features/landing/LandingPage";
import { FaqPage } from "./features/faq/FaqPage";

interface PageConfig {
  component: React.ComponentType;
  title: string;
  description: string;
}

const pages: Record<string, PageConfig> = {
  "/": {
    component: LandingPage,
    title: "PointFinder - NFC Adventure Games for Scouts",
    description:
      "Create and manage NFC-based adventure games for scouting organizations. Teams scan physical NFC tags at bases to complete challenges with real-time monitoring.",
  },
  "/faq": {
    component: FaqPage,
    title: "FAQ - PointFinder",
    description:
      "Frequently asked questions about PointFinder — how to set up NFC adventure games, manage teams, monitor live events, and more.",
  },
};

export async function render(url: string) {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });

  const page = pages[url];
  if (!page) {
    throw new Error(`No component registered for pre-render: ${url}`);
  }

  const Component = page.component;

  const html = renderToString(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[url]}>
        <Component />
      </MemoryRouter>
    </I18nextProvider>,
  );

  const head = [
    `<title>${page.title}</title>`,
    `<meta name="description" content="${page.description}" />`,
    `<meta property="og:title" content="${page.title}" />`,
    `<meta property="og:description" content="${page.description}" />`,
    `<meta property="og:type" content="website" />`,
  ].join("\n    ");

  return { html, head };
}

export const routes = Object.keys(pages);
