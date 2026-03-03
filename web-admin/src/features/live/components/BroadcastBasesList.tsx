import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { BroadcastBase, BroadcastTeam, BroadcastProgress } from "@/lib/api/broadcast";
import { STATUS_COLORS, STATUS_PRIORITY } from "@/lib/map-utils";
import type { BaseStatus } from "@/types";

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
    let minStatus = "not_visited";
    baseProgress.forEach((status) => {
      const priority = STATUS_PRIORITY[status as keyof typeof STATUS_PRIORITY] ?? 0;
      if (priority < minPriority) { minPriority = priority; minStatus = status; }
    });
    return minStatus;
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
                    style={{ backgroundColor: STATUS_COLORS[status as BaseStatus] ?? STATUS_COLORS.not_visited }}
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
