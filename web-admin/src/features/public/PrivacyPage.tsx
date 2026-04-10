import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";

export function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-green-400 hover:text-green-300 transition-colors">
            <Compass className="h-5 w-5" />
            <span className="font-bold text-lg">PointFinder</span>
          </Link>
          <Link to="/" className="text-sm text-white/50 hover:text-white transition-colors">
            &larr; {t("privacy.backHome")}
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-bold">{t("privacy.title")}</h1>
          <p className="mt-2 text-white/50 text-sm">{t("privacy.lastUpdated")}</p>
        </div>

        <p className="text-white/70 leading-relaxed">{t("privacy.intro")}</p>

        {/* Section: What we collect */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-green-400">{t("privacy.collectTitle")}</h2>
          <p className="text-white/70 leading-relaxed">{t("privacy.collectIntro")}</p>
          <ul className="space-y-2 text-white/70 list-none">
            {(["displayName", "deviceId", "location", "media", "nfc"] as const).map((key) => (
              <li key={key} className="flex gap-2">
                <span className="text-green-400 mt-1">&#8226;</span>
                <span>{t(`privacy.collect.${key}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Section: How we use it */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-green-400">{t("privacy.useTitle")}</h2>
          <p className="text-white/70 leading-relaxed">{t("privacy.useBody")}</p>
        </section>

        {/* Section: Data retention */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-green-400">{t("privacy.retentionTitle")}</h2>
          <p className="text-white/70 leading-relaxed">{t("privacy.retentionBody")}</p>
        </section>

        {/* Section: Children's privacy */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-green-400">{t("privacy.childrenTitle")}</h2>
          <p className="text-white/70 leading-relaxed">{t("privacy.childrenBody")}</p>
        </section>

        {/* Section: Contact */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-green-400">{t("privacy.contactTitle")}</h2>
          <p className="text-white/70 leading-relaxed">
            {t("privacy.contactBody")}{" "}
            <a
              href="https://pointfinder.pt"
              className="text-green-400 hover:text-green-300 underline transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              pointfinder.pt
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
