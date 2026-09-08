import { Check, Gift, Smartphone, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { appStoreUrl, GOOGLE_PLAY_URL } from "@/lib/appDownloads";
import { cn } from "@/lib/utils";
import { Artwork } from "./landing/Artwork";
import { BrandMark, BrandTile } from "@/components/brand";
import { LandingHeader } from "./landing/LandingHeader";

const CONTACT_EMAIL = "info@pointfinder.pt";
const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("PointFinder club deal")}`;

const WELCOME_STILL = "/onboarding/role-choice.webp";
const WELCOME_ROUTE = "/welcome";
const ORGANIZER_GATE_ROUTE = "/welcome?role=organizer";

// Illustrations are owned by artifacts/landing-illustrated-v1 and imported as
// independent layers: the hero scene, the empty forest, the guide cutout, the
// three step dioramas and the (separately replaceable) workspace screenshot.
const ART = {
  hero: { src: "/landing/illustrated/hero.webp", width: 1536, height: 1024 },
  forest: { src: "/landing/illustrated/forest-footer.webp", width: 1536, height: 1024 },
  guide: { src: "/landing/illustrated/guide-pointing.webp", width: 800, height: 1200 },
  workspace: { src: "/landing/illustrated/workspace-preview.webp", width: 1440, height: 900 },
  steps: [
    { src: "/landing/illustrated/step-plan.webp", width: 800, height: 800 },
    { src: "/landing/illustrated/step-explore.webp", width: 800, height: 800 },
    { src: "/landing/illustrated/step-checkin.webp", width: 800, height: 800 },
  ],
} as const;

const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const CARTO_ATTRIBUTION_URL = "https://carto.com/attributions";

type BillingCycle = "yearly" | "monthly";

export function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("yearly");
  const [isWelcomeTransitionActive, setIsWelcomeTransitionActive] = useState(false);
  const transitionTimer = useRef<number | null>(null);
  const preloadedRef = useRef(false);

  useEffect(
    () => () => {
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current);
      }
    },
    [],
  );

  // Warm the welcome route and first still before fading into the scene.
  const preloadWelcome = useCallback(() => {
    if (preloadedRef.current || typeof window === "undefined") {
      return;
    }
    preloadedRef.current = true;
    void import("@/features/introduction/WelcomePage");
    const img = new Image();
    img.src = WELCOME_STILL;
  }, []);

  // Preload on idle even without hover.
  useEffect(() => {
    const idle = window.setTimeout(preloadWelcome, 1500);
    return () => window.clearTimeout(idle);
  }, [preloadWelcome]);

  // "Get started" fades into the welcome world, where the visitor picks a role
  // before anyone mentions an account. Pricing goes straight to the organizer's
  // account choice.
  const startWelcomeTransition = useCallback(
    (to: string, event?: MouseEvent<HTMLElement>) => {
      if (
        event &&
        (event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey)
      ) {
        return;
      }

      event?.preventDefault();
      if (isWelcomeTransitionActive) {
        return;
      }

      const shouldReduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (shouldReduceMotion) {
        navigate(to);
        return;
      }

      preloadWelcome();
      setIsWelcomeTransitionActive(true);
      transitionTimer.current = window.setTimeout(() => {
        navigate(to);
      }, 220);
    },
    [isWelcomeTransitionActive, navigate, preloadWelcome],
  );
  const startFromHero = useCallback(
    (event?: MouseEvent<HTMLElement>) => startWelcomeTransition(WELCOME_ROUTE, event),
    [startWelcomeTransition],
  );
  const startFromPricing = useCallback(
    (event?: MouseEvent<HTMLElement>) => startWelcomeTransition(ORGANIZER_GATE_ROUTE, event),
    [startWelcomeTransition],
  );

  const sections = [
    { id: "how-it-works", label: t("landing.nav.howItWorks") },
    { id: "organizers", label: t("landing.nav.forOrganizers") },
    { id: "pricing", label: t("landing.nav.pricing") },
  ];

  const steps = [
    { title: t("landing.steps.planTitle"), body: t("landing.steps.planBody"), alt: t("landing.steps.planAlt") },
    { title: t("landing.steps.exploreTitle"), body: t("landing.steps.exploreBody"), alt: t("landing.steps.exploreAlt") },
    { title: t("landing.steps.checkInTitle"), body: t("landing.steps.checkInBody"), alt: t("landing.steps.checkInAlt") },
  ];

  const freeFeatures = [
    t("landing.pricing.freeFeatureGame"),
    t("landing.pricing.freeFeatureBases"),
    t("landing.pricing.freeFeatureSolo"),
  ];
  const monthlyFeatures = [
    t("landing.pricing.personalFeatureGames"),
    t("landing.pricing.personalFeatureOperator"),
    t("landing.pricing.personalFeatureUploads"),
  ];
  const annualFeatures = [
    t("landing.pricing.yearlyFeatureSavings"),
    t("landing.pricing.yearlyFeatureEquivalent"),
    t("landing.pricing.personalFeatureUploads"),
  ];
  const yearly = billingCycle === "yearly";
  const clubFeatures = [
    t("landing.pricing.clubFeatureBundle"),
    t("landing.pricing.clubFeatureVolume"),
    t("landing.pricing.clubFeatureNoJuggling"),
  ];

  const getStartedLink = (className?: string) => (
    <Link
      to={WELCOME_ROUTE}
      className={cn(buttonVariants({ size: "lg" }), "font-semibold", className)}
      onClick={startFromHero}
      onMouseEnter={preloadWelcome}
      onFocus={preloadWelcome}
    >
      {t("landing.nav.getStarted")}
    </Link>
  );

  return (
    <div
      className={cn(
        "landing-page font-ui min-h-screen bg-background text-foreground",
        isWelcomeTransitionActive && "landing-page-transitioning",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t("landing.nav.skipToContent")}
      </a>

      <LandingHeader
        sections={sections}
        getStartedHref={WELCOME_ROUTE}
        onGetStarted={startFromHero}
        onPreloadGetStarted={preloadWelcome}
      />

      <main id="main" tabIndex={-1} className="focus:outline-none">
        {/* 1. Full-bleed forest hero: live copy on the dark left, the whole scene on the right. */}
        <section className="landing-hero landing-dark" aria-labelledby="landing-hero-title">
          <div className="landing-hero-copy landing-reveal mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-md md:w-[46%] lg:w-full lg:max-w-[27rem]">
              <h1 id="landing-hero-title" className="text-[clamp(2.25rem,5.2vw,4rem)] font-bold leading-[1.05] tracking-tight text-balance">
                {t("landing.hero.title")}
              </h1>
              <p className="mt-4 max-w-prose text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {t("landing.hero.tagline")}
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {getStartedLink()}
                <a href="#how-it-works" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
                  {t("landing.hero.secondaryCta")}
                </a>
              </div>
              <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
                <BrandTile size={24} decorative className="rounded-md" />
                {t("landing.hero.note")}
              </p>
            </div>
          </div>
          <figure className="landing-hero-media landing-reveal landing-reveal-late">
            <Artwork
              src={ART.hero.src}
              alt={t("landing.hero.sceneAlt")}
              loading="eager"
              fetchPriority="high"
              width={ART.hero.width}
              height={ART.hero.height}
              className="landing-hero-image"
              fallbackClassName="landing-hero-image rounded-none border-0 bg-transparent"
            />
            <div aria-hidden="true" className="landing-hero-scrim" />
          </figure>
        </section>

        {/* 2. Cream explanation: three steps, illustrations under the copy, no boxes. */}
        <section id="how-it-works" className="landing-cream scroll-mt-16 px-4 py-14 sm:px-6 lg:px-8 lg:py-20" aria-labelledby="landing-steps-title">
          <div className="mx-auto max-w-6xl">
            <h2 id="landing-steps-title" className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              {t("landing.steps.title")}
            </h2>
            <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
              {steps.map((step, index) => (
                <li key={step.title} className="flex flex-col">
                  <div className="flex gap-4">
                    <span aria-hidden="true" className="text-2xl font-bold leading-none text-primary sm:text-3xl">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="max-w-prose">
                      <h3 className="text-xl font-bold leading-tight sm:text-2xl">{step.title}</h3>
                      <p className="mt-2 leading-7 text-muted-foreground">{step.body}</p>
                    </div>
                  </div>
                  <Artwork
                    src={ART.steps[index].src}
                    alt={step.alt}
                    width={ART.steps[index].width}
                    height={ART.steps[index].height}
                    className="mt-6 h-auto w-full max-w-sm self-center md:self-start"
                    fallbackClassName="mt-6 aspect-square max-w-sm self-center md:self-start"
                  />
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 3. Organizers: an independent evergreen background, the guide cutout and the real workspace. */}
        <section id="organizers" className="landing-dark scroll-mt-16 px-4 py-14 sm:px-6 lg:px-8 lg:py-20" aria-labelledby="landing-organizers-title">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:gap-12">
            <div className="max-w-md">
              <h2 id="landing-organizers-title" className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl text-balance">
                {t("landing.organizers.title")}
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground sm:text-lg sm:leading-8">{t("landing.organizers.body")}</p>
              <div className="mt-7">{getStartedLink()}</div>
            </div>

            <figure className="landing-workspace">
              <div className="landing-workspace-stage">
                <div className="landing-workspace-screen">
                  <Artwork
                    src={ART.workspace.src}
                    alt={t("landing.organizers.screenshotAlt")}
                    unavailableLabel={t("landing.organizers.imageUnavailable")}
                    width={ART.workspace.width}
                    height={ART.workspace.height}
                    className="block h-auto w-full"
                    fallbackClassName="aspect-[16/10] rounded-none border-0"
                  />
                </div>
                <Artwork
                  src={ART.guide.src}
                  alt={t("landing.organizers.guideAlt")}
                  width={ART.guide.width}
                  height={ART.guide.height}
                  className="landing-workspace-guide"
                  fallbackClassName="landing-workspace-guide sr-only"
                />
              </div>
              <figcaption className="landing-workspace-caption text-xs leading-5 text-muted-foreground">
                {t("landing.organizers.caption")}{" "}
                <MapAttribution />
              </figcaption>
            </figure>
          </div>
        </section>

        {/* 4. Pricing, compact, ahead of the final call to action. */}
        <section id="pricing" className="scroll-mt-16 px-4 py-14 sm:px-6 lg:px-8 lg:py-20" aria-labelledby="landing-pricing-title">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <h2 id="landing-pricing-title" className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                {t("landing.pricing.title")}
              </h2>
              <p className="mt-3 leading-7 text-muted-foreground">{t("landing.pricing.description")}</p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <PricingCard
                icon={Gift}
                title={t("landing.pricing.free")}
                description={t("landing.pricing.freeDesc")}
                price="€0"
                suffix=""
                features={freeFeatures}
                cta={t("landing.pricing.startFree")}
                href={ORGANIZER_GATE_ROUTE}
                onStartClick={startFromPricing}
              />
              <PricingCard
                icon={Smartphone}
                title={t("landing.pricing.personal")}
                description={yearly ? t("landing.pricing.yearlyDesc") : t("landing.pricing.monthlyDesc")}
                price={yearly ? "€30" : "€3.99"}
                suffix={yearly ? t("landing.pricing.perYear") : t("landing.pricing.perMonth")}
                savings={yearly ? t("landing.pricing.yearlySavings") : undefined}
                features={yearly ? annualFeatures : monthlyFeatures}
                cta={yearly ? t("landing.pricing.startYearly") : t("landing.pricing.startPersonal")}
                href={ORGANIZER_GATE_ROUTE}
                onStartClick={startFromPricing}
                highlighted
                headerAction={
                  <BillingToggle
                    value={billingCycle}
                    onChange={setBillingCycle}
                    label={t("landing.pricing.billingCycle")}
                    monthlyLabel={t("landing.pricing.monthlyToggle")}
                    yearlyLabel={t("landing.pricing.yearlyToggle")}
                  />
                }
              />
              <PricingCard
                icon={Users}
                title={t("landing.pricing.clubs")}
                description={t("landing.pricing.clubsDesc")}
                price={t("landing.pricing.custom")}
                suffix=""
                savings={t("landing.pricing.clubsSavings")}
                features={clubFeatures}
                cta={t("landing.pricing.contactUs")}
                href={CONTACT_HREF}
                external
              />
            </div>
          </div>
        </section>

        {/* 5. Final call to action in the empty forest, with the footer at its feet. */}
        <section className="landing-dark landing-forest" aria-labelledby="landing-cta-title">
          <Artwork
            src={ART.forest.src}
            alt=""
            width={ART.forest.width}
            height={ART.forest.height}
            className="landing-forest-image"
            fallbackClassName="hidden"
          />
          <div aria-hidden="true" className="landing-forest-scrim" />
          <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-8 pt-20 text-center sm:px-6 lg:px-8 lg:pt-28">
            <h2 id="landing-cta-title" className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl text-balance">
              {t("landing.cta.title")}
            </h2>
            <div className="mt-7">{getStartedLink()}</div>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                {t("landing.cta.getApp")}
              </span>
              <a
                href={appStoreUrl()}
                className="font-semibold text-foreground underline-offset-4 hover:underline"
                rel="noopener noreferrer"
                target="_blank"
                data-testid="landing-download-ios"
              >
                {t("landing.cta.ios")}
              </a>
              <span aria-hidden="true">·</span>
              <a
                href={GOOGLE_PLAY_URL}
                className="font-semibold text-foreground underline-offset-4 hover:underline"
                rel="noopener noreferrer"
                target="_blank"
                data-testid="landing-download-android"
              >
                {t("landing.cta.android")}
              </a>
            </p>

            <footer className="mt-24 w-full border-t border-border/60 pt-6 text-sm text-muted-foreground lg:mt-32">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 text-left">
                  <BrandMark size={28} tone="current" decorative className="text-foreground" />
                  <span className="font-semibold text-foreground">PointFinder</span>
                  <span>{t("landing.footer.tagline")}</span>
                </div>
                <nav aria-label={t("landing.footer.tagline")} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 md:justify-end">
                  <a href="#pricing" className="hover:text-foreground">
                    {t("landing.nav.pricing")}
                  </a>
                  <Link to="/faq" className="hover:text-foreground">
                    {t("faq.label")}
                  </Link>
                  <Link to="/privacy" className="hover:text-foreground">
                    {t("landing.footer.privacyPolicy")}
                  </Link>
                  <Link to="/login" className="hover:text-foreground">
                    {t("landing.footer.operatorLogin")}
                  </Link>
                </nav>
              </div>
              <p className="mt-5 text-xs">{t("landing.footer.copyright", { year: new Date().getFullYear() })}</p>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}

/** "Map data © OpenStreetMap contributors, © CARTO", with the names linked, in any language. */
function MapAttribution() {
  const { t } = useTranslation();
  const OSM = "[[osm]]";
  const CARTO = "[[carto]]";
  const text = t("landing.organizers.attribution", { osm: OSM, carto: CARTO });
  const parts = text.split(/(\[\[osm\]\]|\[\[carto\]\])/);
  return (
    <span data-testid="landing-map-attribution">
      {parts.map((part, index) => {
        if (part === OSM) {
          return (
            <a key={index} href={OSM_COPYRIGHT_URL} className="underline underline-offset-2 hover:text-foreground" rel="noopener noreferrer" target="_blank">
              OpenStreetMap
            </a>
          );
        }
        if (part === CARTO) {
          return (
            <a key={index} href={CARTO_ATTRIBUTION_URL} className="underline underline-offset-2 hover:text-foreground" rel="noopener noreferrer" target="_blank">
              CARTO
            </a>
          );
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </span>
  );
}

function BillingToggle({
  value,
  onChange,
  label,
  monthlyLabel,
  yearlyLabel,
}: {
  value: BillingCycle;
  onChange: (value: BillingCycle) => void;
  label: string;
  monthlyLabel: string;
  yearlyLabel: string;
}) {
  const options: { value: BillingCycle; label: string }[] = [
    { value: "yearly", label: yearlyLabel },
    { value: "monthly", label: monthlyLabel },
  ];
  return (
    <div role="group" aria-label={label} className="grid w-fit grid-cols-2 rounded-md border border-border bg-muted p-0.5 text-xs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            "rounded-sm px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type PricingCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  price: string;
  suffix: string;
  savings?: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
  external?: boolean;
  headerAction?: ReactNode;
  onStartClick?: (event: MouseEvent<HTMLElement>) => void;
};

function PricingCard({
  icon: Icon,
  title,
  description,
  price,
  suffix,
  savings,
  features,
  cta,
  href,
  highlighted,
  external,
  headerAction,
  onStartClick,
}: PricingCardProps) {
  return (
    <article
      className={cn(
        "flex h-full rounded-lg border bg-card p-5",
        highlighted ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
    >
      <div className="flex w-full flex-col">
        <div className="flex min-h-8 flex-wrap items-start justify-between gap-3">
          <Icon className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          {headerAction}
        </div>
        <h3 className="mt-4 text-lg font-bold">{title}</h3>
        <p className="mt-1.5 min-h-12 text-sm leading-6 text-muted-foreground">{description}</p>
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
          <span className="text-3xl font-bold tracking-tight">{price}</span>
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
        </p>
        {savings && (
          <Badge variant={highlighted ? "success" : "secondary"} className="mt-3 w-fit rounded-md">
            {savings}
          </Badge>
        )}
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          {features.map((feature) => (
            <li key={feature} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-6">
          {external ? (
            <a href={href} className={cn(buttonVariants({ variant: highlighted ? "default" : "outline" }), "w-full")}>
              {cta}
            </a>
          ) : (
            <Link
              to={href}
              className={cn(buttonVariants({ variant: highlighted ? "default" : "outline" }), "w-full")}
              onClick={onStartClick}
            >
              {cta}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
