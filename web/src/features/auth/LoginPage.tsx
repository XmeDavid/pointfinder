import { useState } from "react";
import axios from "@/platform/axios";
import { Link, useNavigate } from "react-router-dom";
import { BrandTile } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

export function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      // A player account has nothing to do here; the game lives in the player app.
      if (useAuthStore.getState().user?.role === "participant") {
        useAuthStore.getState().logout();
        setError(t("playerApp.login.participantOnly"));
        return;
      }
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 429) {
        setError(t("auth.tooManyAttempts"));
      } else if (status === 500) {
        setError(t("auth.serverError"));
      } else {
        setError(t("auth.invalidCredentials"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="safe-page flex min-h-dvh items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <BrandTile size={48} className="mx-auto mb-2 rounded-xl" decorative />
          <CardTitle className="text-2xl">{t("common.missionControl")}</CardTitle>
          <CardDescription>{t("auth.signInDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert>{error}</Alert>
            )}
            <div className="space-y-2">
              <FormLabel htmlFor="email" required>
                {t("auth.email")}
              </FormLabel>
              <Input id="email" type="email" placeholder={t("auth.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel htmlFor="password" required>
                  {t("auth.password")}
                </FormLabel>
                <Link to="/forgot-password" className="text-sm text-muted-foreground hover:underline">
                  {t("auth.forgotPassword")}
                </Link>
              </div>
              <Input id="password" type="password" placeholder={t("auth.enterPassword")} value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
              {loading ? t("auth.signingIn") : t("auth.signIn")}
            </Button>
            
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
