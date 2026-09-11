import { useQuery } from "@tanstack/react-query";
import type { XpProfileResponse } from "@pointfinder/api";
import { useAccountSession, useServices } from "@/app/player/services";
import { useAuthStore } from "@/lib/auth/store";
import apiClient from "@/lib/api/client";
export function useAccountProfile() {
  const session = useAccountSession(),
    services = useServices();
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: [
      "account",
      session.kind === "operator" ? session.userId : userId,
      "xp-profile",
    ],
    enabled: session.kind === "operator" || authenticated,
    queryFn: async () =>
      session.kind === "operator"
        ? services.account.api.account.profile()
        : (await apiClient.get<XpProfileResponse>("/account/profile")).data,
  });
}
