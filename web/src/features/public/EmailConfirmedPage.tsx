import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { BrandLockup } from "@/components/brand";

/** Where a participant's verification link lands. There is no operator profile to show them. */
export function EmailConfirmedPage() {
  const { t } = useTranslation(undefined, { keyPrefix: "playerApp.account" });
  return (
    <main className="safe-page flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <BrandLockup size={22} className="text-sm" />
      <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
      <h1 className="text-2xl font-semibold leading-tight text-balance">{t("emailConfirmedTitle")}</h1>
      <p className="max-w-sm text-muted-foreground">{t("emailConfirmedBody")}</p>
    </main>
  );
}
