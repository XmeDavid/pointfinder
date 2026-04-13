import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Compass,
  Smartphone,
  MapPin,
  Camera,
  Trophy,
  LayoutDashboard,
  Bell,
  WifiOff,
  Globe,
  ChevronDown,
  Settings,
  Radio,
  Sun,
  Moon,
  type LucideIcon,
} from "lucide-react";

const APP_STORE_COUNTRY: Record<string, string> = {
  "pointfinder.pt": "pt",
  "pointfinder.ch": "ch",
};

function appStoreUrl() {
  if (typeof window === "undefined") return "https://apps.apple.com/app/pointfinder/id6759060734";
  const country = APP_STORE_COUNTRY[window.location.hostname.toLowerCase()];
  const prefix = country ? `/${country}` : "";
  return `https://apps.apple.com${prefix}/app/pointfinder/id6759060734`;
}

/* =================================================================
   Scroll-reveal hook
   Observes all .scroll-reveal children within the container and
   adds .revealed once they enter the viewport (one-shot).
   ================================================================= */

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

/* =================================================================
   Animated compass rose (SVG)
   ================================================================= */

function CompassRose({ darkMode }: { darkMode: boolean }) {
  const stroke = darkMode ? "#22c55e" : "#156f68";
  const fillBright = darkMode ? "#16a34a" : "#156f68";
  const fillDim = darkMode ? "#0d5f2d" : "#0d4f48";
  const centerFill = darkMode ? "#060b06" : "#f4efe6";

  const ticks = Array.from({ length: 36 }, (_, i) => {
    const angle = (i * 10 * Math.PI) / 180;
    const isMajor = i % 9 === 0; // N E S W
    const isMinor = i % 3 === 0 && !isMajor; // 30-degree marks
    const r1 = 90;
    const r2 = isMajor ? 78 : isMinor ? 83 : 86;
    return (
      <line
        key={i}
        x1={100 + r1 * Math.sin(angle)}
        y1={100 - r1 * Math.cos(angle)}
        x2={100 + r2 * Math.sin(angle)}
        y2={100 - r2 * Math.cos(angle)}
        stroke={stroke}
        strokeWidth={isMajor ? 1.6 : isMinor ? 0.8 : 0.4}
        opacity={isMajor ? 0.6 : isMinor ? 0.3 : 0.15}
      />
    );
  });

  return (
    <div className="relative flex items-center justify-center">
      {/* Sonar pulse rings */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`absolute rounded-full landing-ping ${
            darkMode
              ? "border border-green-500/20"
              : "border border-teal-600/15"
          }`}
          style={{
            width: "100%",
            height: "100%",
            animationDelay: `${i * 1.5}s`,
          }}
        />
      ))}

      {/* Glow behind compass */}
      <div
        className={`absolute w-full h-full rounded-full blur-3xl scale-150 ${
          darkMode ? "bg-green-500/[0.04]" : "bg-teal-600/[0.06]"
        }`}
      />

      {/* Glass circle wrapper (light mode only) */}
      {!darkMode && (
        <div className="absolute inset-[-12%] rounded-full bg-white/30 backdrop-blur-md border border-white/30 shadow-[0_20px_60px_-20px_rgba(21,111,104,0.15)]" />
      )}

      <svg
        viewBox="0 0 200 200"
        className="relative w-52 h-52 md:w-72 md:h-72 lg:w-80 lg:h-80 landing-rotate-slow"
        aria-hidden="true"
      >
        {/* Outer rings */}
        <circle
          cx="100" cy="100" r="96"
          fill="none" stroke={stroke} strokeWidth="0.5" opacity="0.15"
        />
        <circle
          cx="100" cy="100" r="90"
          fill="none" stroke={stroke} strokeWidth="0.4" opacity="0.1"
        />

        {/* Tick marks */}
        {ticks}

        {/* Cardinal labels */}
        <text x="100" y="40" textAnchor="middle" fill={stroke} fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif" opacity="0.7">N</text>
        <text x="100" y="170" textAnchor="middle" fill={stroke} fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif" opacity="0.45">S</text>
        <text x="33" y="104" textAnchor="middle" fill={stroke} fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif" opacity="0.45">W</text>
        <text x="167" y="104" textAnchor="middle" fill={stroke} fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif" opacity="0.45">E</text>

        {/* Intercardinal diamond */}
        <polygon
          points="100,58 76,100 100,142 124,100"
          fill="none" stroke={stroke} strokeWidth="0.5" opacity="0.1"
        />

        {/* Rose – North (bright) */}
        <polygon points="100,48 93,100 107,100" fill={fillBright} opacity="0.85" />
        <polygon points="100,48 100,100 93,100" fill={stroke} opacity="0.6" />

        {/* Rose – South (dim) */}
        <polygon points="100,152 93,100 107,100" fill={fillBright} opacity="0.3" />
        <polygon points="100,152 100,100 107,100" fill={fillDim} opacity="0.2" />

        {/* Rose – East */}
        <polygon points="152,100 100,93 100,107" fill={fillBright} opacity="0.3" />
        <polygon points="152,100 100,100 100,93" fill={stroke} opacity="0.2" />

        {/* Rose – West */}
        <polygon points="48,100 100,93 100,107" fill={fillBright} opacity="0.3" />
        <polygon points="48,100 100,100 100,107" fill={stroke} opacity="0.2" />

        {/* Centre */}
        <circle cx="100" cy="100" r="5" fill={stroke} opacity="0.8" />
        <circle cx="100" cy="100" r="2.5" fill={centerFill} />
      </svg>
    </div>
  );
}

/* =================================================================
   Section divider (waypoint on a line)
   ================================================================= */

function SectionDivider() {
  return (
    <div className="flex items-center justify-center py-10 md:py-14">
      <div className="h-px w-20 bg-gradient-to-r from-transparent dark:to-green-500/20 to-teal-600/20" />
      <div className="mx-3 h-2.5 w-2.5 rounded-full dark:border-green-500/25 dark:bg-green-500/10 border border-teal-600/25 bg-teal-600/10" />
      <div className="h-px w-20 bg-gradient-to-l from-transparent dark:to-green-500/20 to-teal-600/20" />
    </div>
  );
}

/* =================================================================
   Navigation bar
   ================================================================= */

function Navbar({ darkMode, onToggleTheme }: { darkMode: boolean; onToggleTheme: () => void }) {
  const { t } = useTranslation();

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-[14px] ${
        darkMode
          ? "border-white/[0.04] bg-[rgba(6,11,6,0.82)]"
          : "border-[rgba(40,56,48,0.08)] bg-white/75"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
            darkMode ? "border-green-500/20 bg-green-500/10" : "border-teal-600/25 bg-teal-600/10"
          }`}>
            <Compass className={`h-4 w-4 ${darkMode ? "text-green-500" : "text-teal-700"}`} />
          </div>
          <span className={`font-semibold tracking-tight ${darkMode ? "text-white" : "text-[#1e2e28]"}`}>PointFinder</span>
        </Link>

        <div className="flex items-center gap-4">
          <button
            onClick={onToggleTheme}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors duration-200 ${
              darkMode
                ? "border-white/[0.08] text-white/40 hover:text-white/70"
                : "border-[rgba(40,56,48,0.1)] text-[#1e2e28]/40 hover:text-[#1e2e28]/70"
            }`}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          <Link
            to="/login"
            className={`text-sm font-medium transition-colors duration-200 ${
              darkMode ? "text-green-400/70 hover:text-green-400" : "text-teal-700/70 hover:text-teal-700"
            }`}
          >
            {t("landing.nav.operatorLogin")}
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* =================================================================
   Scroll hint – fades out once the user starts scrolling
   ================================================================= */

function ScrollHint({ label }: { label: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY < 50);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="landing-fade-in absolute bottom-8 left-1/2 -translate-x-1/2 transition-opacity duration-500"
      style={{ animationDelay: "1.6s", opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
    >
      <div className="flex flex-col items-center gap-1.5 dark:text-white/20 text-[#1e2e28]/30">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em]">{label}</span>
        <ChevronDown className="h-4 w-4 landing-bounce" />
      </div>
    </div>
  );
}

/* =================================================================
   Hero
   ================================================================= */

const heroWaypoints = [
  { x: 8, y: 22, s: 3, o: 0.14, d: 0 },
  { x: 88, y: 14, s: 2, o: 0.1, d: 2 },
  { x: 14, y: 74, s: 2.5, o: 0.12, d: 4 },
  { x: 92, y: 62, s: 2, o: 0.1, d: 1 },
  { x: 50, y: 90, s: 2, o: 0.08, d: 3 },
  { x: 74, y: 80, s: 1.5, o: 0.09, d: 5 },
  { x: 30, y: 12, s: 1.5, o: 0.07, d: 6 },
];

function Hero({ darkMode }: { darkMode: boolean }) {
  const { t } = useTranslation();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-20">
      {/* Background: grid + radial glow */}
      {darkMode ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: [
              "radial-gradient(circle at 50% 42%, rgba(22,163,74,0.09) 0%, transparent 55%)",
              "linear-gradient(rgba(22,163,74,0.03) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(22,163,74,0.03) 1px, transparent 1px)",
            ].join(","),
            backgroundSize: "100% 100%, 60px 60px, 60px 60px",
          }}
        />
      ) : (
        <>
          {/* Warm beige radial accents */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: [
                "radial-gradient(ellipse at 15% 20%, rgba(21,111,104,0.07) 0%, transparent 45%)",
                "radial-gradient(ellipse at 85% 75%, rgba(180,140,80,0.06) 0%, transparent 40%)",
                "radial-gradient(circle at 50% 42%, rgba(21,111,104,0.05) 0%, transparent 55%)",
              ].join(","),
            }}
          />
          {/* Subtle dot grid texture */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(21,111,104,0.25) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        </>
      )}

      {/* Floating waypoint dots */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {heroWaypoints.map((wp, i) => (
          <div
            key={i}
            className="absolute landing-float"
            style={{ left: `${wp.x}%`, top: `${wp.y}%`, animationDelay: `${wp.d}s` }}
          >
            <div
              className={`rounded-full ${darkMode ? "bg-green-500" : "bg-teal-600"}`}
              style={{ width: wp.s * 4, height: wp.s * 4, opacity: darkMode ? wp.o : wp.o * 0.7 }}
            />
            <div
              className={`absolute rounded-full border ${darkMode ? "border-green-500" : "border-teal-600"}`}
              style={{ inset: -(wp.s * 2.5), opacity: (darkMode ? wp.o : wp.o * 0.7) * 0.4 }}
            />
          </div>
        ))}
      </div>

      {/* Compass */}
      <div className="landing-fade-in mb-10" style={{ animationDelay: "0.2s" }}>
        <CompassRose darkMode={darkMode} />
      </div>

      {/* Title */}
      <h1
        className="landing-fade-in mb-5 text-center text-5xl font-bold tracking-tight md:text-7xl lg:text-8xl"
        style={{
          animationDelay: "0.5s",
          background: darkMode
            ? "linear-gradient(135deg, #4ade80 0%, #22c55e 35%, #16a34a 65%, #15803d 100%)"
            : "linear-gradient(135deg, #156f68 0%, #1a8a82 35%, #156f68 65%, #0e4e49 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        PointFinder
      </h1>

      {/* Tagline */}
      <p
        className={`landing-fade-in max-w-lg text-center text-base leading-relaxed md:text-lg ${
          darkMode ? "text-white/45" : "text-[#1e2e28]/55"
        }`}
        style={{ animationDelay: "0.8s" }}
      >
        {t("landing.hero.tagline")}
      </p>

      {/* Store badges */}
      <div className="landing-fade-in mt-10 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "1.1s" }}>
        <StoreBadge darkMode={darkMode} icon={<AppleLogo />} label={t("landing.hero.appStore")} availableOn={t("landing.hero.availableOn")} href={appStoreUrl()} />
        <StoreBadge darkMode={darkMode} icon={<PlayLogo />} label={t("landing.hero.googlePlay")} availableOn={t("landing.hero.availableOn")} href="https://play.google.com/store/apps/details?id=com.prayer.pointfinder" />
      </div>

      {/* Scroll hint */}
      <ScrollHint label={t("landing.hero.scroll")} />
    </section>
  );
}

/* Store badge helpers */

function StoreBadge({ icon, label, availableOn, href, darkMode }: { icon: React.ReactNode; label: string; availableOn: string; href?: string; darkMode: boolean }) {
  const className = darkMode
    ? "flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-5 py-2.5 text-sm text-white/35 transition-colors duration-200 hover:border-green-500/20 hover:bg-white/[0.05]"
    : "flex items-center gap-2.5 rounded-xl border border-[rgba(21,111,104,0.15)] bg-white/70 backdrop-blur-sm px-5 py-2.5 text-sm text-[#1e2e28]/50 transition-colors duration-200 hover:border-teal-600/25 hover:bg-white/85 shadow-[0_2px_12px_rgba(21,111,104,0.08)]";

  const content = (
    <>
      {icon}
      <div className="flex flex-col">
        <span className={`text-[9px] uppercase tracking-wider ${darkMode ? "text-white/25" : "text-[#1e2e28]/35"}`}>{availableOn}</span>
        <span className="font-medium leading-tight">{label}</span>
      </div>
    </>
  );

  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>;
  }
  return <div className={className}>{content}</div>;
}

function AppleLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 21.99 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 21.99C7.79 22.03 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
    </svg>
  );
}

function PlayLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.15L13.69 12L3.84 21.85C3.34 21.61 3 21.09 3 20.5M16.81 15.12L6.05 21.34L14.54 12.85L16.81 15.12M20.16 10.81C20.5 11.08 20.75 11.5 20.75 12C20.75 12.5 20.53 12.9 20.18 13.18L17.89 14.5L15.39 12L17.89 9.5L20.16 10.81M6.05 2.66L16.81 8.88L14.54 11.15L6.05 2.66Z" />
    </svg>
  );
}

/* =================================================================
   How It Works
   ================================================================= */

const steps: { num: string; icon: LucideIcon; titleKey: string; bodyKey: string }[] = [
  { num: "01", icon: Settings, titleKey: "landing.howItWorks.step1Title", bodyKey: "landing.howItWorks.step1Body" },
  { num: "02", icon: Smartphone, titleKey: "landing.howItWorks.step2Title", bodyKey: "landing.howItWorks.step2Body" },
  { num: "03", icon: LayoutDashboard, titleKey: "landing.howItWorks.step3Title", bodyKey: "landing.howItWorks.step3Body" },
];

function HowItWorks({ darkMode }: { darkMode: boolean }) {
  const { t } = useTranslation();

  return (
    <section className="relative px-6 py-20 md:py-28">
      <div className="mx-auto max-w-5xl">
        {/* Heading */}
        <div className="scroll-reveal mb-16 text-center">
          <span className={`mb-3 block text-xs font-medium uppercase tracking-[0.2em] ${darkMode ? "text-green-500/70" : "text-teal-700/70"}`}>
            {t("landing.howItWorks.label")}
          </span>
          <h2 className={`text-3xl font-bold md:text-4xl ${darkMode ? "text-white" : "text-[#1e2e28]"}`}>
            {t("landing.howItWorks.title")}
          </h2>
        </div>

        {/* Steps */}
        <div className="relative grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-6">
          {/* Connector (desktop) */}
          <div className={`pointer-events-none absolute left-[calc(16.67%+28px)] right-[calc(16.67%+28px)] top-[36px] hidden h-px border-t border-dashed md:block ${darkMode ? "border-green-500/[0.12]" : "border-teal-600/[0.18]"}`} />

          {steps.map((step, i) => (
            <div
              key={step.num}
              className="scroll-reveal relative flex flex-col items-center text-center"
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              {/* Icon circle */}
              <div className="relative z-10 mb-6">
                <div className={`flex h-[72px] w-[72px] items-center justify-center rounded-full ${
                  darkMode
                    ? "border border-green-500/15 bg-green-500/[0.04]"
                    : "border border-teal-600/15 bg-white/70 backdrop-blur-sm shadow-[0_8px_24px_rgba(21,111,104,0.1)]"
                }`}>
                  <step.icon className={`h-7 w-7 ${darkMode ? "text-green-500/60" : "text-teal-700/60"}`} aria-hidden="true" />
                </div>
                <span className={`absolute -right-1.5 -top-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  darkMode
                    ? "border-green-500/10 bg-[#060b06] text-green-500/50"
                    : "border-teal-600/15 bg-[#f4efe6] text-teal-700/50"
                }`}>
                  {step.num}
                </span>
              </div>

              <h3 className={`mb-3 text-lg font-semibold ${darkMode ? "text-white" : "text-[#1e2e28]"}`}>{t(step.titleKey)}</h3>
              <p className={`max-w-xs text-sm leading-relaxed ${darkMode ? "text-white/35" : "text-[#1e2e28]/55"}`}>{t(step.bodyKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   Features – bento grid
   ================================================================= */

const features: { id: string; icon: LucideIcon; titleKey: string; bodyKey: string; span: string; large?: boolean }[] = [
  { id: "nfc", icon: Radio, titleKey: "landing.features.nfcTitle", bodyKey: "landing.features.nfcBody", span: "md:col-span-2 md:row-span-2", large: true },
  { id: "maps", icon: MapPin, titleKey: "landing.features.mapsTitle", bodyKey: "landing.features.mapsBody", span: "" },
  { id: "challenges", icon: Camera, titleKey: "landing.features.challengesTitle", bodyKey: "landing.features.challengesBody", span: "" },
  { id: "leaderboard", icon: Trophy, titleKey: "landing.features.leaderboardTitle", bodyKey: "landing.features.leaderboardBody", span: "" },
  { id: "dashboard", icon: LayoutDashboard, titleKey: "landing.features.dashboardTitle", bodyKey: "landing.features.dashboardBody", span: "md:col-span-2" },
  { id: "push", icon: Bell, titleKey: "landing.features.pushTitle", bodyKey: "landing.features.pushBody", span: "" },
  { id: "offline", icon: WifiOff, titleKey: "landing.features.offlineTitle", bodyKey: "landing.features.offlineBody", span: "" },
  { id: "i18n", icon: Globe, titleKey: "landing.features.multiLangTitle", bodyKey: "landing.features.multiLangBody", span: "" },
];

function Features({ darkMode }: { darkMode: boolean }) {
  const { t } = useTranslation();

  return (
    <section className="relative px-6 py-20 md:py-28">
      <div className="mx-auto max-w-5xl">
        {/* Heading */}
        <div className="scroll-reveal mb-16 text-center">
          <span className={`mb-3 block text-xs font-medium uppercase tracking-[0.2em] ${darkMode ? "text-green-500/70" : "text-teal-700/70"}`}>
            {t("landing.features.label")}
          </span>
          <h2 className={`text-3xl font-bold md:text-4xl ${darkMode ? "text-white" : "text-[#1e2e28]"}`}>
            {t("landing.features.title")}
          </h2>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.id}
              className={`scroll-reveal group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 ${f.span} ${f.large ? "flex flex-col justify-between" : ""} ${
                darkMode
                  ? "border border-white/[0.06] bg-white/[0.015] hover:border-green-500/[0.14] hover:bg-green-500/[0.015]"
                  : "border border-white/65 bg-white/70 backdrop-blur-xl hover:border-teal-600/20 hover:bg-white/85 shadow-[0_20px_50px_-20px_rgba(29,46,38,0.1)]"
              }`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              {/* Icon */}
              <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors duration-300 ${
                darkMode
                  ? "border-green-500/10 bg-green-500/[0.06] group-hover:bg-green-500/[0.1]"
                  : "border-teal-600/15 bg-teal-600/[0.06] group-hover:bg-teal-600/[0.1]"
              }`}>
                <f.icon className={`h-5 w-5 ${darkMode ? "text-green-500/60" : "text-teal-700/60"}`} aria-hidden="true" />
              </div>

              <h3 className={`mb-2 font-semibold ${f.large ? "text-xl" : "text-base"} ${darkMode ? "text-white" : "text-[#1e2e28]"}`}>
                {t(f.titleKey)}
              </h3>
              <p className={`leading-relaxed ${f.large ? "max-w-md text-[15px]" : "text-sm"} ${darkMode ? "text-white/35" : "text-[#1e2e28]/55"}`}>
                {t(f.bodyKey)}
              </p>

              {/* Decorative corner arcs on the hero card */}
              {f.large && (
                <div className="pointer-events-none absolute -right-6 -top-6 opacity-[0.025]">
                  <svg width="160" height="160" viewBox="0 0 160 160" fill="none" aria-hidden="true">
                    <circle cx="120" cy="40" r="100" stroke={darkMode ? "#22c55e" : "#156f68"} strokeWidth="0.8" />
                    <circle cx="120" cy="40" r="70" stroke={darkMode ? "#22c55e" : "#156f68"} strokeWidth="0.6" />
                    <circle cx="120" cy="40" r="40" stroke={darkMode ? "#22c55e" : "#156f68"} strokeWidth="0.4" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   Platform showcase – device mockups
   ================================================================= */

function PhoneMockup({ label, children, darkMode }: { label: string; children: React.ReactNode; darkMode: boolean }) {
  return (
    <div className="scroll-reveal flex flex-col items-center gap-5">
      <div className={`relative w-[190px] rounded-[2.5rem] border-2 p-3 shadow-2xl ${
        darkMode
          ? "border-white/[0.07] bg-[#0a120a] shadow-black/50"
          : "border-[rgba(21,111,104,0.12)] bg-white/80 shadow-[rgba(21,111,104,0.15)]"
      }`}>
        {/* Notch */}
        <div className={`relative z-10 mx-auto h-5 w-20 rounded-b-2xl ${darkMode ? "bg-[#060b06]" : "bg-[#f0ebe2]"}`} />
        {/* Screen */}
        <div className={`mt-1 overflow-hidden rounded-[1.8rem] ${darkMode ? "bg-[#0d1a0d]" : "bg-[#f8f5f0]"}`} style={{ aspectRatio: "9/17" }}>
          {children}
        </div>
        {/* Home indicator */}
        <div className={`mx-auto mt-2 h-1 w-10 rounded-full ${darkMode ? "bg-white/[0.06]" : "bg-[#1e2e28]/[0.08]"}`} />
      </div>
      <span className={`text-sm font-medium ${darkMode ? "text-white/35" : "text-[#1e2e28]/45"}`}>{label}</span>
    </div>
  );
}

function DesktopMockup({ label, children, darkMode }: { label: string; children: React.ReactNode; darkMode: boolean }) {
  return (
    <div className="scroll-reveal flex flex-col items-center gap-3">
      <div className={`w-[310px] overflow-hidden rounded-xl border-2 shadow-2xl md:w-[400px] ${
        darkMode
          ? "border-white/[0.07] bg-[#0a120a] shadow-black/50"
          : "border-[rgba(21,111,104,0.12)] bg-white/80 shadow-[rgba(21,111,104,0.15)]"
      }`}>
        {/* Title bar */}
        <div className={`flex items-center gap-1.5 border-b px-4 py-2.5 ${darkMode ? "border-white/[0.04] bg-[#080f08]" : "border-[rgba(21,111,104,0.08)] bg-[#f0ebe2]"}`}>
          <div className={`h-2.5 w-2.5 rounded-full ${darkMode ? "bg-white/[0.08]" : "bg-[#1e2e28]/[0.08]"}`} />
          <div className={`h-2.5 w-2.5 rounded-full ${darkMode ? "bg-white/[0.08]" : "bg-[#1e2e28]/[0.08]"}`} />
          <div className={`h-2.5 w-2.5 rounded-full ${darkMode ? "bg-white/[0.08]" : "bg-[#1e2e28]/[0.08]"}`} />
          <div className={`ml-4 h-3.5 max-w-[160px] flex-1 rounded ${darkMode ? "bg-white/[0.03]" : "bg-[#1e2e28]/[0.04]"}`} />
        </div>
        {/* Content */}
        <div className={`min-h-[200px] p-4 md:min-h-[240px] ${darkMode ? "bg-[#0d1a0d]" : "bg-[#f8f5f0]"}`}>{children}</div>
      </div>
      {/* Stand */}
      <div className={`-mt-2 h-1.5 w-14 rounded-b ${darkMode ? "bg-white/[0.04]" : "bg-[#1e2e28]/[0.05]"}`} />
      <span className={`-mt-1 text-sm font-medium ${darkMode ? "text-white/35" : "text-[#1e2e28]/45"}`}>{label}</span>
    </div>
  );
}

/* Miniature UI placeholders for inside the device screens */

function ScreenMap({ darkMode }: { darkMode: boolean }) {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {/* Map area */}
      <div
        className={`relative flex-1 overflow-hidden rounded-xl border ${
          darkMode ? "border-green-500/[0.06] bg-green-500/[0.03]" : "border-teal-600/[0.08] bg-teal-600/[0.02]"
        }`}
        style={{
          backgroundImage: darkMode
            ? "linear-gradient(rgba(22,163,74,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(22,163,74,0.04) 1px, transparent 1px)"
            : "linear-gradient(rgba(21,111,104,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(21,111,104,0.04) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <div className={`absolute left-[38%] top-[28%] h-2 w-2 rounded-full ${darkMode ? "bg-green-500/30" : "bg-teal-600/30"}`} />
        <div className={`absolute left-[62%] top-[45%] h-2 w-2 rounded-full ${darkMode ? "bg-green-500/20" : "bg-teal-600/20"}`} />
        <div className={`absolute left-[28%] top-[62%] h-2 w-2 rounded-full ${darkMode ? "bg-green-500/25" : "bg-teal-600/25"}`} />
        <div className="absolute left-[52%] top-[72%] h-1.5 w-1.5 rounded-full bg-blue-400/25" />
        <div className="absolute left-[72%] top-[30%] h-1.5 w-1.5 rounded-full bg-blue-400/20" />
      </div>
      {/* Bottom bar */}
      <div className="flex gap-2">
        <div className={`h-7 flex-1 rounded-lg border ${darkMode ? "border-green-500/[0.07] bg-green-500/[0.04]" : "border-teal-600/[0.1] bg-teal-600/[0.03]"}`} />
        <div className={`h-7 w-7 rounded-lg border ${darkMode ? "border-green-500/[0.07] bg-green-500/[0.04]" : "border-teal-600/[0.1] bg-teal-600/[0.03]"}`} />
      </div>
    </div>
  );
}

function ScreenNfc({ darkMode }: { darkMode: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-4">
      {/* NFC visual */}
      <div className="relative">
        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${
          darkMode ? "border-green-500/[0.1] bg-green-500/[0.06]" : "border-teal-600/[0.12] bg-teal-600/[0.04]"
        }`}>
          <Smartphone className={`h-7 w-7 ${darkMode ? "text-green-500/40" : "text-teal-600/40"}`} />
        </div>
        <div className={`absolute -inset-3 rounded-2xl border landing-ping ${darkMode ? "border-green-500/[0.05]" : "border-teal-600/[0.06]"}`} style={{ animationDuration: "3s" }} />
        <div className={`absolute -inset-6 rounded-3xl border landing-ping ${darkMode ? "border-green-500/[0.03]" : "border-teal-600/[0.04]"}`} style={{ animationDuration: "3s", animationDelay: "1s" }} />
      </div>
      {/* Text placeholders */}
      <div className="text-center">
        <div className={`mx-auto mb-2 h-2 w-16 rounded ${darkMode ? "bg-white/[0.07]" : "bg-[#1e2e28]/[0.07]"}`} />
        <div className={`mx-auto h-1.5 w-24 rounded ${darkMode ? "bg-white/[0.04]" : "bg-[#1e2e28]/[0.04]"}`} />
      </div>
      {/* Card */}
      <div className={`mt-auto w-full rounded-xl border p-3 ${
        darkMode ? "border-green-500/[0.06] bg-green-500/[0.03]" : "border-teal-600/[0.08] bg-teal-600/[0.02]"
      }`}>
        <div className={`mb-2 h-1.5 w-14 rounded ${darkMode ? "bg-green-500/15" : "bg-teal-600/15"}`} />
        <div className={`mb-1.5 h-1.5 w-full rounded ${darkMode ? "bg-white/[0.04]" : "bg-[#1e2e28]/[0.04]"}`} />
        <div className={`h-1.5 w-3/4 rounded ${darkMode ? "bg-white/[0.03]" : "bg-[#1e2e28]/[0.03]"}`} />
      </div>
    </div>
  );
}

function ScreenDashboard({ darkMode }: { darkMode: boolean }) {
  return (
    <div className="flex gap-3">
      {/* Sidebar */}
      <div className="flex w-10 flex-col gap-2 py-1">
        {[true, false, false, false, false].map((active, i) => (
          <div key={i} className={`h-1.5 rounded ${
            active
              ? darkMode ? "bg-green-500/20" : "bg-teal-600/20"
              : darkMode ? "bg-white/[0.04]" : "bg-[#1e2e28]/[0.04]"
          }`} />
        ))}
      </div>
      {/* Main */}
      <div className="flex flex-1 flex-col gap-3">
        {/* Stat cards */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`flex-1 rounded-lg border p-2 ${
              darkMode ? "border-white/[0.04] bg-white/[0.02]" : "border-[#1e2e28]/[0.05] bg-[#1e2e28]/[0.015]"
            }`}>
              <div className={`mb-1.5 h-1 w-5 rounded ${darkMode ? "bg-green-500/15" : "bg-teal-600/15"}`} />
              <div className={`h-2 w-8 rounded ${darkMode ? "bg-white/[0.06]" : "bg-[#1e2e28]/[0.06]"}`} />
            </div>
          ))}
        </div>
        {/* Table */}
        <div className="flex flex-col gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
              darkMode ? "border-white/[0.03] bg-white/[0.015]" : "border-[#1e2e28]/[0.04] bg-[#1e2e28]/[0.01]"
            }`}>
              <div className={`h-1.5 w-1.5 rounded-full ${darkMode ? "bg-green-500/15" : "bg-teal-600/15"}`} />
              <div className={`h-1 flex-1 rounded ${darkMode ? "bg-white/[0.04]" : "bg-[#1e2e28]/[0.04]"}`} />
              <div className={`h-1 w-6 rounded ${darkMode ? "bg-white/[0.03]" : "bg-[#1e2e28]/[0.03]"}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Platforms({ darkMode }: { darkMode: boolean }) {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <div className="scroll-reveal mb-16 text-center">
          <span className={`mb-3 block text-xs font-medium uppercase tracking-[0.2em] ${darkMode ? "text-green-500/70" : "text-teal-700/70"}`}>
            {t("landing.platforms.label")}
          </span>
          <h2 className={`text-3xl font-bold md:text-4xl ${darkMode ? "text-white" : "text-[#1e2e28]"}`}>
            {t("landing.platforms.title")}
          </h2>
          <p className={`mx-auto mt-4 max-w-md text-sm md:text-base ${darkMode ? "text-white/35" : "text-[#1e2e28]/55"}`}>
            {t("landing.platforms.description")}
          </p>
        </div>

        {/* Device row */}
        <div className="flex flex-col items-center justify-center gap-10 md:flex-row md:items-end md:gap-12">
          <PhoneMockup darkMode={darkMode} label={t("landing.platforms.ios")}>
            <ScreenMap darkMode={darkMode} />
          </PhoneMockup>

          <DesktopMockup darkMode={darkMode} label={t("landing.platforms.webAdmin")}>
            <ScreenDashboard darkMode={darkMode} />
          </DesktopMockup>

          <PhoneMockup darkMode={darkMode} label={t("landing.platforms.android")}>
            <ScreenNfc darkMode={darkMode} />
          </PhoneMockup>
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   Pricing
   ================================================================= */

function CheckIcon({ darkMode }: { darkMode: boolean }) {
  const stroke = darkMode ? "#22c55e" : "#156f68";
  return (
    <svg className={`h-4 w-4 shrink-0 ${darkMode ? "text-green-500/70" : "text-teal-700/70"}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" stroke={stroke} strokeOpacity="0.2" />
      <path d="M4.5 8.5l2.5 2.5 4.5-5" stroke={stroke} strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Pricing({ darkMode }: { darkMode: boolean }) {
  const { t } = useTranslation();

  const freeFeatures = [
    t("landing.pricing.activeGame"),
    t("landing.pricing.basesPerGame"),
    t("landing.pricing.soloOperator"),
    t("landing.pricing.fileUploads100"),
  ];

  const proFeatures = [
    t("landing.pricing.unlimitedGames"),
    t("landing.pricing.unlimitedBases"),
    t("landing.pricing.fiveOperators"),
    t("landing.pricing.fileUploads2g"),
    t("landing.pricing.sharedResources"),
  ];

  const orgFeatures = [
    t("landing.pricing.fifteenMembers"),
    t("landing.pricing.orgResources"),
    t("landing.pricing.collaborative"),
    t("landing.pricing.tenLiveGames"),
    t("landing.pricing.customDeals"),
  ];

  const cardBase = darkMode
    ? "flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.03] p-7"
    : "flex flex-col rounded-2xl border border-white/65 bg-white/70 backdrop-blur-xl p-7 shadow-[0_20px_50px_-20px_rgba(29,46,38,0.12)]";

  const featureText = darkMode ? "text-white/50" : "text-[#1e2e28]/55";
  const priceText = darkMode ? "text-white" : "text-[#1e2e28]";
  const labelText = darkMode ? "text-green-500/60" : "text-teal-700/60";
  const descText = darkMode ? "text-white/30" : "text-[#1e2e28]/40";
  const btnSecondary = darkMode
    ? "mt-auto block rounded-xl border border-white/[0.07] bg-white/[0.03] px-5 py-2.5 text-center text-sm font-medium text-white/60 transition-colors duration-200 hover:border-green-500/20 hover:bg-white/[0.06]"
    : "mt-auto block rounded-xl border border-[rgba(21,111,104,0.18)] bg-white/50 px-5 py-2.5 text-center text-sm font-medium text-[#1e2e28]/60 transition-colors duration-200 hover:border-teal-600/30 hover:bg-white/70";

  return (
    <section className="relative px-6 py-20 md:py-28">
      <div className="mx-auto max-w-5xl">
        {/* Heading */}
        <div className="scroll-reveal mb-16 text-center">
          <span className={`mb-3 block text-xs font-medium uppercase tracking-[0.2em] ${darkMode ? "text-green-500/70" : "text-teal-700/70"}`}>
            {t("landing.pricing.label")}
          </span>
          <h2 className={`text-3xl font-bold md:text-4xl ${darkMode ? "text-white" : "text-[#1e2e28]"}`}>
            {t("landing.pricing.title")}
          </h2>
          <p className={`mx-auto mt-4 max-w-md text-sm md:text-base ${darkMode ? "text-white/35" : "text-[#1e2e28]/55"}`}>
            {t("landing.pricing.description")}
          </p>
        </div>

        {/* Cards */}
        <div className="scroll-reveal grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Free */}
          <div className={cardBase}>
            <div className="mb-6">
              <p className={`mb-1 text-sm font-medium uppercase tracking-widest ${labelText}`}>{t("landing.pricing.free")}</p>
              <p className={`mb-3 text-xs ${descText}`}>{t("landing.pricing.freeDesc")}</p>
              <p className={`text-4xl font-bold ${priceText}`}>€0</p>
            </div>
            <ul className="mb-8 flex flex-col gap-3">
              {freeFeatures.map((f) => (
                <li key={f} className={`flex items-center gap-2.5 text-sm ${featureText}`}>
                  <CheckIcon darkMode={darkMode} />
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/register" className={btnSecondary}>
              {t("landing.pricing.getStarted")}
            </Link>
          </div>

          {/* Pro – highlighted */}
          <div className={`relative flex flex-col rounded-2xl p-7 ${
            darkMode
              ? "border border-green-500/30 bg-white/[0.03] shadow-[0_0_40px_rgba(34,197,94,0.04)]"
              : "border border-teal-600/30 bg-white/80 backdrop-blur-xl shadow-[0_28px_70px_-38px_rgba(21,111,104,0.3)]"
          }`}>
            {/* Recommended badge */}
            <span className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              darkMode
                ? "border-green-500/20 bg-green-500/10 text-green-400/80"
                : "border-teal-600/20 bg-teal-600/10 text-teal-700/80"
            }`}>
              {t("landing.pricing.recommended")}
            </span>
            <div className="mb-6">
              <p className={`mb-1 text-sm font-medium uppercase tracking-widest ${labelText}`}>{t("landing.pricing.pro")}</p>
              <p className={`mb-3 text-xs ${descText}`}>{t("landing.pricing.proDesc")}</p>
              <div className="flex items-baseline gap-1">
                <p className={`text-4xl font-bold ${priceText}`}>€0.99</p>
                <span className={`text-sm ${descText}`}>/{t("landing.pricing.proMonthly")}</span>
              </div>
              <p className={`mt-1 text-xs ${darkMode ? "text-white/25" : "text-[#1e2e28]/30"}`}>€9.99{t("landing.pricing.perYear")}</p>
            </div>
            <ul className="mb-8 flex flex-col gap-3">
              {proFeatures.map((f) => (
                <li key={f} className={`flex items-center gap-2.5 text-sm ${featureText}`}>
                  <CheckIcon darkMode={darkMode} />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/register"
              className={`mt-auto block rounded-xl border px-5 py-2.5 text-center text-sm font-medium transition-colors duration-200 ${
                darkMode
                  ? "border-green-500/30 bg-green-500/[0.08] text-green-400 hover:bg-green-500/[0.14]"
                  : "border-teal-600/30 bg-teal-600/[0.08] text-teal-700 hover:bg-teal-600/[0.14]"
              }`}
            >
              {t("landing.pricing.startPro")}
            </Link>
          </div>

          {/* Organizations */}
          <div className={cardBase}>
            <div className="mb-6">
              <p className={`mb-1 text-sm font-medium uppercase tracking-widest ${labelText}`}>{t("landing.pricing.org")}</p>
              <p className={`mb-3 text-xs ${descText}`}>{t("landing.pricing.orgDesc")}</p>
              <div>
                <p className={`text-xs ${descText}`}>{t("landing.pricing.orgStartingAt")}</p>
                <p className={`text-4xl font-bold ${priceText}`}>€25{t("landing.pricing.perYear")}</p>
              </div>
            </div>
            <ul className="mb-6 flex flex-col gap-3">
              {orgFeatures.map((f) => (
                <li key={f} className={`flex items-center gap-2.5 text-sm ${featureText}`}>
                  <CheckIcon darkMode={darkMode} />
                  {f}
                </li>
              ))}
            </ul>
            <p className={`mb-6 text-[11px] leading-relaxed ${darkMode ? "text-white/20" : "text-[#1e2e28]/30"}`}>{t("landing.pricing.orgDetails")}</p>
            <Link to="/register" className={btnSecondary}>
              {t("landing.pricing.createOrg")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   Footer
   ================================================================= */

function Footer({ darkMode }: { darkMode: boolean }) {
  const { t } = useTranslation();

  return (
    <footer className={`border-t px-6 py-12 ${darkMode ? "border-white/[0.04]" : "border-[rgba(40,56,48,0.08)]"}`}>
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
            darkMode ? "border-green-500/20 bg-green-500/10" : "border-teal-600/25 bg-teal-600/10"
          }`}>
            <Compass className={`h-4 w-4 ${darkMode ? "text-green-500" : "text-teal-700"}`} />
          </div>
          <div>
            <span className={`block text-sm font-semibold ${darkMode ? "text-white" : "text-[#1e2e28]"}`}>PointFinder</span>
            <span className={`block text-xs ${darkMode ? "text-white/25" : "text-[#1e2e28]/35"}`}>{t("landing.footer.tagline")}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <Link
            to="/faq"
            className={`transition-colors duration-200 ${darkMode ? "text-white/25 hover:text-green-400" : "text-[#1e2e28]/30 hover:text-teal-700"}`}
          >
            {t("faq.label")}
          </Link>
          <Link
            to="/privacy"
            className={`transition-colors duration-200 ${darkMode ? "text-white/25 hover:text-green-400" : "text-[#1e2e28]/30 hover:text-teal-700"}`}
          >
            {t("landing.footer.privacyPolicy")}
          </Link>
          <Link
            to="/login"
            className={`transition-colors duration-200 ${darkMode ? "text-white/25 hover:text-green-400" : "text-[#1e2e28]/30 hover:text-teal-700"}`}
          >
            {t("landing.footer.operatorLogin")} &rarr;
          </Link>
        </div>

        <span className={`text-xs ${darkMode ? "text-white/15" : "text-[#1e2e28]/25"}`}>
          {t("landing.footer.copyright", { year: new Date().getFullYear() })}
        </span>
      </div>
    </footer>
  );
}

/* =================================================================
   Main export
   ================================================================= */

export function LandingPage() {
  const containerRef = useScrollReveal();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`min-h-screen overflow-x-hidden ${darkMode ? "bg-[#060b06] text-white" : "text-[#1e2e28]"}`}
      style={darkMode ? undefined : {
        background: "linear-gradient(160deg, #f4efe6 0%, #f1ebe1 60%, #eee6d8 100%)",
      }}
    >
      <Navbar darkMode={darkMode} onToggleTheme={() => setDarkMode(d => !d)} />
      <Hero darkMode={darkMode} />
      <SectionDivider />
      <HowItWorks darkMode={darkMode} />
      <SectionDivider />
      <Features darkMode={darkMode} />
      <SectionDivider />
      <Platforms darkMode={darkMode} />
      <SectionDivider />
      <Pricing darkMode={darkMode} />
      <Footer darkMode={darkMode} />
    </div>
  );
}
