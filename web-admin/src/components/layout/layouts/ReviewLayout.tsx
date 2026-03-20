import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, FileText, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Header } from "../Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AuthMedia } from "@/components/AuthMedia";
import { submissionsApi } from "@/lib/api/submissions";
import { teamsApi } from "@/lib/api/teams";
import { challengesApi } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";
import { useAuthStore } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useToast } from "@/hooks/useToast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { Submission, SubmissionStatus, GameStatus } from "@/types";

const getMediaUrls = (sub: Submission): string[] => sub.fileUrls ?? (sub.fileUrl ? [sub.fileUrl] : []);
function FullScreenMediaViewer({ urls, index, onPrev, onNext }: { urls: string[]; index: number; onPrev: () => void; onNext: () => void }) {
  const currentUrl = urls[index];
  const hasMultiple = urls.length > 1;
  return (
    <div className="relative">
      <AuthMedia
        src={currentUrl}
        alt="Submission media"
        className="w-full h-auto max-h-[85vh] object-contain rounded"
      />
      {hasMultiple && (
        <>
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors disabled:opacity-30"
            disabled={index === 0}
            onClick={onPrev}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors disabled:opacity-30"
            disabled={index === urls.length - 1}
            onClick={onNext}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded">
            {index + 1} / {urls.length}
          </div>
        </>
      )}
    </div>
  );
}

interface ReviewLayoutProps {
  gameId: string;
  gameStatus?: GameStatus;
}

type FilterTab = "pending" | "approved" | "rejected" | "all";

export function ReviewLayout({ gameId, gameStatus }: ReviewLayoutProps) {
  const { t } = useTranslation();
  const toast = useToast();
  useGameWebSocket(gameId);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [filterTab, setFilterTab] = useState<FilterTab>("pending");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [selection, setSelection] = useState<{ id: string | null; feedback: string; points: number }>({ id: null, feedback: "", points: 0 });
  const [fullScreenMedia, setFullScreenMedia] = useState<{ urls: string[]; index: number } | null>(null);
  const blobCache = useRef<Map<string, string>>(new Map());

  const { data: submissions = [] } = useQuery({
    queryKey: ["submissions", gameId],
    queryFn: () => submissionsApi.listByGame(gameId),
    refetchInterval: 15000,
  });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId) });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId) });
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId) });

  const filtered = submissions
    .filter((s) => {
      if (filterTab === "all") return true;
      if (filterTab === "pending") return s.status === "pending";
      if (filterTab === "approved") return s.status === "approved" || s.status === "correct";
      if (filterTab === "rejected") return s.status === "rejected";
      return true;
    })
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  const selected = filtered.find((s) => s.id === selection.id) ?? filtered[0] ?? null;
  const feedback = selection.id === selected?.id ? selection.feedback : (selected?.feedback ?? "");
  const reviewPoints = selection.id === selected?.id ? selection.points : (() => {
    const ch = challenges.find((c) => c.id === selected?.challengeId);
    return selected?.points ?? ch?.points ?? 0;
  })();

  const selectSubmission = useCallback((sub: Submission) => {
    const ch = challenges.find((c) => c.id === sub.challengeId);
    setSelection({ id: sub.id, feedback: sub.feedback ?? "", points: sub.points ?? ch?.points ?? 0 });
    setMobileView("detail");
  }, [challenges]);

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, points, feedback: fb }: { id: string; status: SubmissionStatus; points?: number; feedback?: string }) =>
      submissionsApi.review(id, status, user!.id, fb, gameId, points),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["submissions", gameId] });
      // Auto-advance to next
      const idx = filtered.findIndex((s) => s.id === selected?.id);
      const next = filtered[idx + 1] ?? filtered[idx - 1] ?? null;
      if (next) {
        const ch = challenges.find((c) => c.id === next.challengeId);
        setSelection({ id: next.id, feedback: next.feedback ?? "", points: next.points ?? ch?.points ?? 0 });
      } else {
        setSelection({ id: null, feedback: "", points: 0 });
        setMobileView("list");
      }
      toast.success(t("common.saved"));
    },
    onError: (error: unknown) => { toast.error(getApiErrorMessage(error)); },
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selected || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "a" || e.key === "A") {
        reviewMutation.mutate({ id: selected.id, status: "approved", points: reviewPoints, feedback: feedback || undefined });
      } else if (e.key === "r" || e.key === "R") {
        reviewMutation.mutate({ id: selected.id, status: "rejected", feedback: feedback || undefined });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const idx = filtered.findIndex((s) => s.id === selected.id);
        const next = filtered[idx + 1];
        if (next) selectSubmission(next);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const idx = filtered.findIndex((s) => s.id === selected.id);
        const prev = filtered[idx - 1];
        if (prev) selectSubmission(prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, filtered, reviewPoints, reviewMutation, selectSubmission, feedback]);

  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "pending", label: t("common.pending"), count: pendingCount },
    { key: "approved", label: t("submissions.statusApproved") },
    { key: "rejected", label: t("common.rejected") },
    { key: "all", label: t("common.all"), count: submissions.length },
  ];

  const statusIcons: Record<SubmissionStatus, React.ReactNode> = {
    pending: <Clock className="h-3 w-3" />,
    approved: <CheckCircle className="h-3 w-3 text-green-500" />,
    rejected: <XCircle className="h-3 w-3 text-red-500" />,
    correct: <CheckCircle className="h-3 w-3 text-green-500" />,
  };

  const selectedTeam = teams.find((tm) => tm.id === selected?.teamId);
  const selectedChallenge = challenges.find((c) => c.id === selected?.challengeId);
  const selectedBase = bases.find((b) => b.id === selected?.baseId);
  const expectedPoints = selectedChallenge?.points;

  const listPanel = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter tabs */}
      <div className="flex border-b border-border shrink-0 overflow-x-auto scrollbar-none">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilterTab(tab.key); setMobileView("list"); }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
              filterTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className={cn(
                "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                filterTab === tab.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Submission list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <FileText className="h-6 w-6 mb-2" />
            <p className="text-sm">{filterTab === "pending" ? t("submissions.noPending") : t("common.noSubmissions")}</p>
          </div>
        ) : (
          filtered.map((sub) => {
            const team = teams.find((tm) => tm.id === sub.teamId);
            const challenge = challenges.find((c) => c.id === sub.challengeId);
            const isSelected = sub.id === (selected?.id);
            return (
              <button
                key={sub.id}
                onClick={() => selectSubmission(sub)}
                className={cn(
                  "w-full flex items-start gap-3 px-3 py-3 text-left border-b border-border/50 transition-colors",
                  isSelected ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <div
                  className="h-3 w-3 rounded-full shrink-0 mt-1"
                  style={{ backgroundColor: team?.color ?? "#888" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium truncate">{team?.name ?? "—"}</span>
                    <span className="shrink-0">{statusIcons[sub.status]}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{challenge?.title}</p>
                  <p className="text-xs text-muted-foreground/70">{formatDateTime(sub.submittedAt)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const detailPanel = (
    <div className="flex flex-col h-full overflow-hidden">
      {selected ? (
        <>
          {/* Detail header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
            <button
              onClick={() => setMobileView("list")}
              className="md:hidden flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("common.back")}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: selectedTeam?.color ?? "#888" }} />
                <span className="font-medium text-sm truncate">{selectedTeam?.name}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{selectedChallenge?.title}{selectedBase ? ` @ ${selectedBase.name}` : ""}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Challenge info */}
            {selectedChallenge?.content && (
              <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                {selectedChallenge.content}
              </div>
            )}

            {/* Answer */}
            {(() => {
              const mediaUrls = getMediaUrls(selected);
              if (mediaUrls.length > 0) {
                return (
                  <div>
                    <p className="text-sm font-medium mb-2">{t("submissions.answer")}</p>
                    <div className="space-y-2">
                      {mediaUrls.map((url, idx) => (
                        <div key={url} className="relative group">
                          <AuthMedia
                            src={url}
                            alt="Submission media"
                            className="rounded-md max-h-80 w-full object-contain bg-muted cursor-pointer"
                            onClick={() => setFullScreenMedia({ urls: mediaUrls, index: idx })}
                            onBlobReady={(blob) => blobCache.current.set(url, blob)}
                          />
                          <button
                            className="absolute top-2 right-2 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setFullScreenMedia({ urls: mediaUrls, index: idx })}
                          >
                            <Maximize2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {selected.answer && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">{t("submissions.notes")}</p>
                        <div className="rounded-md bg-muted p-3 text-sm">{selected.answer}</div>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div>
                  <p className="text-sm font-medium mb-2">{t("submissions.answer")}</p>
                  <div className="rounded-md bg-muted p-4 text-lg min-h-16 break-words">
                    {selected.answer || <span className="text-muted-foreground italic text-base">{t("submissions.noNotes")}</span>}
                  </div>
                </div>
              );
            })()}

            {/* Correct answer (if auto-validate text) */}
            {selectedChallenge?.correctAnswer && selectedChallenge.correctAnswer.length > 0 && selectedChallenge.answerType === "text" && selectedChallenge.autoValidate && (
              <div>
                <p className="text-sm font-medium mb-1">{t("submissions.correctAnswer")}</p>
                <div className="rounded-md bg-muted p-3 text-sm">{selectedChallenge.correctAnswer.join(", ")}</div>
              </div>
            )}

            {/* Points */}
            <div>
              <p className="text-sm font-medium mb-1">
                {expectedPoints != null ? t("submissions.pointsLabelWithExpected", { points: expectedPoints }) : t("common.points_label")}
              </p>
              <Input type="number" min={0} value={reviewPoints} onChange={(e) => setSelection((s) => ({ ...s, points: parseInt(e.target.value) || 0 }))} />
            </div>

            {/* Feedback */}
            <div>
              <p className="text-sm font-medium mb-1">{t("submissions.feedbackLabel")}</p>
              <Textarea value={feedback} onChange={(e) => setSelection((s) => ({ ...s, feedback: e.target.value }))} placeholder={t("submissions.feedbackPlaceholder")} rows={2} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 p-4 border-t border-border shrink-0">
            <Button
              variant="destructive"
              className="flex-1 text-base h-12"
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate({ id: selected.id, status: "rejected" })}
            >
              <XCircle className="mr-2 h-5 w-5" />
              {t("submissions.reject")}
              <span className="ml-auto text-xs opacity-60 hidden sm:inline">R</span>
            </Button>
            <Button
              className="flex-1 text-base h-12"
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate({ id: selected.id, status: "approved", points: reviewPoints })}
            >
              <CheckCircle className="mr-2 h-5 w-5" />
              {t("submissions.approve")}
              <span className="ml-auto text-xs opacity-60 hidden sm:inline">A</span>
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
          <FileText className="h-10 w-10" />
          <p className="text-sm">{t("common.noSubmissions")}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header gameId={gameId} gameStatus={gameStatus} />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop: split pane */}
        <div className={cn("hidden md:flex border-r border-border flex-col shrink-0", "w-[35%]")}>
          {listPanel}
        </div>
        <div className="hidden md:flex flex-1 flex-col overflow-hidden">
          {detailPanel}
        </div>

        {/* Mobile: single column toggle */}
        <div className={cn("flex md:hidden flex-1 flex-col overflow-hidden", mobileView === "list" ? "block" : "hidden")}>
          {listPanel}
        </div>
        <div className={cn("flex md:hidden flex-1 flex-col overflow-hidden", mobileView === "detail" ? "flex" : "hidden")}>
          {detailPanel}
        </div>
      </div>

      {/* Full-screen media viewer */}
      <Dialog open={!!fullScreenMedia} onOpenChange={() => setFullScreenMedia(null)}>
        <DialogContent className="max-w-4xl p-2" onClose={() => setFullScreenMedia(null)}>
          {fullScreenMedia && <FullScreenMediaViewer
            urls={fullScreenMedia.urls}
            index={fullScreenMedia.index}
            onPrev={() => setFullScreenMedia((prev) => prev ? { ...prev, index: prev.index - 1 } : null)}
            onNext={() => setFullScreenMedia((prev) => prev ? { ...prev, index: prev.index + 1 } : null)}
          />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
