import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
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
} from "lucide-react";

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

function CompassRose() {
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
        stroke="#22c55e"
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
          className="absolute rounded-full border border-green-500/20 landing-ping"
          style={{
            width: "100%",
            height: "100%",
            animationDelay: `${i * 1.5}s`,
          }}
        />
      ))}

      {/* Green glow behind compass */}
      <div className="absolute w-full h-full rounded-full bg-green-500/[0.04] blur-3xl scale-150" />

      <svg
        viewBox="0 0 200 200"
        className="relative w-52 h-52 md:w-72 md:h-72 lg:w-80 lg:h-80 landing-rotate-slow"
      >
        {/* Outer rings */}
        <circle
          cx="100" cy="100" r="96"
          fill="none" stroke="#22c55e" strokeWidth="0.5" opacity="0.15"
        />
        <circle
          cx="100" cy="100" r="90"
          fill="none" stroke="#22c55e" strokeWidth="0.4" opacity="0.1"
        />

        {/* Tick marks */}
        {ticks}

        {/* Cardinal labels */}
        <text x="100" y="40" textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif" opacity="0.7">N</text>
        <text x="100" y="170" textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif" opacity="0.45">S</text>
        <text x="33" y="104" textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif" opacity="0.45">W</text>
        <text x="167" y="104" textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif" opacity="0.45">E</text>

        {/* Intercardinal diamond */}
        <polygon
          points="100,58 76,100 100,142 124,100"
          fill="none" stroke="#22c55e" strokeWidth="0.5" opacity="0.1"
        />

        {/* Rose – North (bright) */}
        <polygon points="100,48 93,100 107,100" fill="#16a34a" opacity="0.85" />
        <polygon points="100,48 100,100 93,100" fill="#22c55e" opacity="0.6" />

        {/* Rose – South (dim) */}
        <polygon points="100,152 93,100 107,100" fill="#16a34a" opacity="0.3" />
        <polygon points="100,152 100,100 107,100" fill="#0d5f2d" opacity="0.2" />

        {/* Rose – East */}
        <polygon points="152,100 100,93 100,107" fill="#16a34a" opacity="0.3" />
        <polygon points="152,100 100,100 100,93" fill="#22c55e" opacity="0.2" />

        {/* Rose – West */}
        <polygon points="48,100 100,93 100,107" fill="#16a34a" opacity="0.3" />
        <polygon points="48,100 100,100 100,107" fill="#22c55e" opacity="0.2" />

        {/* Centre */}
        <circle cx="100" cy="100" r="5" fill="#22c55e" opacity="0.8" />
        <circle cx="100" cy="100" r="2.5" fill="#060b06" />
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
      <div className="h-px w-20 bg-gradient-to-r from-transparent to-green-500/20" />
      <div className="mx-3 h-2.5 w-2.5 rounded-full border border-green-500/25 bg-green-500/10" />
      <div className="h-px w-20 bg-gradient-to-l from-transparent to-green-500/20" />
    </div>
  );
}

/* =================================================================
   Navigation bar
   ================================================================= */

function Navbar() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.04]"
      style={{ background: "rgba(6,11,6,0.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-green-500/20 bg-green-500/10">
            <Compass className="h-4 w-4 text-green-500" />
          </div>
          <span className="font-semibold tracking-tight text-white">PointFinder</span>
        </Link>

        <Link
          to="/login"
          className="text-sm font-medium text-green-400/70 transition-colors duration-200 hover:text-green-400"
        >
          Operator Login
        </Link>
      </div>
    </nav>
  );
}

/* =================================================================
   Hero
   ================================================================= */

const waypoints = [
  { x: 8, y: 22, s: 3, o: 0.14, d: 0 },
  { x: 88, y: 14, s: 2, o: 0.1, d: 2 },
  { x: 14, y: 74, s: 2.5, o: 0.12, d: 4 },
  { x: 92, y: 62, s: 2, o: 0.1, d: 1 },
  { x: 50, y: 90, s: 2, o: 0.08, d: 3 },
  { x: 74, y: 80, s: 1.5, o: 0.09, d: 5 },
  { x: 30, y: 12, s: 1.5, o: 0.07, d: 6 },
];

function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-20">
      {/* Grid background + radial glow */}
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

      {/* Floating waypoint dots */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {waypoints.map((wp, i) => (
          <div
            key={i}
            className="absolute landing-float"
            style={{ left: `${wp.x}%`, top: `${wp.y}%`, animationDelay: `${wp.d}s` }}
          >
            <div
              className="rounded-full bg-green-500"
              style={{ width: wp.s * 4, height: wp.s * 4, opacity: wp.o }}
            />
            <div
              className="absolute rounded-full border border-green-500"
              style={{ inset: -(wp.s * 2.5), opacity: wp.o * 0.4 }}
            />
          </div>
        ))}
      </div>

      {/* Compass */}
      <div className="landing-fade-in mb-10" style={{ animationDelay: "0.2s" }}>
        <CompassRose />
      </div>

      {/* Title */}
      <h1
        className="landing-fade-in mb-5 text-center text-5xl font-bold tracking-tight md:text-7xl lg:text-8xl"
        style={{
          animationDelay: "0.5s",
          background: "linear-gradient(135deg, #4ade80 0%, #22c55e 35%, #16a34a 65%, #15803d 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        PointFinder
      </h1>

      {/* Tagline */}
      <p
        className="landing-fade-in max-w-lg text-center text-base leading-relaxed text-white/45 md:text-lg"
        style={{ animationDelay: "0.8s" }}
      >
        NFC-powered outdoor adventure games for scouting organizations.
        Create missions, place bases, and let teams explore the real world.
      </p>

      {/* Store badges */}
      <div className="landing-fade-in mt-10 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "1.1s" }}>
        <StoreBadge icon={<AppleLogo />} label="App Store" />
        <StoreBadge icon={<PlayLogo />} label="Google Play" />
      </div>

      {/* Scroll hint */}
      <div className="landing-fade-in absolute bottom-8 left-1/2 -translate-x-1/2" style={{ animationDelay: "1.6s" }}>
        <div className="flex flex-col items-center gap-1.5 text-white/20">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em]">Scroll</span>
          <ChevronDown className="h-4 w-4 landing-bounce" />
        </div>
      </div>
    </section>
  );
}

/* Store badge helpers */

function StoreBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-5 py-2.5 text-sm text-white/35">
      {icon}
      <div className="flex flex-col">
        <span className="text-[9px] uppercase tracking-wider text-white/25">Available on</span>
        <span className="font-medium leading-tight">{label}</span>
      </div>
    </div>
  );
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

const steps = [
  {
    num: "01",
    icon: Settings,
    title: "Set Up Your Mission",
    body: "Place bases on an interactive map, write NFC tags, create challenges, and assemble teams through the web admin panel.",
  },
  {
    num: "02",
    icon: Smartphone,
    title: "Explore & Discover",
    body: "Teams head into the field with their phones, scan NFC tags at physical bases, and unlock challenges to solve on the spot.",
  },
  {
    num: "03",
    icon: LayoutDashboard,
    title: "Monitor in Real-Time",
    body: "Watch the action unfold on the live dashboard with team tracking, leaderboards, activity feeds, and submission review.",
  },
];

function HowItWorks() {
  return (
    <section className="relative px-6 py-20 md:py-28">
      <div className="mx-auto max-w-5xl">
        {/* Heading */}
        <div className="scroll-reveal mb-16 text-center">
          <span className="mb-3 block text-xs font-medium uppercase tracking-[0.2em] text-green-500/70">
            How It Works
          </span>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Three steps to adventure
          </h2>
        </div>

        {/* Steps */}
        <div className="relative grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-6">
          {/* Connector (desktop) */}
          <div className="pointer-events-none absolute left-[calc(16.67%+28px)] right-[calc(16.67%+28px)] top-[36px] hidden h-px border-t border-dashed border-green-500/[0.12] md:block" />

          {steps.map((step, i) => (
            <div
              key={step.num}
              className="scroll-reveal relative flex flex-col items-center text-center"
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              {/* Icon circle */}
              <div className="relative z-10 mb-6">
                <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-green-500/15 bg-green-500/[0.04]">
                  <step.icon className="h-7 w-7 text-green-500/60" />
                </div>
                <span className="absolute -right-1.5 -top-1.5 rounded-full border border-green-500/10 bg-[#060b06] px-2 py-0.5 text-[10px] font-bold text-green-500/50">
                  {step.num}
                </span>
              </div>

              <h3 className="mb-3 text-lg font-semibold text-white">{step.title}</h3>
              <p className="max-w-xs text-sm leading-relaxed text-white/35">{step.body}</p>
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

const features = [
  {
    icon: Radio,
    title: "NFC Gameplay",
    body: "Scan physical NFC tags placed at bases throughout the playing field to check in and unlock challenges. Each tag is uniquely linked to a base location for tamper-proof verification.",
    span: "md:col-span-2 md:row-span-2",
    large: true,
  },
  {
    icon: MapPin,
    title: "Interactive Maps",
    body: "GPS-tracked bases and live team locations displayed on an interactive map with real-time status indicators.",
    span: "",
  },
  {
    icon: Camera,
    title: "Photo & Text Challenges",
    body: "Multiple answer types including free-text with auto-validation and photo submissions for manual review.",
    span: "",
  },
  {
    icon: Trophy,
    title: "Real-Time Leaderboard",
    body: "Live team rankings updated instantly as challenges are completed and points are awarded.",
    span: "",
  },
  {
    icon: LayoutDashboard,
    title: "Live Dashboard",
    body: "Monitor every aspect of your game in real-time: active teams, pending submissions, completion rates, and team progress.",
    span: "md:col-span-2",
  },
  {
    icon: Bell,
    title: "Push Notifications",
    body: "Send instant messages to all teams or specific teams directly in the field.",
    span: "",
  },
  {
    icon: WifiOff,
    title: "Offline Mode",
    body: "Submissions queue offline and sync automatically when connectivity returns.",
    span: "",
  },
  {
    icon: Globe,
    title: "Multi-Language",
    body: "Available in English, Portuguese, and German with automatic language detection.",
    span: "",
  },
];

function Features() {
  return (
    <section className="relative px-6 py-20 md:py-28">
      <div className="mx-auto max-w-5xl">
        {/* Heading */}
        <div className="scroll-reveal mb-16 text-center">
          <span className="mb-3 block text-xs font-medium uppercase tracking-[0.2em] text-green-500/70">
            Features
          </span>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Everything you need to run the game
          </h2>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`scroll-reveal group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6 transition-all duration-300 hover:border-green-500/[0.14] hover:bg-green-500/[0.015] ${f.span} ${f.large ? "flex flex-col justify-between" : ""}`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              {/* Icon */}
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-green-500/10 bg-green-500/[0.06] transition-colors duration-300 group-hover:bg-green-500/[0.1]">
                <f.icon className="h-5 w-5 text-green-500/60" />
              </div>

              <h3 className={`mb-2 font-semibold text-white ${f.large ? "text-xl" : "text-base"}`}>
                {f.title}
              </h3>
              <p className={`leading-relaxed text-white/35 ${f.large ? "max-w-md text-[15px]" : "text-sm"}`}>
                {f.body}
              </p>

              {/* Decorative corner arcs on the hero card */}
              {f.large && (
                <div className="pointer-events-none absolute -right-6 -top-6 opacity-[0.025]">
                  <svg width="160" height="160" viewBox="0 0 160 160" fill="none">
                    <circle cx="120" cy="40" r="100" stroke="#22c55e" strokeWidth="0.8" />
                    <circle cx="120" cy="40" r="70" stroke="#22c55e" strokeWidth="0.6" />
                    <circle cx="120" cy="40" r="40" stroke="#22c55e" strokeWidth="0.4" />
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

function PhoneMockup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="scroll-reveal flex flex-col items-center gap-5">
      <div className="relative w-[190px] rounded-[2.5rem] border-2 border-white/[0.07] bg-[#0a120a] p-3 shadow-2xl shadow-black/50">
        {/* Notch */}
        <div className="relative z-10 mx-auto h-5 w-20 rounded-b-2xl bg-[#060b06]" />
        {/* Screen */}
        <div className="mt-1 overflow-hidden rounded-[1.8rem] bg-[#0d1a0d]" style={{ aspectRatio: "9/17" }}>
          {children}
        </div>
        {/* Home indicator */}
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/[0.06]" />
      </div>
      <span className="text-sm font-medium text-white/35">{label}</span>
    </div>
  );
}

function DesktopMockup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="scroll-reveal flex flex-col items-center gap-3">
      <div className="w-[310px] overflow-hidden rounded-xl border-2 border-white/[0.07] bg-[#0a120a] shadow-2xl shadow-black/50 md:w-[400px]">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 border-b border-white/[0.04] bg-[#080f08] px-4 py-2.5">
          <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
          <div className="ml-4 h-3.5 max-w-[160px] flex-1 rounded bg-white/[0.03]" />
        </div>
        {/* Content */}
        <div className="min-h-[200px] bg-[#0d1a0d] p-4 md:min-h-[240px]">{children}</div>
      </div>
      {/* Stand */}
      <div className="-mt-2 h-1.5 w-14 rounded-b bg-white/[0.04]" />
      <span className="-mt-1 text-sm font-medium text-white/35">{label}</span>
    </div>
  );
}

/* Miniature UI placeholders for inside the device screens */

function ScreenMap() {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {/* Map area */}
      <div
        className="relative flex-1 overflow-hidden rounded-xl border border-green-500/[0.06] bg-green-500/[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(22,163,74,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(22,163,74,0.04) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <div className="absolute left-[38%] top-[28%] h-2 w-2 rounded-full bg-green-500/30" />
        <div className="absolute left-[62%] top-[45%] h-2 w-2 rounded-full bg-green-500/20" />
        <div className="absolute left-[28%] top-[62%] h-2 w-2 rounded-full bg-green-500/25" />
        <div className="absolute left-[52%] top-[72%] h-1.5 w-1.5 rounded-full bg-blue-400/25" />
        <div className="absolute left-[72%] top-[30%] h-1.5 w-1.5 rounded-full bg-blue-400/20" />
      </div>
      {/* Bottom bar */}
      <div className="flex gap-2">
        <div className="h-7 flex-1 rounded-lg border border-green-500/[0.07] bg-green-500/[0.04]" />
        <div className="h-7 w-7 rounded-lg border border-green-500/[0.07] bg-green-500/[0.04]" />
      </div>
    </div>
  );
}

function ScreenNfc() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-4">
      {/* NFC visual */}
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-green-500/[0.1] bg-green-500/[0.06]">
          <Smartphone className="h-7 w-7 text-green-500/40" />
        </div>
        <div className="absolute -inset-3 rounded-2xl border border-green-500/[0.05] landing-ping" style={{ animationDuration: "3s" }} />
        <div className="absolute -inset-6 rounded-3xl border border-green-500/[0.03] landing-ping" style={{ animationDuration: "3s", animationDelay: "1s" }} />
      </div>
      {/* Text placeholders */}
      <div className="text-center">
        <div className="mx-auto mb-2 h-2 w-16 rounded bg-white/[0.07]" />
        <div className="mx-auto h-1.5 w-24 rounded bg-white/[0.04]" />
      </div>
      {/* Card */}
      <div className="mt-auto w-full rounded-xl border border-green-500/[0.06] bg-green-500/[0.03] p-3">
        <div className="mb-2 h-1.5 w-14 rounded bg-green-500/15" />
        <div className="mb-1.5 h-1.5 w-full rounded bg-white/[0.04]" />
        <div className="h-1.5 w-3/4 rounded bg-white/[0.03]" />
      </div>
    </div>
  );
}

function ScreenDashboard() {
  return (
    <div className="flex gap-3">
      {/* Sidebar */}
      <div className="flex w-10 flex-col gap-2 py-1">
        {[true, false, false, false, false].map((active, i) => (
          <div key={i} className={`h-1.5 rounded ${active ? "bg-green-500/20" : "bg-white/[0.04]"}`} />
        ))}
      </div>
      {/* Main */}
      <div className="flex flex-1 flex-col gap-3">
        {/* Stat cards */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1 rounded-lg border border-white/[0.04] bg-white/[0.02] p-2">
              <div className="mb-1.5 h-1 w-5 rounded bg-green-500/15" />
              <div className="h-2 w-8 rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
        {/* Table */}
        <div className="flex flex-col gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2 rounded border border-white/[0.03] bg-white/[0.015] px-2 py-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500/15" />
              <div className="h-1 flex-1 rounded bg-white/[0.04]" />
              <div className="h-1 w-6 rounded bg-white/[0.03]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Platforms() {
  return (
    <section className="relative overflow-hidden px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <div className="scroll-reveal mb-16 text-center">
          <span className="mb-3 block text-xs font-medium uppercase tracking-[0.2em] text-green-500/70">
            Platforms
          </span>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Available everywhere
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm text-white/35 md:text-base">
            Native apps for iOS and Android, plus a full-featured web admin for game management and live monitoring.
          </p>
        </div>

        {/* Device row */}
        <div className="flex flex-col items-center justify-center gap-10 md:flex-row md:items-end md:gap-12">
          <PhoneMockup label="iOS App">
            <ScreenMap />
          </PhoneMockup>

          <DesktopMockup label="Web Admin">
            <ScreenDashboard />
          </DesktopMockup>

          <PhoneMockup label="Android App">
            <ScreenNfc />
          </PhoneMockup>
        </div>
      </div>
    </section>
  );
}

/* =================================================================
   Footer
   ================================================================= */

function Footer() {
  return (
    <footer className="border-t border-white/[0.04] px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-green-500/20 bg-green-500/10">
            <Compass className="h-4 w-4 text-green-500" />
          </div>
          <div>
            <span className="block text-sm font-semibold text-white">PointFinder</span>
            <span className="block text-xs text-white/25">Built for Pathfinders</span>
          </div>
        </div>

        <Link
          to="/login"
          className="text-sm text-white/25 transition-colors duration-200 hover:text-green-400"
        >
          Operator Login &rarr;
        </Link>

        <span className="text-xs text-white/15">
          &copy; {new Date().getFullYear()} PointFinder. All rights reserved.
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

  return (
    <div
      ref={containerRef}
      className="min-h-screen overflow-x-hidden"
      style={{ background: "#060b06", color: "#ffffff" }}
    >
      <Navbar />
      <Hero />
      <SectionDivider />
      <HowItWorks />
      <SectionDivider />
      <Features />
      <SectionDivider />
      <Platforms />
      <Footer />
    </div>
  );
}
