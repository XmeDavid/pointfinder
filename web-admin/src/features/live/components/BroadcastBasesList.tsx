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
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/5 p-3 overflow-hidden">
      <h2 className="mb-2 text-sm font-semibold text-white/70 shrink-0">
        {t("nav.bases")} ({bases.length})
      </h2>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {bases.map((base) => {
            const status = getAggregateStatus(base.id);
            const completed = getCompletedCount(base.id);
            const pct = teams.length > 0 ? Math.round((completed / teams.length) * 100) : 0;
            return (
              <div
                key={base.id}
                className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: STATUS_COLORS[status] ?? STATUS_COLORS.not_visited }}
                  />
                  <span className="text-xs font-medium leading-tight line-clamp-2">{base.name}</span>
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-white/40 tabular-nums">
                  {completed}/{teams.length}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
