import { Moon, Sun, LogOut, Globe, Bell, Check, Menu, LayoutGrid, Sidebar, ListChecks, Radio, SplitSquareHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-dialog";
import { useAuthStore } from "@/hooks/useAuth";
import { useThemeStore } from "@/hooks/useTheme";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invitesApi } from "@/lib/api/invites";
import { useGameLayoutStore, type LayoutMode } from "@/hooks/useGameLayout";
import { OperatorPresence } from "@/components/OperatorPresence";
import { useToast } from "@/hooks/useToast";
import apiClient from "@/lib/api/client";
import type { GameStatus } from "@/types";
import { cn } from "@/lib/utils";

interface LayoutOption {
  mode: LayoutMode;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
  available: (status?: GameStatus) => boolean;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    mode: "classic",
    icon: <Sidebar className="h-4 w-4" />,
    labelKey: "layout.classic",
    descKey: "layout.classicDesc",
    available: () => true,
  },
  {
    mode: "setup",
    icon: <ListChecks className="h-4 w-4" />,
    labelKey: "layout.setup",
    descKey: "layout.setupDesc",
    available: (status) => status === "setup",
  },
  {
    mode: "monitor",
    icon: <Radio className="h-4 w-4" />,
    labelKey: "layout.monitor",
    descKey: "layout.monitorDesc",
    available: (status) => status === "live" || status === "ended",
  },
  {
    mode: "review",
    icon: <SplitSquareHorizontal className="h-4 w-4" />,
    labelKey: "layout.review",
    descKey: "layout.reviewDesc",
    available: (status) => status === "live" || status === "ended",
  },
];

export function Header({
  onMenuToggle,
  gameId,
  gameStatus,
}: {
  onMenuToggle?: () => void;
  gameId?: string;
  gameStatus?: GameStatus;
}) {
  const { user, logout } = useAuthStore();
  const { dark, toggle } = useThemeStore();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { getLayout, setLayout } = useGameLayoutStore();
  const currentLayout = gameId ? getLayout(gameId) : "classic";
  const toast = useToast();
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);

  async function handleDeleteAccount() {
    try {
      await apiClient.delete("/users/me");
      logout();
    } catch {
      toast.error(t("common.error"));
    }
    setShowDeleteAccountDialog(false);
  }

  const languages = [
    { code: "en", label: "English" },
    { code: "pt", label: "Português" },
    { code: "de", label: "Deutsch" },
  ] as const;

  const currentLang = (i18n.resolvedLanguage ?? i18n.language ?? "en").slice(0, 2);

  function changeLanguage(language: (typeof languages)[number]["code"]) {
    i18n.changeLanguage(language);
  }

  const { data: myInvites = [] } = useQuery({
    queryKey: ["my-invites"],
    queryFn: invitesApi.getMyInvites,
    refetchInterval: 30000,
  });

  const acceptInvite = useMutation({
    mutationFn: (inviteId: string) => invitesApi.accept(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-invites"] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
    },
  });

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 backdrop-blur px-4 md:px-6">
      <div className="flex items-center min-w-0">
        {onMenuToggle && (
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuToggle} aria-label="Toggle menu">
            <Menu className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {gameId && <OperatorPresence />}
        {gameId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("layout.switcher")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("layout.switcher")}
              </div>
              <DropdownMenuSeparator />
              {LAYOUT_OPTIONS.map((opt) => {
                const isAvailable = opt.available(gameStatus);
                const isActive = currentLayout === opt.mode;
                return (
                  <DropdownMenuItem
                    key={opt.mode}
                    disabled={!isAvailable}
                    onClick={() => isAvailable && setLayout(gameId, opt.mode)}
                    className={cn("flex items-start gap-3 py-2", !isAvailable && "opacity-40")}
                  >
                    <span className="mt-0.5 shrink-0">{opt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{t(opt.labelKey)}</span>
                        {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground leading-tight">{t(opt.descKey)}</p>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors" aria-label="Change language">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">{currentLang.toUpperCase()}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {languages.map((language) => (
              <DropdownMenuItem
                key={language.code}
                onClick={() => changeLanguage(language.code)}
                className="flex items-center justify-between gap-2"
              >
                {language.label}
                {currentLang === language.code ? <Check className="h-3.5 w-3.5" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="relative flex items-center justify-center rounded-md p-2 hover:bg-accent transition-colors" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {myInvites.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {myInvites.length}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80">
            <div className="px-2 py-1.5 text-sm font-medium">{t("invitations.title")}</div>
            <DropdownMenuSeparator />
            {myInvites.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                {t("invitations.noInvitations")}
              </div>
            ) : (
              myInvites.map((invite) => (
                <div key={invite.id} className="flex items-start gap-3 px-2 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{invite.inviterName}</span>{" "}
                      {t("invitations.invitedYouTo")}{" "}
                      <span className="font-medium">{invite.gameName}</span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    className="shrink-0 h-7 gap-1 text-xs"
                    disabled={acceptInvite.isPending}
                    onClick={() => acceptInvite.mutate(invite.id)}
                  >
                    <Check className="h-3 w-3" />
                    {t("invitations.accept")}
                  </Button>
                </div>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors" aria-label="User menu">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium hidden sm:block">{user?.name}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="px-2 py-1.5 text-sm">
              <p className="font-medium">{user?.name}</p>
              <p className="text-muted-foreground text-xs">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowDeleteAccountDialog(true)} destructive>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("settings.deleteAccount")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} destructive>
              <LogOut className="mr-2 h-4 w-4" />
              {t("common.logOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDeleteDialog
        open={showDeleteAccountDialog}
        title={t("settings.deleteAccount")}
        description={t("settings.deleteAccountConfirm")}
        confirmLabel={t("settings.deleteAccount")}
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteAccountDialog(false)}
      />
    </header>
  );
}
