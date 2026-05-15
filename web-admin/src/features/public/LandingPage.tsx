import {
  ArrowRight,
  Check,
  Gift,
  MapPinned,
  MessageSquare,
  Navigation,
  RadioTower,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CONTACT_EMAIL = "info@pointfinder.pt";
const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "PointFinder club deal",
)}`;

const APP_STORE_COUNTRY: Record<string, string> = {
  "pointfinder.pt": "pt",
  "pointfinder.ch": "ch",
};

function appStoreUrl() {
  if (typeof window === "undefined") {
    return "https://apps.apple.com/app/pointfinder/id6759060734";
  }
  const country = APP_STORE_COUNTRY[window.location.hostname.toLowerCase()];
  const prefix = country ? `/${country}` : "";
  return `https://apps.apple.com${prefix}/app/pointfinder/id6759060734`;
}

const workflowIcons = [MapPinned, ScanLine, RadioTower];
const featureIcons = [MapPinned, ScanLine, MessageSquare, ShieldCheck];
const TOPOGRAPHY_BACKGROUND = "/landing/topography-contours.svg";
type BillingCycle = "yearly" | "monthly";

export function LandingPage() {
  const { t } = useTranslation();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("yearly");

  const workflow = [
    {
      title: t("landing.workflow.planTitle"),
      body: t("landing.workflow.planBody"),
    },
    {
      title: t("landing.workflow.playTitle"),
      body: t("landing.workflow.playBody"),
    },
    {
      title: t("landing.workflow.runTitle"),
      body: t("landing.workflow.runBody"),
    },
  ];

  const features = [
    {
      title: t("landing.features.mapTitle"),
      body: t("landing.features.mapBody"),
    },
    {
      title: t("landing.features.nfcTitle"),
      body: t("landing.features.nfcBody"),
    },
    {
      title: t("landing.features.reviewTitle"),
      body: t("landing.features.reviewBody"),
    },
    {
      title: t("landing.features.recoveryTitle"),
      body: t("landing.features.recoveryBody"),
    },
  ];

  const monthlyFeatures = [
    t("landing.pricing.personalFeatureGames"),
    t("landing.pricing.personalFeatureOperator"),
    t("landing.pricing.personalFeatureUploads"),
  ];

  const freeFeatures = [
    t("landing.pricing.freeFeatureGame"),
    t("landing.pricing.freeFeatureBases"),
    t("landing.pricing.freeFeatureSolo"),
  ];

  const annualFeatures = [
    t("landing.pricing.yearlyFeatureSavings"),
    t("landing.pricing.yearlyFeatureEquivalent"),
    t("landing.pricing.personalFeatureUploads"),
  ];
  const personalFeatures = billingCycle === "yearly" ? annualFeatures : monthlyFeatures;
  const personalPrice = billingCycle === "yearly" ? "€30" : "€3.99";
  const personalSuffix =
    billingCycle === "yearly" ? t("landing.pricing.perYear") : t("landing.pricing.perMonth");
  const personalCta =
    billingCycle === "yearly" ? t("landing.pricing.startYearly") : t("landing.pricing.startPersonal");

  const clubFeatures = [
    t("landing.pricing.clubFeatureBundle"),
    t("landing.pricing.clubFeatureVolume"),
    t("landing.pricing.clubFeatureNoJuggling"),
  ];

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/70 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="PointFinder">
            <BrandMark />
            <span className="text-base font-semibold">PointFinder</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how-it-works" className="hover:text-foreground">
              {t("landing.nav.howItWorks")}
            </a>
            <a href="#pricing" className="hover:text-foreground">
              {t("landing.nav.pricing")}
            </a>
            <a href="#clubs" className="hover:text-foreground">
              {t("landing.nav.clubs")}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              {t("landing.nav.operatorLogin")}
            </Link>
            <Link
              to="/register"
              className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}
            >
              {t("landing.nav.getStarted")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border bg-card">
          <HeroBackdrop />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                {t("landing.hero.title")}
              </h1>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">
                {t("landing.hero.tagline")}
              </p>

              <div className="mt-8">
                <Link to="/register" className={cn(buttonVariants({ size: "lg" }))}>
                  {t("landing.nav.getStarted")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <a href={appStoreUrl()} className="inline-flex" rel="noopener noreferrer" target="_blank">
                  <AppStoreBadge className="h-11 w-auto" />
                </a>
                <a
                  href="https://play.google.com/store/apps/details?id=com.prayer.pointfinder"
                  className="inline-flex"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <GooglePlayBadge className="h-11 w-auto" />
                </a>
              </div>

            </div>

            <CompassHero />
          </div>
        </section>

        <section id="how-it-works" className="px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow={t("landing.workflow.label")}
              title={t("landing.workflow.title")}
              body={t("landing.workflow.body")}
            />

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {workflow.map((item, index) => {
                const Icon = workflowIcons[index];
                return (
                  <article
                    key={item.title}
                    className="rounded-lg border border-border bg-card p-6 shadow-panel"
                  >
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-medium text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">{item.title}</h3>
                    <p className="mt-3 leading-7 text-muted-foreground">{item.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-muted/50 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <SectionHeading
                eyebrow={t("landing.features.label")}
                title={t("landing.features.title")}
                body={t("landing.features.body")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((feature, index) => {
                const Icon = featureIcons[index];
                return (
                  <article
                    key={feature.title}
                    className="rounded-lg border border-border bg-card p-5 shadow-panel"
                  >
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    <h3 className="mt-4 font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {feature.body}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="pricing" className="px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow={t("landing.pricing.label")}
              title={t("landing.pricing.title")}
              body={t("landing.pricing.description")}
            />

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <PricingCard
                icon={Gift}
                title={t("landing.pricing.free")}
                description={t("landing.pricing.freeDesc")}
                price="€0"
                suffix=""
                features={freeFeatures}
                cta={t("landing.pricing.startFree")}
                href="/register"
              />
              <PersonalPricingCard
                icon={Smartphone}
                title={t("landing.pricing.personal")}
                description={
                  billingCycle === "yearly"
                    ? t("landing.pricing.yearlyDesc")
                    : t("landing.pricing.monthlyDesc")
                }
                price={personalPrice}
                suffix={personalSuffix}
                savings={billingCycle === "yearly" ? t("landing.pricing.yearlySavings") : undefined}
                features={personalFeatures}
                cta={personalCta}
                href="/register"
                billingCycle={billingCycle}
                onBillingCycleChange={setBillingCycle}
                monthlyLabel={t("landing.pricing.monthlyToggle")}
                yearlyLabel={t("landing.pricing.yearlyToggle")}
                highlighted
              />
              <PricingCard
                id="clubs"
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

        <section className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-20">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-border bg-card shadow-panel">
            <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="border-b border-border p-6 sm:p-8 lg:border-b-0 lg:border-r">
                <p className="text-sm font-medium text-primary">{t("landing.club.label")}</p>
                <h2 className="mt-3 text-3xl font-semibold">{t("landing.club.title")}</h2>
                <p className="mt-4 leading-7 text-muted-foreground">{t("landing.club.body")}</p>
                <a
                  href={CONTACT_HREF}
                  className={cn(buttonVariants({ size: "lg" }), "mt-6")}
                >
                  {t("landing.club.cta")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <div className="grid gap-0 sm:grid-cols-3">
                <ClubMetric value={t("landing.club.metricOneValue")} label={t("landing.club.metricOneLabel")} />
                <ClubMetric value={t("landing.club.metricTwoValue")} label={t("landing.club.metricTwoLabel")} />
                <ClubMetric value={t("landing.club.metricThreeValue")} label={t("landing.club.metricThreeLabel")} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 text-foreground">
            <BrandMark />
            <span className="font-semibold">PointFinder</span>
            <span className="text-muted-foreground">{t("landing.footer.tagline")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/faq" className="hover:text-foreground">
              {t("faq.label")}
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              {t("landing.footer.privacyPolicy")}
            </Link>
            <Link to="/login" className="hover:text-foreground">
              {t("landing.footer.operatorLogin")}
            </Link>
            <span>{t("landing.footer.copyright", { year: new Date().getFullYear() })}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BrandMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <Navigation className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,var(--color-primary)_0,transparent_34%),linear-gradient(to_bottom,var(--color-card),var(--color-background))] opacity-20" />
      <div
        className="contour-breathe absolute inset-x-[-18%] top-[-30%] h-[136%] w-[136%] opacity-25"
        style={{
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 58%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, black 0%, black 58%, transparent 100%)",
        }}
      >
        <div
          className="h-full w-full bg-primary"
          style={{
            WebkitMaskImage: `url(${TOPOGRAPHY_BACKGROUND})`,
            WebkitMaskPosition: "center top",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskSize: "cover",
            maskImage: `url(${TOPOGRAPHY_BACKGROUND})`,
            maskPosition: "center top",
            maskRepeat: "no-repeat",
            maskSize: "cover",
          }}
        />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_58%,var(--color-background)_100%)]" />
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-lg leading-8 text-muted-foreground">{body}</p>
    </div>
  );
}

function CompassHero() {
  return (
    <div className="relative mx-auto hidden min-h-[520px] w-full max-w-[600px] items-center justify-center lg:flex lg:min-h-[600px]">
      <div className="absolute h-[130%] w-[130%] rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute h-[116%] w-[116%] rounded-full bg-primary/10 blur-2xl" />
      <div className="absolute h-[84%] w-[84%] rounded-full border border-primary/15 bg-[radial-gradient(circle_at_50%_42%,var(--color-card)_0%,var(--color-muted)_58%,var(--color-background)_100%)] opacity-90 shadow-[0_0_80px_rgba(34,197,94,0.18)]" />
      <div className="landing-ping absolute h-[72%] w-[72%] rounded-full border border-primary/20" />
      <div
        className="landing-ping absolute h-[95%] w-[95%] rounded-full border border-primary/15"
        style={{ animationDelay: "1.2s" }}
      />
      <div
        className="landing-ping absolute h-[118%] w-[118%] rounded-full border border-primary/10"
        style={{ animationDelay: "2.4s" }}
      />

      <div className="relative aspect-square w-[min(520px,42vw)]">
        <CompassRose />
        <div className="pointer-events-none absolute inset-0 font-bold text-primary">
          <span className="absolute left-1/2 top-[14%] -translate-x-1/2 text-[clamp(1rem,1.8vw,1.45rem)] opacity-80">
            N
          </span>
          <span className="absolute right-[15.5%] top-1/2 -translate-y-1/2 text-[clamp(1rem,1.8vw,1.45rem)] opacity-45">
            E
          </span>
          <span className="absolute bottom-[13%] left-1/2 -translate-x-1/2 text-[clamp(1rem,1.8vw,1.45rem)] opacity-45">
            S
          </span>
          <span className="absolute left-[15.5%] top-1/2 -translate-y-1/2 text-[clamp(1rem,1.8vw,1.45rem)] opacity-45">
            W
          </span>
        </div>
      </div>
    </div>
  );
}

function CompassRose() {
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const angle = (i * 10 * Math.PI) / 180;
    const isMajor = i % 9 === 0;
    const isMinor = i % 3 === 0 && !isMajor;
    const r1 = 90;
    const r2 = isMajor ? 78 : isMinor ? 83 : 86;
    return (
      <line
        key={i}
        x1={100 + r1 * Math.sin(angle)}
        y1={100 - r1 * Math.cos(angle)}
        x2={100 + r2 * Math.sin(angle)}
        y2={100 - r2 * Math.cos(angle)}
        stroke="currentColor"
        strokeWidth={isMajor ? 1.6 : isMinor ? 0.8 : 0.4}
        opacity={isMajor ? 0.6 : isMinor ? 0.3 : 0.15}
      />
    );
  });

  return (
    <svg
      className="landing-rotate-slow h-full w-full text-primary"
      viewBox="0 0 200 200"
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
      <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.1" />
      {ticks}
      <polygon points="100,58 76,100 100,142 124,100" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.1" />
      <polygon points="100,48 93,100 107,100" fill="currentColor" opacity="0.85" />
      <polygon points="100,48 100,100 93,100" fill="currentColor" opacity="0.6" />
      <polygon points="100,152 93,100 107,100" fill="currentColor" opacity="0.3" />
      <polygon points="100,152 100,100 107,100" fill="currentColor" opacity="0.2" />
      <polygon points="152,100 100,93 100,107" fill="currentColor" opacity="0.3" />
      <polygon points="152,100 100,100 100,93" fill="currentColor" opacity="0.2" />
      <polygon points="48,100 100,93 100,107" fill="currentColor" opacity="0.3" />
      <polygon points="48,100 100,100 100,107" fill="currentColor" opacity="0.2" />
      <circle cx="100" cy="100" r="5" fill="currentColor" opacity="0.8" />
      <circle cx="100" cy="100" r="2.5" fill="var(--color-background)" />
    </svg>
  );
}

function PersonalPricingCard({
  billingCycle,
  onBillingCycleChange,
  monthlyLabel,
  yearlyLabel,
  ...cardProps
}: {
  billingCycle: BillingCycle;
  onBillingCycleChange: (billingCycle: BillingCycle) => void;
  monthlyLabel: string;
  yearlyLabel: string;
} & PricingCardProps) {
  return (
    <PricingCard
      {...cardProps}
      headerAction={
        <div className="grid w-fit grid-cols-2 rounded-md border border-border bg-muted p-0.5 text-xs">
          <button
            type="button"
            className={cn(
              "rounded-sm px-2.5 py-1 font-medium transition-colors",
              billingCycle === "yearly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onBillingCycleChange("yearly")}
          >
            {yearlyLabel}
          </button>
          <button
            type="button"
            className={cn(
              "rounded-sm px-2.5 py-1 font-medium transition-colors",
              billingCycle === "monthly"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onBillingCycleChange("monthly")}
          >
            {monthlyLabel}
          </button>
        </div>
      }
    />
  );
}

type PricingCardProps = {
  id?: string;
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
};

function PricingCard({
  id,
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
}: PricingCardProps) {
  const body = (
    <>
      <div className="flex h-8 items-start justify-between gap-3">
        <Icon className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        {headerAction}
      </div>
      <h3 className="mt-5 text-xl font-semibold">{title}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-6 flex items-end gap-2">
        <span className="text-4xl font-semibold">{price}</span>
        {suffix && <span className="pb-1 text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {savings && (
        <Badge variant={highlighted ? "success" : "secondary"} className="mt-4 w-fit rounded-md">
          {savings}
        </Badge>
      )}
      <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <article
      id={id}
      className={cn(
        "flex h-full rounded-lg border bg-card p-6 shadow-panel",
        highlighted ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
    >
      <div className="flex w-full flex-col">
        {body}
        <div className="mt-auto pt-8">
          {external ? (
            <a href={href} className={cn(buttonVariants({ variant: highlighted ? "default" : "outline" }), "w-full")}>
              {cta}
            </a>
          ) : (
            <Link to={href} className={cn(buttonVariants({ variant: highlighted ? "default" : "outline" }), "w-full")}>
              {cta}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function ClubMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-b border-border p-6 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-3xl font-semibold text-primary">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{label}</p>
    </div>
  );
}

function AppStoreBadge({ className = "h-[54px] w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 60" role="img" aria-label="Download on the App Store" className={className}>
      <rect x="0.75" y="0.75" width="178.5" height="58.5" rx="10.5" fill="#000" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.5" />
      <g transform="translate(18 13)" fill="#fff">
        <path d="M27.03 17.98c-.02-3.74 3.05-5.53 3.19-5.62-1.73-2.54-4.43-2.88-5.39-2.92-2.29-.23-4.48 1.35-5.64 1.35-1.18 0-2.96-1.32-4.88-1.28-2.5.04-4.82 1.45-6.1 3.69-2.6 4.5-.66 11.14 1.86 14.78 1.25 1.78 2.73 3.77 4.66 3.7 1.87-.07 2.58-1.21 4.85-1.21 2.25 0 2.9 1.21 4.89 1.17 2.02-.03 3.3-1.8 4.52-3.59 1.42-2.06 2-4.06 2.03-4.16-.04-.02-3.89-1.49-3.93-5.91zM23.34 7.05c1.03-1.25 1.73-2.98 1.54-4.72-1.49.06-3.3 1-4.37 2.25-.95 1.1-1.8 2.88-1.57 4.57 1.66.13 3.36-.84 4.4-2.1z" />
      </g>
      <g fill="#fff" fontFamily="-apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif">
        <text x="52" y="24" fontSize="10">Download on the</text>
        <text x="52" y="44" fontSize="19" fontWeight="600">App Store</text>
      </g>
    </svg>
  );
}

function GooglePlayBadge({ className = "h-[54px] w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 60" role="img" aria-label="Get it on Google Play" className={className}>
      <rect x="0.75" y="0.75" width="178.5" height="58.5" rx="10.5" fill="#000" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.5" />
      <g transform="translate(14 13)">
        <path d="M0.5 1.2v31.6c0 .6.3 1.1.7 1.4L18 17 1.2 0.2c-.4.3-.7.6-.7 1z" fill="#00A1FF" />
        <path d="M23.3 11.7L19.3 14 18 17l1.3 3 4 2.3 7-4c.9-.5.9-1.9 0-2.4l-7-3.2z" fill="#FFBD00" />
        <path d="M1.2 33.8c.5.4 1.2.4 1.9.1l20.2-11.6-4-4L1.2 33.8z" fill="#00A94F" />
        <path d="M3.1.1C2.4-.2 1.7-.2 1.2.2L19.3 20l4-4L3.1.1z" fill="#FF3A44" />
      </g>
      <g fill="#fff" fontFamily="Inter, Roboto, system-ui, sans-serif">
        <text x="54" y="24" fontSize="10">GET IT ON</text>
        <text x="54" y="44" fontSize="19" fontWeight="500">Google Play</text>
      </g>
    </svg>
  );
}
