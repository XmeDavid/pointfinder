import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { BroadcastBase, BroadcastTeam, BroadcastProgress } from "@/lib/api/broadcast";
import { STATUS_COLORS, getAggregateStatusFlat } from "@/lib/map-utils";
import { BroadcastPanel } from "@/components/broadcast/BroadcastPanel";
import { EmptyState } from "@/components/feedback/EmptyState";

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
    <BroadcastPanel title={`${t("nav.bases")} (${bases.length})`} contentClassName="overflow-y-auto">
      {bases.length === 0 ? <EmptyState density="compact" title={t("nav.bases")} /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {bases.map((base) => {
            const status = getAggregateStatusFlat(base.id, progressIndex);
            const completed = getCompletedCount(base.id);
            const pct = teams.length > 0 ? Math.round((completed / teams.length) * 100) : 0;
            return (
              <div
                key={base.id}
                className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5"
              >
                <div className="flex items-start gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: STATUS_COLORS[status] ?? STATUS_COLORS.not_visited }}
                  />
                  <span className="text-xs font-medium leading-tight line-clamp-2">{base.name}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-success transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {completed}/{teams.length}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </BroadcastPanel>
  );
}
