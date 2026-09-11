import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAccountSession, useServices } from "@/app/player/services";
import { useState } from "react";
import { Button, ConfirmDeleteDialog, Label, Select } from "@/components";
import { ExplorerProfile } from "@/features/user-home/ExplorerProfile";
import { ArrowLeft } from "lucide-react";
import "@/features/user-home/user-home.css";
import "@/features/user-home/experience.css";
import { useAuthStore } from "@/lib/auth/store";
import { GeneralTab } from "./GeneralTab";
import { SecurityTab } from "./SecurityTab";
import { BillingTab } from "./BillingTab";
import { DangerZoneTab } from "./DangerZoneTab";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["general", "security", "billing", "danger-zone"] as const;
type Tab = (typeof TABS)[number];

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const account = useAccountSession(),
    services = useServices();
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const accountOnly = account.kind === "operator" && (!user || user.id !== account.userId);
  const tabs: readonly Tab[] = accountOnly ? (["general", "danger-zone"] as const) : TABS;
  async function removeAccount() {
    if(busy) return;
    setConfirm(false);
    setBusy(true);
    setError(false);
    try {
      await services.account.api.account.delete();
      await services.account.signOut();
      window.location.assign("/dashboard");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const requestedTab = searchParams.get("tab") as Tab;
  const activeTab = tabs.includes(requestedTab) ? requestedTab : "general";

  const setTab = (tab: Tab) => {
    setSearchParams(prev=>{const next=new URLSearchParams(prev);next.set("tab",tab);return next}, { replace: true });
  };

  const tabLabels: Record<Tab, string> = {
    general: t("profile.tabs.general", "General"),
    security: t("profile.tabs.security", "Security"),
    billing: t("profile.tabs.billing", "Billing"),
    "danger-zone": t("profile.tabs.dangerZone", "Danger Zone"),
  };

  return (
    <div className="h-full bg-background overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <Link
          to={searchParams.get("from") === "play" ? "/dashboard?view=play" : "/dashboard"}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground mb-4"
        >
          <ArrowLeft size={17} />
          {t(searchParams.get("from") === "play" ? "experience.nav.play" : "experience.nav.home")}
        </Link>
        <h1 className="text-2xl font-bold text-foreground">
          {t("profile.title", "Profile")}
        </h1>
        <p className="text-muted-foreground mt-1 mb-6">
          {account.kind === "operator" ? account.email : user?.email ?? ""}
        </p>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setTab(value as Tab)}
          className="mb-6 overflow-x-auto"
        >
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                data-testid={`profile-tab-${tab}`}
              >
                {tabLabels[tab]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div data-testid="profile-tab-content">
          {activeTab === "general" && (
            <>
              <ExplorerProfile />
              <div className="mt-6 flex flex-col gap-2">
                <Label htmlFor="profile-language">
                  {t("playerApp.settings.language")}
                </Label>
                <Select
                  id="profile-language"
                  value={(i18n.resolvedLanguage ?? "en").slice(0, 2)}
                  onChange={(e) => void i18n.changeLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                  <option value="de">Deutsch</option>
                </Select>
              </div>
              <div className="mt-8">{!accountOnly && <GeneralTab />}</div>
            </>
          )}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "billing" && <BillingTab />}
          {activeTab === "danger-zone" &&
            (!accountOnly ? (
              <DangerZoneTab />
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("playerApp.account.deleteAccountConfirm")}
                </p>
                {error && <p role="alert">{t("experience.connectionError")}</p>}
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setConfirm(true)}
                >
                  {t("playerApp.account.deleteAccount")}
                </Button>
                <ConfirmDeleteDialog
                  open={confirm}
                  title={t("playerApp.account.deleteAccountTitle")}
                  description={t("playerApp.account.deleteAccountConfirm")}
                  confirmLabel={t("playerApp.account.deleteAccount")}
                  onCancel={() => setConfirm(false)}
                  onConfirm={() => void removeAccount()}
                />
              </>
            ))}
        </div>
      </div>
    </div>
  );
}
