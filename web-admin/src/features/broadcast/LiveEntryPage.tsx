import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Radio } from "lucide-react";
import { SurfacePanel } from "@/components/layout/SurfacePanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LiveEntryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  // Broadcast codes are 6 chars for games created before the V57 hardening
  // and 10 chars after, so accept any code within that range.
  const MIN_CODE_LENGTH = 6;
  const MAX_CODE_LENGTH = 10;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length >= MIN_CODE_LENGTH) {
      navigate(`/live/${trimmed}`);
    }
  };

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <SurfacePanel elevation="panel" className="w-full max-w-sm space-y-8 text-center" padding="lg">
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Radio className="h-8 w-8 text-success" />
            <h1 className="text-3xl font-bold tracking-tight">PointFinder</h1>
          </div>
          <p className="text-muted-foreground">{t("live.description")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, MAX_CODE_LENGTH))}
            placeholder={t("live.codeInputPlaceholder")}
            maxLength={MAX_CODE_LENGTH}
            className="h-14 text-center font-mono text-2xl tracking-[0.3em]"
            autoFocus
          />
          <Button
            type="submit"
            disabled={code.trim().length < MIN_CODE_LENGTH}
            className="w-full"
            size="lg"
          >
            {t("live.viewGame")}
          </Button>
        </form>
      </SurfacePanel>
    </div>
  );
}
