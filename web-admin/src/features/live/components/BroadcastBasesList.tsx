import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { BroadcastBase, BroadcastTeam, BroadcastProgress } from "@/lib/api/broadcast";

const STATUS_COLORS: Record<string, string> = {
  not_visited: "#9ca3af",
  checked_in: "#3b82f6",
  submitted: "#f59e0b",
  completed: "#22c55e",
  rejected: "#ef4444",
};

const STATUS_PRIORITY: Record<string, number> = {
  not_visited: 0,
  checked_in: 1,
  submitted: 2,
  rejected: 3,
  completed: 4,
};

interface Props {
  bases: BroadcastBase[];
  teams: BroadcastTeam[];
  progress: BroadcastProgress[];
}

export function BroadcastBasesList({ bases, teams, progress }: Props) {
  const { t } = useTranslation();

  const progressIndex = useMemo(() => {
    const idx = new Map<string, Map<string, string>>();
    progress.forEach((p) => {
      if (!idx.has(p.baseId)) idx.set(p.baseId, new Map());
      idx.get(p.baseId)!.set(p.teamId, p.status);
    });
    return idx;
  }, [progress]);

  const getAggregateStatus = (baseId: string): string => {
    const baseProgress = progressIndex.get(baseId);
    if (!baseProgress || baseProgress.size === 0) return "not_visited";
    let minPriority = Infinity;
    baseProgress.forEach((status) => {
      const priority = STATUS_PRIORITY[status] ?? 0;
      if (priority < minPriority) minPriority = priority;
    });
    const entry = Object.entries(STATUS_PRIORITY).find(([, v]) => v === minPriority);
    return entry?.[0] ?? "not_visited";
  };

  const getCompletedCount = (baseId: string): number => {
    const baseProgress = progressIndex.get(baseId);
    if (!baseProgress) return 0;
    let count = 0;
    baseProgress.forEach((status) => {
      if (status === "completed") count++;
    });
    return count;
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/5 p-4 overflow-hidden">
      <h2 className="mb-3 text-lg font-semibold text-white/80">{t("nav.bases")}</h2>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {bases.map((base) => {
          const status = getAggregateStatus(base.id);
          const completed = getCompletedCount(base.id);
          return (
            <div
              key={base.id}
              className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2"
            >
              <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_COLORS[status] ?? STATUS_COLORS.not_visited }}
              />
              <span className="text-sm font-medium flex-1 truncate">{base.name}</span>
              <span className="text-xs text-white/40 tabular-nums">
                {completed}/{teams.length}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
