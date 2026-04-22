import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sun, Moon } from "lucide-react";

/* =================================================================
   PointFinder — "Field Atlas" landing page
   Aesthetic: premium cartographic / editorial field manual
   (No glass, no rounded-2xl SaaS floaters.)
   ================================================================= */

/* ---------- Palette helpers (Day Chart / Night Chart) -----------
   All colour decisions route through this function so every helper
   component stays symmetrical across light/dark. */

type Palette = {
  paper: string;            // page background
  paperAlt: string;         // card / panel background (slightly distinct)
  ink: string;              // body text
  inkStrong: string;        // display text
  moss: string;             // muted text
  trail: string;            // primary action / route
  stamp: string;            // stamp / accent (green, matches trail)
  grid: string;             // grid + contour stroke (already alpha-blended)
  gridSoft: string;         // fainter grid
  rule: string;             // hand-ruled dividers
  brass: string;            // compass ring metal
};

function palette(dark: boolean): Palette {
  return dark
    ? {
        paper: "#0d1915",
        paperAlt: "#11201b",
        ink: "#f2e7d0",
        inkStrong: "#f6ecd8",
        moss: "#a9bfa9",
        trail: "#5caa6a",
        stamp: "#5caa6a",
        grid: "rgba(242,231,208,0.09)",
        gridSoft: "rgba(242,231,208,0.05)",
        rule: "rgba(242,231,208,0.35)",
        brass: "#b08a4a",
      }
    : {
        paper: "#f5efe1",
        paperAlt: "#eee5cf",
        ink: "#15261e",
        inkStrong: "#0c1a14",
        moss: "#4d6250",
        trail: "#2f6b3d",
        stamp: "#2f6b3d",
        grid: "rgba(21,38,30,0.09)",
        gridSoft: "rgba(21,38,30,0.05)",
        rule: "rgba(21,38,30,0.55)",
        brass: "#9a6f2b",
      };
}

/* =================================================================
   Scroll-reveal hook
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
   Global SVG defs — paper grain + filters
   Rendered once at the top of the tree.
   ================================================================= */

function AtlasDefs({ dark }: { dark: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute" }}
    >
      <defs>
        <filter id="paperGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
          <feColorMatrix
            type="matrix"
            values={dark
              ? "0 0 0 0 0.95  0 0 0 0 0.90  0 0 0 0 0.80  0 0 0 0.07 0"
              : "0 0 0 0 0.08  0 0 0 0 0.15  0 0 0 0 0.12  0 0 0 0.12 0"}
          />
        </filter>
        <filter id="stampBleed">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" />
          <feDisplacementMap in="SourceGraphic" scale="1.2" />
        </filter>
      </defs>
    </svg>
  );
}

/* =================================================================
   Paper grain overlay — subtle fixed-position texture
   ================================================================= */

function PaperGrain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] mix-blend-multiply"
      style={{
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='3' /><feColorMatrix values='0 0 0 0 0.09  0 0 0 0 0.15  0 0 0 0 0.11  0 0 0 0.09 0' /></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        opacity: 0.55,
      }}
    />
  );
}

/* =================================================================
   Cross-reticle corner markers — 4 L-shaped ticks per card
   ================================================================= */

function Reticle({ color, size = 14 }: { color: string; size?: number }) {
  const arm = size;
  const stroke = 1.25;
  const common = { stroke: color, strokeWidth: stroke, fill: "none" } as const;

  return (
    <>
      {/* top-left */}
      <svg width={arm} height={arm} className="pointer-events-none absolute left-0 top-0" aria-hidden="true">
        <line x1="0" y1="0.5" x2={arm} y2="0.5" {...common} />
        <line x1="0.5" y1="0" x2="0.5" y2={arm} {...common} />
      </svg>
      {/* top-right */}
      <svg width={arm} height={arm} className="pointer-events-none absolute right-0 top-0" aria-hidden="true">
        <line x1="0" y1="0.5" x2={arm} y2="0.5" {...common} />
        <line x1={arm - 0.5} y1="0" x2={arm - 0.5} y2={arm} {...common} />
      </svg>
      {/* bottom-left */}
      <svg width={arm} height={arm} className="pointer-events-none absolute bottom-0 left-0" aria-hidden="true">
        <line x1="0" y1={arm - 0.5} x2={arm} y2={arm - 0.5} {...common} />
        <line x1="0.5" y1="0" x2="0.5" y2={arm} {...common} />
      </svg>
      {/* bottom-right */}
      <svg width={arm} height={arm} className="pointer-events-none absolute bottom-0 right-0" aria-hidden="true">
        <line x1="0" y1={arm - 0.5} x2={arm} y2={arm - 0.5} {...common} />
        <line x1={arm - 0.5} y1="0" x2={arm - 0.5} y2={arm} {...common} />
      </svg>
    </>
  );
}

/* =================================================================
   Coordinate badge — a small mono label placed absolutely
   ================================================================= */

function CoordBadge({
  children,
  className,
  style,
  color,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  color: string;
}) {
  return (
    <span
      className={`font-mono-atlas pointer-events-none absolute text-[10px] uppercase tracking-[0.22em] ${className ?? ""}`}
      style={{ color, ...style }}
    >
      {children}
    </span>
  );
}

/* =================================================================
   Stamp badge — "outline only" stamp variant (no double-border ring)
   ================================================================= */

function StampOutline({
  children,
  rotate = -2,
  color,
  className,
}: {
  children: React.ReactNode;
  rotate?: number;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`stamp-wobble font-mono-atlas inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.28em] ${className ?? ""}`}
      style={{
        color,
        transform: `rotate(${rotate}deg)`,
        border: `1.25px solid ${color}`,
        opacity: 0.82,
      }}
    >
      {children}
    </span>
  );
}

/* =================================================================
   Hand-ruled double-line divider
   ================================================================= */

function DoubleRule({ pal, className }: { pal: Palette; className?: string }) {
  return (
    <div className={`flex flex-col gap-[3px] ${className ?? ""}`} aria-hidden="true">
      <div style={{ height: 1, background: pal.ink, opacity: 0.7 }} />
      <div style={{ height: 1, background: pal.ink, opacity: 0.35 }} />
    </div>
  );
}

/* =================================================================
   Section legend marker — "§ 02 · HOW IT WORKS" with underscore
   ================================================================= */

function SectionKey({
  num,
  label,
  pal,
}: {
  num: string;
  label: string;
  pal: Palette;
}) {
  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <span
        className="font-mono-atlas text-[11px] font-medium uppercase tracking-[0.32em]"
        style={{ color: pal.moss }}
      >
        <span style={{ color: pal.stamp }}>§</span> {num} &nbsp;·&nbsp; {label}
      </span>
      <svg width="60" height="6" aria-hidden="true">
        <path
          d="M0 3 C 12 1, 24 5, 36 3 S 60 1, 60 3"
          stroke={pal.ink}
          strokeOpacity="0.55"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/* =================================================================
   Contour background — layered irregular closed blobs
   ================================================================= */

function ContourField({ pal, className }: { pal: Palette; className?: string }) {
  // A family of irregular closed bezier paths at different scales.
  const paths = [
    "M 120 260 C 180 180, 320 160, 420 220 S 640 340, 700 280 S 820 160, 760 100 S 540 60, 420 100 S 200 160, 120 260 Z",
    "M 180 280 C 240 220, 340 200, 420 240 S 600 320, 660 280 S 740 200, 700 160 S 540 120, 440 150 S 260 210, 180 280 Z",
    "M 230 290 C 280 250, 360 230, 420 260 S 560 300, 610 280 S 660 230, 640 200 S 540 170, 460 180 S 290 240, 230 290 Z",
    "M 280 290 C 320 260, 380 250, 420 270 S 520 290, 560 280 S 600 250, 590 230 S 530 210, 480 215 S 340 260, 280 290 Z",
    "M 330 285 C 360 265, 400 260, 420 275 S 490 290, 515 285 S 545 265, 540 250 S 510 238, 485 240 S 380 260, 330 285 Z",
  ];

  return (
    <svg
      className={`contour-breathe pointer-events-none ${className ?? ""}`}
      viewBox="0 0 880 460"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={pal.ink}
          strokeOpacity={0.14 - i * 0.015}
          strokeWidth={1}
          strokeDasharray="140 60"
          className="contour-flow"
          style={{ animationDuration: `${28 + i * 6}s`, animationDelay: `${i * -4}s` }}
        />
      ))}
      {/* Elevation labels */}
      <text x="545" y="225" className="font-mono-atlas" fontSize="10" fill={pal.moss} opacity="0.6" letterSpacing="1">
        312m
      </text>
      <text x="230" y="285" className="font-mono-atlas" fontSize="10" fill={pal.moss} opacity="0.45" letterSpacing="1">
        180m
      </text>
      <text x="130" y="255" className="font-mono-atlas" fontSize="10" fill={pal.moss} opacity="0.35" letterSpacing="1">
        120m
      </text>
    </svg>
  );
}

/* =================================================================
   Hero route path — dashed hand-drawn bearing trace
   ================================================================= */

function RoutePath({ pal }: { pal: Palette }) {
  // Waypoints along the route (viewBox 0 0 800 500)
  const waypoints = [
    { x: 60, y: 380 },
    { x: 220, y: 260 },
    { x: 380, y: 310 },
    { x: 560, y: 160 },
    { x: 740, y: 230 },
  ];

  // Build a smooth bezier path through waypoints
  const d = waypoints.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = waypoints[i - 1];
    const cx1 = prev.x + (pt.x - prev.x) * 0.5;
    const cy1 = prev.y;
    const cx2 = prev.x + (pt.x - prev.x) * 0.5;
    const cy2 = pt.y;
    return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${pt.x} ${pt.y}`;
  }, "");

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 800 500"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Shadow trace */}
      <path
        d={d}
        stroke={pal.trail}
        strokeWidth="2"
        strokeOpacity="0.15"
        fill="none"
        strokeLinecap="round"
      />
      {/* Main dashed route (animated) */}
      <path
        d={d}
        stroke={pal.trail}
        strokeWidth="1.6"
        strokeOpacity="0.75"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="7 5"
        className="route-draw"
      />
      {/* Waypoint dots */}
      {waypoints.map((wp, i) => (
        <g key={i}>
          <circle
            cx={wp.x}
            cy={wp.y}
            r={5}
            fill={pal.paper}
            stroke={pal.trail}
            strokeWidth="1.4"
          />
          <circle cx={wp.x} cy={wp.y} r={1.5} fill={pal.trail} />
        </g>
      ))}
    </svg>
  );
}

/* =================================================================
   Compass rose — restyled: aged paper face, cross-reticle plate
   ================================================================= */

function CompassRose({ pal }: { pal: Palette }) {
  const { ink, moss, brass } = pal;

  const ticks = Array.from({ length: 72 }, (_, i) => {
    const angle = (i * 5 * Math.PI) / 180;
    const isCardinal = i % 18 === 0;
    const isMajor = i % 6 === 0 && !isCardinal;
    const isMinor = i % 2 === 0 && !isMajor && !isCardinal;
    const r1 = 90;
    const r2 = isCardinal ? 74 : isMajor ? 80 : isMinor ? 84 : 87;
    return (
      <line
        key={i}
        x1={100 + r1 * Math.sin(angle)}
        y1={100 - r1 * Math.cos(angle)}
        x2={100 + r2 * Math.sin(angle)}
        y2={100 - r2 * Math.cos(angle)}
        stroke={ink}
        strokeWidth={isCardinal ? 1.4 : isMajor ? 0.9 : isMinor ? 0.5 : 0.35}
        opacity={isCardinal ? 0.8 : isMajor ? 0.5 : isMinor ? 0.3 : 0.18}
      />
    );
  });

  const bearings = Array.from({ length: 12 }, (_, i) => {
    const deg = i * 30;
    const rad = (deg * Math.PI) / 180;
    const r = 68;
    return (
      <text
        key={i}
        x={100 + r * Math.sin(rad)}
        y={100 - r * Math.cos(rad) + 3}
        textAnchor="middle"
        fontSize="5.5"
        className="font-mono-atlas"
        fill={moss}
        opacity="0.55"
      >
        {deg.toString().padStart(3, "0")}
      </text>
    );
  });

  return (
    <svg
      viewBox="0 0 200 200"
      className="landing-rotate-slow h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="compassFace" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor={pal.paper === "#0d1915" ? "#1a2a24" : "#faf4e6"} />
          <stop offset="70%" stopColor={pal.paper === "#0d1915" ? "#122019" : "#f0e7d2"} />
          <stop offset="100%" stopColor={pal.paperAlt} />
        </radialGradient>
      </defs>

      {/* Aged paper disc */}
      <circle cx="100" cy="100" r="92" fill="url(#compassFace)" />

      {/* Brass ring */}
      <circle cx="100" cy="100" r="92" fill="none" stroke={brass} strokeWidth="1.2" opacity="0.55" />
      <circle cx="100" cy="100" r="88" fill="none" stroke={ink} strokeWidth="0.4" opacity="0.3" />

      {/* Tick marks and bearings */}
      {ticks}
      {bearings}

      {/* Intercardinal diamond */}
      <polygon
        points="100,58 72,100 100,142 128,100"
        fill="none"
        stroke={ink}
        strokeWidth="0.5"
        opacity="0.2"
      />

      {/* Rose North – solid ink */}
      <polygon points="100,44 93,100 107,100" fill={ink} opacity="0.92" />
      <polygon points="100,44 100,100 93,100" fill={pal.paper === "#0d1915" ? "#26382d" : "#5a6e59"} opacity="0.8" />

      {/* Rose South – lighter */}
      <polygon points="100,156 93,100 107,100" fill={ink} opacity="0.38" />
      <polygon points="100,156 100,100 107,100" fill={moss} opacity="0.5" />

      {/* East */}
      <polygon points="156,100 100,93 100,107" fill={ink} opacity="0.38" />
      <polygon points="156,100 100,100 100,93" fill={moss} opacity="0.5" />

      {/* West */}
      <polygon points="44,100 100,93 100,107" fill={ink} opacity="0.38" />
      <polygon points="44,100 100,100 100,107" fill={moss} opacity="0.5" />

      {/* Serif N / E / S / W labels */}
      <text x="100" y="34" textAnchor="middle" fill={ink} fontSize="12" fontStyle="italic" fontFamily="Fraunces, serif" fontWeight="700">N</text>
      <text x="168" y="104" textAnchor="middle" fill={ink} fontSize="10" fontStyle="italic" fontFamily="Fraunces, serif" opacity="0.7">E</text>
      <text x="100" y="174" textAnchor="middle" fill={ink} fontSize="10" fontStyle="italic" fontFamily="Fraunces, serif" opacity="0.7">S</text>
      <text x="32" y="104" textAnchor="middle" fill={ink} fontSize="10" fontStyle="italic" fontFamily="Fraunces, serif" opacity="0.7">W</text>

      {/* Pivot */}
      <circle cx="100" cy="100" r="4" fill={brass} opacity="0.8" />
      <circle cx="100" cy="100" r="1.5" fill={pal.paper === "#0d1915" ? "#0d1915" : "#0c1a14"} />
    </svg>
  );
}

/* =================================================================
   Navbar
   ================================================================= */

function Navbar({
  dark,
  onToggleTheme,
  pal,
}: {
  dark: boolean;
  onToggleTheme: () => void;
  pal: Palette;
}) {
  const { t } = useTranslation();

  return (
    <nav
      className="fixed left-0 right-0 top-0 z-40"
      style={{
        background: dark ? "rgba(13,25,21,0.92)" : "rgba(245,239,225,0.92)",
        borderTop: `3px solid ${pal.ink}`,
        boxShadow: `inset 0 -1px 0 ${pal.grid}`,
        backdropFilter: "saturate(140%) blur(6px)",
        WebkitBackdropFilter: "saturate(140%) blur(6px)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link to="/" className="flex items-baseline gap-3">
          <CompassMiniMark pal={pal} />
          <span
            className="font-display text-xl font-semibold tracking-[-0.02em]"
            style={{ color: pal.inkStrong }}
          >
            PointFinder
          </span>
        </Link>

        <div className="flex items-center gap-5">
          <button
            onClick={onToggleTheme}
            className="flex h-8 w-8 items-center justify-center transition-colors"
            style={{
              border: `1px solid ${pal.ink}`,
              color: pal.ink,
              background: "transparent",
            }}
            title={dark ? "Switch to Day Chart" : "Switch to Night Chart"}
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Link
            to="/login"
            className="font-mono-atlas text-[11px] uppercase tracking-[0.24em] transition-opacity hover:opacity-70"
            style={{ color: pal.moss }}
          >
            {t("landing.nav.operatorLogin")}
          </Link>
        </div>
      </div>
    </nav>
  );
}

function CompassMiniMark({ pal }: { pal: Palette }) {
  return (
    <svg width="22" height="22" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="none" stroke={pal.ink} strokeWidth="1.2" />
      <circle cx="20" cy="20" r="14" fill="none" stroke={pal.ink} strokeWidth="0.4" opacity="0.4" />
      <polygon points="20,4 16,20 24,20" fill={pal.ink} />
      <polygon points="20,36 16,20 24,20" fill={pal.ink} opacity="0.35" />
      <circle cx="20" cy="20" r="1.8" fill={pal.paper} stroke={pal.ink} strokeWidth="0.6" />
    </svg>
  );
}

/* =================================================================
   Hero
   ================================================================= */

function Hero({ pal, dark }: { pal: Palette; dark: boolean }) {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden px-6 pt-28 pb-20 md:pb-24">
      {/* Sheet number, top-right */}
      <CoordBadge
        color={pal.moss}
        className="right-6 top-[84px] md:right-10"
      >
        SHEET N° 01
      </CoordBadge>

      {/* Background grid + contour layer */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* Fine grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(${pal.gridSoft} 1px, transparent 1px), linear-gradient(90deg, ${pal.gridSoft} 1px, transparent 1px)`,
            backgroundSize: "36px 36px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 35%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 35%, transparent 100%)",
          }}
        />
        {/* Contour blobs, pushed right */}
        <div className="absolute inset-y-0 right-[-10%] w-[90%] opacity-80">
          <ContourField pal={pal} className="h-full w-full" />
        </div>
      </div>

      {/* Route path across the hero */}
      <div className="pointer-events-none absolute inset-x-0 top-28 bottom-0">
        <RoutePath pal={pal} />
      </div>

      {/* Coordinate corner badges */}
      <CoordBadge color={pal.moss} className="left-6 top-[130px] md:left-10">
        41.1579° N &nbsp;·&nbsp; 8.6291° W
      </CoordBadge>
      <CoordBadge color={pal.moss} className="right-6 bottom-40 hidden md:block">
        DATUM WGS-84
      </CoordBadge>

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-12 md:gap-10">
        {/* LEFT — editorial column */}
        <div className="relative md:col-span-7">
          <h1
            className="landing-fade-in font-display mb-6 font-black leading-[0.9] tracking-[-0.035em]"
            style={{
              animationDelay: "0.1s",
              color: pal.inkStrong,
              fontSize: "clamp(2.75rem, 9vw, 5.75rem)",
            }}
          >
            Point<span style={{ color: pal.trail, fontStyle: "italic", fontWeight: 700 }}>f</span>inder
          </h1>

          <p
            className="landing-fade-in font-display-italic mb-4 max-w-2xl leading-[1.2]"
            style={{
              animationDelay: "0.3s",
              color: pal.inkStrong,
              fontSize: "clamp(1.375rem, 3.2vw, 1.875rem)",
            }}
          >
            {t("landing.hero.tagline")}
          </p>

          <div
            className="landing-fade-in mb-8 flex items-center gap-3"
            style={{ animationDelay: "0.5s" }}
          >
            <span
              className="font-mono-atlas text-[11px] uppercase tracking-[0.24em]"
              style={{ color: pal.moss }}
            >
              Scouting &middot; Outdoor &middot; NFC
            </span>
          </div>

          {/* Store badges — official-style, large, primary action */}
          <div
            className="landing-fade-in mt-10 flex flex-col gap-3 sm:flex-row sm:gap-4"
            style={{ animationDelay: "0.9s" }}
          >
            <a
              href={appStoreUrl()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download on the App Store"
              className="inline-block transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ outlineColor: pal.trail }}
            >
              <AppStoreBadge />
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.prayer.pointfinder"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Get it on Google Play"
              className="inline-block transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ outlineColor: pal.trail }}
            >
              <GooglePlayBadge />
            </a>
          </div>
        </div>

        {/* RIGHT — compass plate */}
        <div className="relative md:col-span-5">
          <CompassPlate pal={pal} dark={dark} />
        </div>
      </div>

      {/* Scroll hint */}
      <ScrollHint label={t("landing.hero.scroll")} pal={pal} />
    </section>
  );
}

/* Official-style Apple App Store badge
 * Matches Apple's "Download on the App Store" spec: black rounded rect,
 * white Apple glyph, "Download on the" eyebrow + "App Store" wordmark.
 * Swap in the asset from https://tools.applemediaservices.com/app-store/
 * before release if strict brand compliance is needed. */
function AppStoreBadge() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 60"
      role="img"
      aria-label="Download on the App Store"
      className="h-[56px] w-auto sm:h-[60px]"
    >
      <rect x="0.75" y="0.75" width="178.5" height="58.5" rx="10.5" fill="#000" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.5" />
      {/* Apple logo */}
      <g transform="translate(18 13)" fill="#fff">
        <path d="M27.03 17.98c-.02-3.74 3.05-5.53 3.19-5.62-1.73-2.54-4.43-2.88-5.39-2.92-2.29-.23-4.48 1.35-5.64 1.35-1.18 0-2.96-1.32-4.88-1.28-2.5.04-4.82 1.45-6.1 3.69-2.6 4.5-.66 11.14 1.86 14.78 1.25 1.78 2.73 3.77 4.66 3.7 1.87-.07 2.58-1.21 4.85-1.21 2.25 0 2.9 1.21 4.89 1.17 2.02-.03 3.3-1.8 4.52-3.59 1.42-2.06 2-4.06 2.03-4.16-.04-.02-3.89-1.49-3.93-5.91zM23.34 7.05c1.03-1.25 1.73-2.98 1.54-4.72-1.49.06-3.3 1-4.37 2.25-.95 1.1-1.8 2.88-1.57 4.57 1.66.13 3.36-.84 4.4-2.1z"/>
      </g>
      {/* Wordmark */}
      <g fill="#fff" fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif">
        <text x="52" y="24" fontSize="10" fontWeight="400" letterSpacing="0.4">Download on the</text>
        <text x="52" y="44" fontSize="19" fontWeight="600" letterSpacing="-0.4">App Store</text>
      </g>
    </svg>
  );
}

/* Official-style Google Play badge
 * Matches Google's "Get it on Google Play" spec: black rounded rect,
 * colour play triangle, "GET IT ON" eyebrow + "Google Play" wordmark.
 * Swap in the official SVG from https://play.google.com/intl/en_us/badges/
 * before release if strict brand compliance is needed. */
function GooglePlayBadge() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 60"
      role="img"
      aria-label="Get it on Google Play"
      className="h-[56px] w-auto sm:h-[60px]"
    >
      <rect x="0.75" y="0.75" width="178.5" height="58.5" rx="10.5" fill="#000" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.5" />
      {/* Google Play triangle (official multi-color) */}
      <g transform="translate(14 13)">
        <defs>
          <linearGradient id="gpBlue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#00A1FF" />
            <stop offset="1" stopColor="#00D5FF" />
          </linearGradient>
          <linearGradient id="gpRed" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF3A44" />
            <stop offset="1" stopColor="#C31162" />
          </linearGradient>
          <linearGradient id="gpYellow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFE000" />
            <stop offset="1" stopColor="#FFBD00" />
          </linearGradient>
          <linearGradient id="gpGreen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#00F076" />
            <stop offset="1" stopColor="#00A94F" />
          </linearGradient>
        </defs>
        <path d="M0.5 1.2v31.6c0 .6.3 1.1.7 1.4L18 17 1.2 0.2c-.4.3-.7.6-.7 1z" fill="url(#gpBlue)" />
        <path d="M23.3 11.7L19.3 14 18 17l1.3 3 4 2.3 7-4c.9-.5.9-1.9 0-2.4l-7-3.2z" fill="url(#gpYellow)" />
        <path d="M1.2 33.8c.5.4 1.2.4 1.9.1l20.2-11.6-4-4L1.2 33.8z" fill="url(#gpGreen)" />
        <path d="M3.1.1C2.4-.2 1.7-.2 1.2.2L19.3 20l4-4L3.1.1z" fill="url(#gpRed)" />
      </g>
      {/* Wordmark */}
      <g fill="#fff" fontFamily="Inter, Roboto, -apple-system, system-ui, sans-serif">
        <text x="54" y="24" fontSize="10" fontWeight="400" letterSpacing="0.6">GET IT ON</text>
        <text x="54" y="44" fontSize="19" fontWeight="500" letterSpacing="-0.2">Google Play</text>
      </g>
    </svg>
  );
}

/* Compass plate — a square field plate with reticles around the compass */
function CompassPlate({ pal, dark }: { pal: Palette; dark: boolean }) {
  return (
    <div
      className="relative mx-auto aspect-square w-[min(420px,90vw)]"
      style={{ perspective: "900px" }}
    >
      {/* Plate backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: dark
            ? "linear-gradient(160deg, #142420 0%, #0d1915 100%)"
            : "linear-gradient(160deg, #eee4ca 0%, #e7dcbf 100%)",
          border: `1.25px solid ${pal.ink}`,
        }}
      >
        <Reticle color={pal.ink} size={18} />
        {/* Corner labels */}
        <span
          className="font-mono-atlas absolute left-3 top-3 text-[9px] uppercase tracking-[0.28em]"
          style={{ color: pal.moss }}
        >
          PLATE · 01
        </span>
        <span
          className="font-mono-atlas absolute right-3 top-3 text-[9px] uppercase tracking-[0.28em]"
          style={{ color: pal.moss }}
        >
          N ↑
        </span>
        <span
          className="font-mono-atlas absolute bottom-3 left-3 text-[9px] uppercase tracking-[0.28em]"
          style={{ color: pal.moss }}
        >
          DECL 2.1° E
        </span>
        <span
          className="font-mono-atlas absolute bottom-3 right-3 text-[9px] uppercase tracking-[0.28em]"
          style={{ color: pal.moss }}
        >
          1:25k
        </span>

        {/* Sonar echoes, kept tasteful */}
        {[0, 1].map((i) => (
          <div
            key={i}
            className="landing-ping absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: "72%",
              height: "72%",
              border: `1px solid ${pal.trail}`,
              opacity: 0.25,
              animationDelay: `${i * 1.8}s`,
            }}
          />
        ))}

        {/* The compass itself */}
        <div className="absolute inset-[10%]">
          <CompassRose pal={pal} />
        </div>
      </div>
    </div>
  );
}

/* App-store URL helper (unchanged) */
const APP_STORE_COUNTRY: Record<string, string> = {
  "pointfinder.pt": "pt",
  "pointfinder.ch": "ch",
};
function appStoreUrl() {
  if (typeof window === "undefined")
    return "https://apps.apple.com/app/pointfinder/id6759060734";
  const country = APP_STORE_COUNTRY[window.location.hostname.toLowerCase()];
  const prefix = country ? `/${country}` : "";
  return `https://apps.apple.com${prefix}/app/pointfinder/id6759060734`;
}

/* Scroll hint, subdued mono label */
function ScrollHint({ label, pal }: { label: string; pal: Palette }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY < 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="landing-fade-in absolute bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-500"
      style={{
        animationDelay: "1.7s",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <span
        className="font-mono-atlas text-[10px] uppercase tracking-[0.32em]"
        style={{ color: pal.moss }}
      >
        {label} ↓
      </span>
    </div>
  );
}

/* =================================================================
   How It Works — horizontal legend, dashed bearing line
   ================================================================= */

const steps: {
  num: string;
  titleKey: string;
  bodyKey: string;
  bearing: string;
}[] = [
  { num: "01", titleKey: "landing.howItWorks.step1Title", bodyKey: "landing.howItWorks.step1Body", bearing: "BEARING 012° · 1.8 KM" },
  { num: "02", titleKey: "landing.howItWorks.step2Title", bodyKey: "landing.howItWorks.step2Body", bearing: "BEARING 078° · 3.4 KM" },
  { num: "03", titleKey: "landing.howItWorks.step3Title", bodyKey: "landing.howItWorks.step3Body", bearing: "BEARING 135° · 2.1 KM" },
];

function HowItWorks({ pal }: { pal: Palette }) {
  const { t } = useTranslation();

  return (
    <section className="relative px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="scroll-reveal mb-14">
          <SectionKey num="02" label={t("landing.howItWorks.label")} pal={pal} />
          <h2
            className="font-display mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.02em] md:text-5xl"
            style={{ color: pal.inkStrong }}
          >
            {t("landing.howItWorks.title")}
          </h2>
        </div>

        {/* Three waypoints with a dashed bearing line across */}
        <div className="relative">
          {/* The bearing line, desktop only */}
          <svg
            className="pointer-events-none absolute left-0 right-0 top-[44px] hidden h-6 w-full md:block"
            aria-hidden="true"
          >
            <line
              x1="14%"
              y1="50%"
              x2="86%"
              y2="50%"
              stroke={pal.trail}
              strokeOpacity="0.6"
              strokeWidth="1.2"
              strokeDasharray="6 6"
            />
          </svg>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
            {steps.map((step, i) => (
              <div
                key={step.num}
                className="scroll-reveal relative flex flex-col items-start"
                style={{ transitionDelay: `${i * 140}ms` }}
              >
                {/* Waypoint marker + stamp-style number */}
                <div className="relative z-10 mb-6 flex items-center gap-4">
                  <div
                    className="relative flex h-[60px] w-[60px] items-center justify-center"
                    style={{
                      background: pal.paper,
                      border: `1.25px solid ${pal.ink}`,
                    }}
                  >
                    <Reticle color={pal.ink} size={10} />
                    <span
                      className="font-display text-2xl font-bold"
                      style={{ color: pal.inkStrong }}
                    >
                      {step.num}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <StampOutline color={pal.stamp} rotate={i % 2 === 0 ? -3 : 2}>
                      Waypoint {step.num}
                    </StampOutline>
                  </div>
                </div>

                <h3
                  className="font-display mb-2 max-w-xs text-2xl font-semibold leading-tight tracking-[-0.01em]"
                  style={{ color: pal.inkStrong }}
                >
                  {t(step.titleKey)}
                </h3>
                <p
                  className="font-ui mb-4 max-w-xs text-[15px] leading-relaxed"
                  style={{ color: pal.moss }}
                >
                  {t(step.bodyKey)}
                </p>
                <span
                  className="font-mono-atlas text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: pal.trail }}
                >
                  {step.bearing}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   Features — asymmetric editorial bento, field-notebook pages
   ================================================================= */

type Feature = {
  id: string;
  short: string;     // catalogue code "§ 01 — NFC"
  titleKey: string;
  bodyKey: string;
  span: string;
  large?: boolean;
};

const features: Feature[] = [
  { id: "nfc",          short: "§ 01 — NFC",   titleKey: "landing.features.nfcTitle",          bodyKey: "landing.features.nfcBody",        span: "md:col-span-2 md:row-span-2", large: true },
  { id: "maps",         short: "§ 02 — MAP",   titleKey: "landing.features.mapsTitle",         bodyKey: "landing.features.mapsBody",       span: "" },
  { id: "challenges",   short: "§ 03 — CHL",   titleKey: "landing.features.challengesTitle",   bodyKey: "landing.features.challengesBody", span: "" },
  { id: "leaderboard",  short: "§ 04 — SCR",   titleKey: "landing.features.leaderboardTitle",  bodyKey: "landing.features.leaderboardBody",span: "" },
  { id: "dashboard",    short: "§ 05 — OPS",   titleKey: "landing.features.dashboardTitle",    bodyKey: "landing.features.dashboardBody",  span: "md:col-span-2" },
  { id: "push",         short: "§ 06 — PSH",   titleKey: "landing.features.pushTitle",         bodyKey: "landing.features.pushBody",       span: "" },
  { id: "offline",      short: "§ 07 — OFF",   titleKey: "landing.features.offlineTitle",      bodyKey: "landing.features.offlineBody",    span: "" },
  { id: "i18n",         short: "§ 08 — L10N",  titleKey: "landing.features.multiLangTitle",    bodyKey: "landing.features.multiLangBody",  span: "" },
];

function Features({ pal }: { pal: Palette }) {
  const { t } = useTranslation();

  return (
    <section className="relative px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="scroll-reveal mb-14">
          <SectionKey num="03" label={t("landing.features.label")} pal={pal} />
          <h2
            className="font-display mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.02em] md:text-5xl"
            style={{ color: pal.inkStrong }}
          >
            {t("landing.features.title")}
          </h2>
        </div>

        <div className="grid auto-rows-[minmax(200px,auto)] grid-cols-1 gap-4 md:grid-cols-3">
          {features.map((f, i) => (
            <FeatureCard key={f.id} feature={f} pal={pal} index={i} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
  pal,
  index,
  t,
}: {
  feature: Feature;
  pal: Palette;
  index: number;
  t: (k: string) => string;
}) {
  return (
    <div
      className={`scroll-reveal group relative overflow-hidden p-6 md:p-7 ${feature.span} ${feature.large ? "flex flex-col justify-between" : ""}`}
      style={{
        transitionDelay: `${index * 70}ms`,
        background: pal.paperAlt,
        border: `1px solid ${pal.ink}`,
      }}
    >
      <Reticle color={pal.ink} size={14} />

      {/* Catalogue code, top-right */}
      <span
        className="font-mono-atlas absolute right-4 top-4 text-[9px] uppercase tracking-[0.26em]"
        style={{ color: pal.moss }}
      >
        {feature.short}
      </span>

      {/* Ghost topo blob behind the large card */}
      {feature.large && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-[320px] w-[320px] opacity-[0.12]"
          viewBox="0 0 300 300"
        >
          {[110, 88, 66, 44].map((r, i) => (
            <circle
              key={i}
              cx="150"
              cy="150"
              r={r}
              fill="none"
              stroke={pal.ink}
              strokeWidth="1"
              strokeDasharray={i === 0 ? "1 0" : "2 3"}
            />
          ))}
          {/* A hand-drawn trail */}
          <path
            d="M 40 220 C 90 180, 140 210, 180 160 S 260 120, 280 70"
            fill="none"
            stroke={pal.trail}
            strokeWidth="1.5"
            strokeDasharray="6 5"
            opacity="0.6"
          />
        </svg>
      )}

      <div className="relative">
        <h3
          className={`font-display mb-3 font-semibold leading-tight tracking-[-0.01em] ${feature.large ? "text-3xl md:text-4xl" : "text-xl"}`}
          style={{ color: pal.inkStrong }}
        >
          {t(feature.titleKey)}
        </h3>
        <p
          className={`font-ui leading-relaxed ${feature.large ? "max-w-md text-[15px]" : "text-[14px]"}`}
          style={{ color: pal.moss }}
        >
          {t(feature.bodyKey)}
        </p>
      </div>

      {feature.large && (
        <div className="relative mt-8 flex items-center gap-4">
          <StampOutline color={pal.stamp} rotate={-3}>
            Field Tested
          </StampOutline>
          <span
            className="font-mono-atlas text-[10px] uppercase tracking-[0.24em]"
            style={{ color: pal.trail }}
          >
            RANGE: 10m &middot; LATENCY: &lt;500ms
          </span>
        </div>
      )}
    </div>
  );
}

/* =================================================================
   Pricing — perforated-ticket cards
   ================================================================= */

function TicketPerforation({ pal }: { pal: Palette }) {
  // A row of small dots mimicking perforation
  return (
    <div
      className="flex h-2 items-center gap-[5px] px-5"
      aria-hidden="true"
    >
      {Array.from({ length: 44 }).map((_, i) => (
        <span
          key={i}
          className="h-[2px] flex-1"
          style={{
            background: i % 2 === 0 ? pal.ink : "transparent",
            opacity: 0.55,
          }}
        />
      ))}
    </div>
  );
}

function FraunDivider({ pal }: { pal: Palette }) {
  return (
    <span
      className="font-display-italic mx-2 inline-block"
      style={{ color: pal.moss }}
    >
      ·
    </span>
  );
}

function Pricing({ pal }: { pal: Palette }) {
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

  return (
    <section className="relative px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="scroll-reveal mb-14">
          <SectionKey num="04" label={t("landing.pricing.label")} pal={pal} />
          <h2
            className="font-display mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.02em] md:text-5xl"
            style={{ color: pal.inkStrong }}
          >
            {t("landing.pricing.title")}
          </h2>
          <p
            className="font-display-italic mt-4 max-w-xl text-lg"
            style={{ color: pal.moss }}
          >
            {t("landing.pricing.description")}
          </p>
        </div>

        <div className="scroll-reveal grid grid-cols-1 gap-6 md:grid-cols-3">
          <PricingCard
            pal={pal}
            planLabel={t("landing.pricing.free")}
            planDesc={t("landing.pricing.freeDesc")}
            price="€0"
            priceSuffix=""
            features={freeFeatures}
            cta={t("landing.pricing.getStarted")}
            ctaHref="/register"
            stampColor={pal.moss}
          />
          <PricingCard
            pal={pal}
            planLabel={t("landing.pricing.pro")}
            planDesc={t("landing.pricing.proDesc")}
            price="€0.99"
            priceSuffix={`/ ${t("landing.pricing.proMonthly")}`}
            priceSub={`€9.99${t("landing.pricing.perYear")}`}
            features={proFeatures}
            cta={t("landing.pricing.startPro")}
            ctaHref="/register"
            recommendedLabel={t("landing.pricing.recommended")}
            stampColor={pal.stamp}
            highlighted
          />
          <PricingCard
            pal={pal}
            planLabel={t("landing.pricing.org")}
            planDesc={t("landing.pricing.orgDesc")}
            priceKicker={t("landing.pricing.orgStartingAt")}
            price="€25"
            priceSuffix={t("landing.pricing.perYear")}
            features={orgFeatures}
            footnote={t("landing.pricing.orgDetails")}
            cta={t("landing.pricing.createOrg")}
            ctaHref="/register"
            stampColor={pal.moss}
          />
        </div>
      </div>
    </section>
  );
}

function PricingCard({
  pal,
  planLabel,
  planDesc,
  price,
  priceSuffix,
  priceKicker,
  priceSub,
  features,
  cta,
  ctaHref,
  footnote,
  recommendedLabel,
  stampColor,
  highlighted,
}: {
  pal: Palette;
  planLabel: string;
  planDesc: string;
  price: string;
  priceSuffix?: string;
  priceKicker?: string;
  priceSub?: string;
  features: string[];
  cta: string;
  ctaHref: string;
  footnote?: string;
  recommendedLabel?: string;
  stampColor: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className="relative flex flex-col"
      style={{
        background: highlighted ? pal.paper : pal.paperAlt,
        border: `1.5px solid ${pal.ink}`,
        boxShadow: highlighted
          ? `0 0 0 4px ${pal.paper}, 0 0 0 5px ${pal.ink}`
          : "none",
      }}
    >
      <Reticle color={pal.ink} size={14} />

      {/* Recommended rotated stamp */}
      {recommendedLabel && (
        <div className="absolute -top-4 right-6 z-10">
          <span
            className="stamp-wobble font-mono-atlas inline-block bg-[color:var(--tw-bg)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{
              color: pal.stamp,
              background: pal.paper,
              border: `1.5px solid ${pal.stamp}`,
              boxShadow: `inset 0 0 0 3px ${pal.paper}, inset 0 0 0 4px ${pal.stamp}`,
              transform: "rotate(-4deg)",
            }}
          >
            ★ {recommendedLabel}
          </span>
        </div>
      )}

      {/* Top perforation */}
      <TicketPerforation pal={pal} />

      <div className="flex flex-1 flex-col p-7 pt-5">
        <StampOutline color={stampColor} rotate={-2} className="mb-5 self-start">
          {planLabel}
        </StampOutline>
        <p className="font-display-italic mb-5 text-sm" style={{ color: pal.moss }}>
          {planDesc}
        </p>

        {priceKicker && (
          <p
            className="font-mono-atlas mb-1 text-[10px] uppercase tracking-[0.24em]"
            style={{ color: pal.moss }}
          >
            {priceKicker}
          </p>
        )}
        <div className="mb-6 flex items-baseline gap-1.5">
          <span
            className="font-display text-5xl font-bold tracking-[-0.03em]"
            style={{ color: pal.inkStrong }}
          >
            {price}
          </span>
          {priceSuffix && (
            <span
              className="font-mono-atlas text-sm uppercase tracking-[0.2em]"
              style={{ color: pal.moss }}
            >
              {priceSuffix}
            </span>
          )}
        </div>
        {priceSub && (
          <p
            className="font-mono-atlas -mt-4 mb-6 text-[10px] uppercase tracking-[0.24em]"
            style={{ color: pal.moss }}
          >
            {priceSub}
          </p>
        )}

        <div className="mb-6">
          <p
            className="font-display-italic text-sm leading-relaxed"
            style={{ color: pal.ink }}
          >
            {features.map((f, i) => (
              <span key={i}>
                {f}
                {i < features.length - 1 && <FraunDivider pal={pal} />}
              </span>
            ))}
          </p>
        </div>

        {footnote && (
          <p
            className="font-mono-atlas mb-6 text-[10px] leading-relaxed tracking-[0.14em]"
            style={{ color: pal.moss }}
          >
            {footnote}
          </p>
        )}

        <Link
          to={ctaHref}
          className="font-ui mt-auto inline-flex items-center justify-center px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-85"
          style={{
            background: highlighted ? pal.trail : "transparent",
            color: highlighted ? pal.paper : pal.ink,
            border: `1.25px solid ${highlighted ? pal.trail : pal.ink}`,
          }}
        >
          {cta} &nbsp;&rarr;
        </Link>
      </div>

      {/* Bottom perforation */}
      <TicketPerforation pal={pal} />
    </div>
  );
}

/* =================================================================
   Footer
   ================================================================= */

function Footer({ pal }: { pal: Palette }) {
  const { t } = useTranslation();

  return (
    <footer className="relative px-6 pb-14 pt-10">
      <div className="mx-auto max-w-6xl">
        <DoubleRule pal={pal} className="mb-8" />

        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <CompassMiniMark pal={pal} />
            <div>
              <span
                className="font-display block text-base font-semibold tracking-[-0.01em]"
                style={{ color: pal.inkStrong }}
              >
                PointFinder
              </span>
              <span
                className="font-display-italic block text-sm"
                style={{ color: pal.moss }}
              >
                &mdash; {t("landing.footer.tagline")}
              </span>
            </div>
          </div>

          <div className="font-mono-atlas flex flex-wrap items-center gap-5 text-[11px] uppercase tracking-[0.24em]">
            <Link
              to="/faq"
              className="transition-opacity hover:opacity-60"
              style={{ color: pal.ink }}
            >
              {t("faq.label")}
            </Link>
            <span style={{ color: pal.moss }}>·</span>
            <Link
              to="/privacy"
              className="transition-opacity hover:opacity-60"
              style={{ color: pal.ink }}
            >
              {t("landing.footer.privacyPolicy")}
            </Link>
            <span style={{ color: pal.moss }}>·</span>
            <Link
              to="/login"
              className="transition-opacity hover:opacity-60"
              style={{ color: pal.trail }}
            >
              {t("landing.footer.operatorLogin")} &rarr;
            </Link>
          </div>

          <span
            className="font-mono-atlas text-[10px] uppercase tracking-[0.22em]"
            style={{ color: pal.moss }}
          >
            {t("landing.footer.copyright", { year: new Date().getFullYear() })}
          </span>
        </div>

        <DoubleRule pal={pal} className="mt-8" />

        <div className="mt-6 flex items-center justify-between">
          <span
            className="font-mono-atlas text-[9px] uppercase tracking-[0.3em]"
            style={{ color: pal.moss }}
          >
            PLATE 04 / 04 · END OF SHEET
          </span>
          <span
            className="font-mono-atlas text-[9px] uppercase tracking-[0.3em]"
            style={{ color: pal.moss }}
          >
            WGS-84 · 41.1579° N · 8.6291° W
          </span>
        </div>
      </div>
    </footer>
  );
}

/* =================================================================
   Section spacer — section-to-section ornamental divider
   ================================================================= */

function SectionDivider({ pal }: { pal: Palette }) {
  return (
    <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-6">
      <div className="h-px flex-1" style={{ background: pal.ink, opacity: 0.18 }} />
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="9" fill="none" stroke={pal.ink} strokeWidth="0.8" opacity="0.55" />
        <line x1="11" y1="2" x2="11" y2="20" stroke={pal.ink} strokeWidth="0.6" opacity="0.55" />
        <line x1="2" y1="11" x2="20" y2="11" stroke={pal.ink} strokeWidth="0.6" opacity="0.55" />
        <circle cx="11" cy="11" r="1.5" fill={pal.ink} opacity="0.7" />
      </svg>
      <div className="h-px flex-1" style={{ background: pal.ink, opacity: 0.18 }} />
    </div>
  );
}

/* =================================================================
   Main export
   ================================================================= */

export function LandingPage() {
  const containerRef = useScrollReveal();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const pal = palette(darkMode);

  return (
    <div
      ref={containerRef}
      className="font-ui relative min-h-screen overflow-x-hidden"
      style={{
        background: pal.paper,
        color: pal.ink,
      }}
    >
      <AtlasDefs dark={darkMode} />
      <PaperGrain />

      {/* Subtle page-wide grid backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(${pal.gridSoft} 1px, transparent 1px), linear-gradient(90deg, ${pal.gridSoft} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
          opacity: 0.6,
        }}
      />

      <div className="relative z-10">
        <Navbar dark={darkMode} pal={pal} onToggleTheme={() => setDarkMode((d) => !d)} />
        <Hero pal={pal} dark={darkMode} />
        <SectionDivider pal={pal} />
        <HowItWorks pal={pal} />
        <SectionDivider pal={pal} />
        <Features pal={pal} />
        <SectionDivider pal={pal} />
        <Pricing pal={pal} />
        <Footer pal={pal} />
      </div>
    </div>
  );
}
