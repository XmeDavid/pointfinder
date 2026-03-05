import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api";

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError(t("auth.passwordsNoMatch"));
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, { token, password });
      setSuccess(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError(t("auth.resetPasswordError"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Compass className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">{t("auth.resetPasswordTitle")}</CardTitle>
          <CardDescription>{t("auth.resetPasswordDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
                {t("auth.resetPasswordSuccess")}
              </div>
              <Link to="/login" className="block text-center text-sm text-muted-foreground hover:underline">
                {t("auth.backToSignIn")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert>{error}</Alert>
              )}
              <div className="space-y-2">
                <FormLabel htmlFor="password" required>
                  {t("auth.newPassword")}
                </FormLabel>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <FormLabel htmlFor="confirm" required>
                  {t("auth.confirmPassword")}
                </FormLabel>
                <Input id="confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("auth.resettingPassword") : t("auth.resetPassword")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
