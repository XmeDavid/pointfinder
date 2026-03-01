import { useState } from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api";

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/forgot-password`, { email });
      setSuccess(true);
    } catch {
      setError(t("auth.forgotPasswordError"));
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
          <CardTitle className="text-2xl">{t("auth.forgotPasswordTitle")}</CardTitle>
          <CardDescription>{t("auth.forgotPasswordDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
                {t("auth.forgotPasswordSuccess")}
              </div>
              <Link to="/login" className="block text-center text-sm text-muted-foreground hover:underline">
                {t("auth.backToSignIn")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}
              <div className="space-y-2">
                <FormLabel htmlFor="email" required>
                  {t("auth.email")}
                </FormLabel>
                <Input id="email" type="email" placeholder="admin@pointfinder.dev" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("auth.sendingResetLink") : t("auth.sendResetLink")}
              </Button>
              <Link to="/login" className="block text-center text-sm text-muted-foreground hover:underline">
                {t("auth.backToSignIn")}
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
