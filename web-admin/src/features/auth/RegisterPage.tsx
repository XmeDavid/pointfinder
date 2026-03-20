import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Compass, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api/errors";
import axios from "axios";
import { API_URL } from "@/lib/api/config";

export function RegisterPage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const { data: invite } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => axios.get<{ email: string }>(`${API_URL}/auth/invite/${token}`).then(r => r.data),
    enabled: !!token,
    retry: false,
  });
  const emailLocked = !!invite?.email;
  const effectiveEmail = emailLocked ? invite.email : email;

  const handleRequestRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/request-registration`, { email: email.trim() });
      setEmailSent(true);
    } catch (err) {
      setError(getApiErrorMessage(err, t("auth.registrationRequestFailed")));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("auth.nameRequired"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordsNoMatch"));
      return;
    }
    setLoading(true);
    try {
      await register(token!, trimmedName, effectiveEmail, password);
      navigate("/games");
    } catch (err) {
      setError(getApiErrorMessage(err, t("auth.registrationFailed")));
    } finally {
      setLoading(false);
    }
  };

  // No token — email request flow
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
              <Compass className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">{t("auth.createAccount")}</CardTitle>
            <CardDescription>{t("auth.registerDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {emailSent ? (
              <div className="text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("auth.registrationEmailSent")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleRequestRegistration} className="space-y-4">
                {error && <Alert>{error}</Alert>}
                <div className="space-y-2">
                  <FormLabel htmlFor="email" required>
                    {t("auth.email")}
                  </FormLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("common.sending") : t("auth.sendRegistrationLink")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Token present — full registration form
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Compass className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">{t("auth.joinTitle")}</CardTitle>
          <CardDescription>{t("auth.joinDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <Alert>{error}</Alert>
            )}
            <div className="space-y-2">
              <FormLabel htmlFor="name" required>
                {t("auth.fullName")}
              </FormLabel>
              <Input id="name" placeholder={t("auth.yourName")} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="email" required>
                {t("auth.email")}
              </FormLabel>
              <Input id="email" type="email" placeholder="you@example.com" value={effectiveEmail} onChange={(e) => setEmail(e.target.value)} required disabled={emailLocked} className={emailLocked ? "bg-muted" : ""} />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="password" required>
                {t("auth.password")}
              </FormLabel>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="confirm" required>
                {t("auth.confirmPassword")}
              </FormLabel>
              <Input id="confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
