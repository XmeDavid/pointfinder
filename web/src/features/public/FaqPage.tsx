import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Compass, ChevronDown } from "lucide-react";

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );

    const el = ref.current;
    if (el) {
      el.querySelectorAll(".scroll-reveal").forEach((child) =>
        observer.observe(child),
      );
    }
    return () => observer.disconnect();
  }, []);

  return ref;
}

interface FaqItem {
  questionKey: string;
  answerKey: string;
}

interface FaqCategory {
  titleKey: string;
  items: FaqItem[];
}

const faqCategories: FaqCategory[] = [
  {
    titleKey: "faq.categories.gettingStarted",
    items: [
      { questionKey: "faq.gettingStarted.whatIsQ", answerKey: "faq.gettingStarted.whatIsA" },
      { questionKey: "faq.gettingStarted.firstGameQ", answerKey: "faq.gettingStarted.firstGameA" },
      { questionKey: "faq.gettingStarted.equipmentQ", answerKey: "faq.gettingStarted.equipmentA" },
    ],
  },
  {
    titleKey: "faq.categories.gameSetup",
    items: [
      { questionKey: "faq.gameSetup.basesQ", answerKey: "faq.gameSetup.basesA" },
      { questionKey: "faq.gameSetup.challengesQ", answerKey: "faq.gameSetup.challengesA" },
      { questionKey: "faq.gameSetup.assignmentQ", answerKey: "faq.gameSetup.assignmentA" },
      { questionKey: "faq.gameSetup.variablesQ", answerKey: "faq.gameSetup.variablesA" },
    ],
  },
  {
    titleKey: "faq.categories.playing",
    items: [
      { questionKey: "faq.playing.joinQ", answerKey: "faq.playing.joinA" },
      { questionKey: "faq.playing.nfcScanQ", answerKey: "faq.playing.nfcScanA" },
      { questionKey: "faq.playing.afterScanQ", answerKey: "faq.playing.afterScanA" },
      { questionKey: "faq.playing.offlineQ", answerKey: "faq.playing.offlineA" },
    ],
  },
  {
    titleKey: "faq.categories.operator",
    items: [
      { questionKey: "faq.operator.monitorQ", answerKey: "faq.operator.monitorA" },
      { questionKey: "faq.operator.reviewQ", answerKey: "faq.operator.reviewA" },
      { questionKey: "faq.operator.broadcastQ", answerKey: "faq.operator.broadcastA" },
      { questionKey: "faq.operator.multipleQ", answerKey: "faq.operator.multipleA" },
    ],
  },
  {
    titleKey: "faq.categories.platform",
    items: [
      { questionKey: "faq.platform.supportedQ", answerKey: "faq.platform.supportedA" },
      { questionKey: "faq.platform.mapsQ", answerKey: "faq.platform.mapsA" },
      { questionKey: "faq.platform.languagesQ", answerKey: "faq.platform.languagesA" },
    ],
  },
];

function AccordionItem({ questionKey, answerKey }: FaqItem) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors duration-200 hover:text-primary"
      >
        <span className="text-[15px] font-medium text-white/80">{t(questionKey)}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-primary/60 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ${open ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <p className="text-sm leading-relaxed text-white/40">{t(answerKey)}</p>
        </div>
      </div>
    </div>
  );
}

function Navbar() {
  const { t } = useTranslation();

  return (
    <nav
      className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-card/95 shadow-panel"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Compass className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold tracking-tight text-white">PointFinder</span>
        </Link>

        <Link
          to="/login"
          className="text-sm font-medium text-primary/80 transition-colors duration-200 hover:text-primary"
        >
          {t("landing.nav.operatorLogin")}
        </Link>
      </div>
    </nav>
  );
}

function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-white/[0.04] px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Compass className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="block text-sm font-semibold text-white">PointFinder</span>
            <span className="block text-xs text-white/25">{t("landing.footer.tagline")}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <Link
            to="/privacy"
            className="text-muted-foreground transition-colors duration-200 hover:text-primary"
          >
            {t("landing.footer.privacyPolicy")}
          </Link>
          <Link
            to="/"
            className="text-muted-foreground transition-colors duration-200 hover:text-primary"
          >
            {t("faq.backToHome")}
          </Link>
        </div>

        <span className="text-xs text-white/15">
          {t("landing.footer.copyright", { year: new Date().getFullYear() })}
        </span>
      </div>
    </footer>
  );
}

export function FaqPage() {
  const { t } = useTranslation();
  const containerRef = useScrollReveal();

  return (
    <div
      ref={containerRef}
      className="dark min-h-screen overflow-x-hidden bg-background text-foreground"
    >
      <Navbar />

      {/* Header */}
      <section className="px-6 pt-28 pb-16 md:pt-36 md:pb-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mb-3 block text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
            {t("faq.label")}
          </span>
          <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">
            {t("faq.title")}
          </h1>
          <p className="text-base text-white/40 md:text-lg">
            {t("faq.subtitle")}
          </p>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="px-6 pb-20 md:pb-28">
        <div className="mx-auto max-w-3xl">
          {faqCategories.map((category, ci) => (
            <div
              key={category.titleKey}
              className="scroll-reveal mb-12 last:mb-0"
              style={{ transitionDelay: `${ci * 100}ms` }}
            >
              <h2 className="mb-6 text-lg font-semibold text-primary">
                {t(category.titleKey)}
              </h2>
              <div className="rounded-lg border border-border bg-card px-6 shadow-panel">
                {category.items.map((item) => (
                  <AccordionItem key={item.questionKey} {...item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
