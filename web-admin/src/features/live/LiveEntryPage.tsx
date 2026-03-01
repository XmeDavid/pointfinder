import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Radio } from "lucide-react";

export function LiveEntryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 6) {
      navigate(`/live/${trimmed}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white p-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Radio className="h-8 w-8 text-blue-400" />
            <h1 className="text-3xl font-bold tracking-tight">PointFinder</h1>
          </div>
          <p className="text-white/60">{t("live.description")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            maxLength={6}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-white placeholder-white/30 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            autoFocus
          />
          <button
            type="submit"
            disabled={code.trim().length !== 6}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t("live.viewGame")}
          </button>
        </form>
      </div>
    </div>
  );
}
