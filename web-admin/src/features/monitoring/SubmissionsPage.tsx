import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, FileText, Filter, Maximize2, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AuthMedia } from "@/components/AuthMedia";
import { Alert } from "@/components/ui/alert";
import { submissionsApi } from "@/lib/api/submissions";
import { teamsApi } from "@/lib/api/teams";
import { challengesApi } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/useToast";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import type { Submission, SubmissionStatus } from "@/types";

const getMediaUrls = (sub: Submission): string[] => sub.fileUrls ?? (sub.fileUrl ? [sub.fileUrl] : []);
function FullScreenMediaViewer({ urls, index, onPrev, onNext }: { urls: string[]; index: number; onPrev: () => void; onNext: () => void }) {
  const currentUrl = urls[index];
  const hasMultiple = urls.length > 1;
  return (
    <div className="relative">
      <AuthMedia
        src={currentUrl}
        alt={currentUrl.includes("video") ? "Submission video" : "Submission image"}
        className="w-full h-auto max-h-[85vh] object-contain rounded"
      />
      {hasMultiple && (
        <>
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors disabled:opacity-30"
            disabled={index === 0}
            onClick={onPrev}
            aria-label="Previous image"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors disabled:opacity-30"
            disabled={index === urls.length - 1}
            onClick={onNext}
            aria-label="Next image"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded">
            {index + 1} / {urls.length}
          </div>
        </>
      )}
    </div>
  );
}

export function SubmissionsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { gameId } = useParams<{ gameId: string }>();
  const websocketError = useGameWebSocket(gameId);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending">("all");
  const [reviewingSub, setReviewingSub] = useState<Submission | null>(null);
  const [feedback, setFeedback] = useState("");
  const [reviewPoints, setReviewPoints] = useState<number>(0);
  const [fullScreenMedia, setFullScreenMedia] = useState<{ urls: string[]; index: number } | null>(null);
  // Cache blob URLs by API path so the fullscreen dialog can reuse them.
  // Limited to MAX_BLOB_CACHE entries to prevent unbounded memory growth.
  const MAX_BLOB_CACHE = 100;
  const blobCache = useRef<Map<string, string>>(new Map());
  const cacheBlobUrl = useCallback((apiUrl: string, blobUrl: string) => {
    const cache = blobCache.current;
    if (cache.size >= MAX_BLOB_CACHE && !cache.has(apiUrl)) {
      // Evict the oldest entry (first key in insertion order) and revoke its blob URL
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        const oldBlobUrl = cache.get(oldest);
        if (oldBlobUrl) URL.revokeObjectURL(oldBlobUrl);
        cache.delete(oldest);
      }
    }
    cache.set(apiUrl, blobUrl);
  }, []);

  // Clear blob cache when switching games to avoid stale references.
  // Revoke all blob URLs to free memory.
  useEffect(() => {
    const cache = blobCache.current;
    return () => {
      cache.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
      cache.clear();
    };
  }, [gameId]);
  const openFullScreen = useCallback((urls: string[], index: number) => {
    setFullScreenMedia({ urls, index });
  }, []);

  const { data: submissions = [], isLoading: subsLoading } = useQuery({ queryKey: ["submissions", gameId], queryFn: () => submissionsApi.listByGame(gameId!), enabled: !!gameId });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!), enabled: !!gameId });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!), enabled: !!gameId });
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!), enabled: !!gameId });

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const challengeMap = useMemo(() => new Map(challenges.map((c) => [c.id, c])), [challenges]);
  const baseMap = useMemo(() => new Map(bases.map((b) => [b.id, b])), [bases]);

  const openReview = useCallback((submission: Submission) => {
    setReviewingSub(submission);
    setFeedback(submission.feedback ?? "");
    const ch = challengeMap.get(submission.challengeId);
    setReviewPoints(submission.points ?? ch?.points ?? 0);
  }, [challengeMap]);
  const closeReview = useCallback(() => {
    setReviewingSub(null);
    setFeedback("");
    setReviewPoints(0);
  }, []);

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, points, feedback: fb }: { id: string; status: SubmissionStatus; points?: number; feedback?: string }) => {
      return submissionsApi.review(id, status, fb, gameId, points);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["submissions", gameId] }); setReviewingSub(null); setFeedback(""); setReviewPoints(0); toast.success(t("common.saved")); },
    onError: (error: unknown) => { toast.error(getApiErrorMessage(error)); },
  });

  const statusLabels: Record<SubmissionStatus, string> = { pending: t("common.pending"), approved: t("submissions.statusApproved"), rejected: t("common.rejected"), correct: t("submissions.statusCorrect") };
  const statusVariants: Record<SubmissionStatus, "warning" | "success" | "destructive"> = { pending: "warning", approved: "success", rejected: "destructive", correct: "success" };
  const statusIcons: Record<SubmissionStatus, React.ReactNode> = { pending: <Clock className="h-3 w-3" />, approved: <CheckCircle className="h-3 w-3" />, rejected: <XCircle className="h-3 w-3" />, correct: <CheckCircle className="h-3 w-3" /> };

  const pendingCount = useMemo(() => submissions.filter((s) => s.status === "pending").length, [submissions]);
  const sorted = useMemo(() => {
    const filtered = filter === "pending" ? submissions.filter((s) => s.status === "pending") : submissions;
    return [...filtered].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [submissions, filter]);
  const expectedReviewPoints = reviewingSub ? challengeMap.get(reviewingSub.challengeId)?.points : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">{t("nav.submissions")}</h1><p className="text-muted-foreground">{t("submissions.pendingReview", { count: pendingCount })}</p></div>
        <div className="flex gap-2">
          <Button variant={filter === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("all")}>{t("common.all")} ({submissions.length})</Button>
          <Button variant={filter === "pending" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("pending")}><Filter className="mr-1 h-3 w-3" />{t("common.pending")} ({pendingCount})</Button>
        </div>
      </div>
      {websocketError && <Alert>{websocketError}</Alert>}

      {subsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="flex items-center gap-4 p-4">
              <div className="flex-1">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32 mt-2" />
                <Skeleton className="h-3 w-24 mt-1" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </CardContent></Card>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card className="py-12"><CardContent className="text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{filter === "pending" ? t("submissions.noPending") : t("common.noSubmissions")}</p></CardContent></Card>
      ) : (
        <div className="space-y-3">{sorted.map((sub) => {
          const isPending = sub.status === "pending";
          const team = teamMap.get(sub.teamId);
          const challenge = challengeMap.get(sub.challengeId);
          const base = sub.baseId ? baseMap.get(sub.baseId) : undefined;
          return (
            <Card
              key={sub.id}
              className={isPending ? "cursor-pointer transition-colors hover:border-primary/50" : undefined}
              onClick={isPending ? () => openReview(sub) : undefined}
              role={isPending ? "button" : undefined}
              tabIndex={isPending ? 0 : undefined}
              onKeyDown={isPending ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openReview(sub);
                }
              } : undefined}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs"><div className="h-2 w-2 rounded-full mr-1" style={{ backgroundColor: team?.color }} />{team?.name}</Badge>
                    <span className="text-sm font-medium">{challenge?.title}</span>
                    {base && <span className="text-xs text-muted-foreground">@ {base.name}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    {(() => {
                      const mediaUrls = getMediaUrls(sub);
                      if (mediaUrls.length > 0) {
                        return (
                          <div className="flex gap-1">
                            {mediaUrls.map((url, idx) => (
                              <AuthMedia key={url} src={url} alt="Submission" className="h-10 w-10 rounded object-cover cursor-pointer" thumbnail onClick={(e) => { e.stopPropagation(); openFullScreen(mediaUrls, idx); }} onBlobReady={(blob) => cacheBlobUrl(url, blob)} />
                            ))}
                          </div>
                        );
                      }
                      return (
                        <>
                          <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                          {sub.answer && <span className="truncate max-w-xs text-xs" title={sub.answer}>{sub.answer}</span>}
                        </>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{formatDateTime(sub.submittedAt)}</p>
                  {sub.feedback && sub.status !== "pending" && (
                    <p className="text-xs text-muted-foreground mt-1 truncate max-w-xl" title={sub.feedback ?? undefined}>
                      {t("submissions.feedbackSent", { feedback: sub.feedback })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariants[sub.status]}>{statusIcons[sub.status]}<span className="ml-1">{statusLabels[sub.status]}</span></Badge>
                  {!isPending && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                        aria-label={t("submissions.actions")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openReview(sub)}>{t("submissions.override")}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}</div>
      )}

      <Dialog open={!!reviewingSub} onOpenChange={closeReview}>
        {reviewingSub && (
          <DialogContent onClose={closeReview}>
            <DialogHeader><DialogTitle>{t("submissions.reviewTitle")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><p className="text-sm font-medium mb-1">{t("common.team")}</p><p className="text-sm text-muted-foreground">{teamMap.get(reviewingSub.teamId)?.name}</p></div>
              <div><p className="text-sm font-medium mb-1">{t("common.challenge")}</p><p className="text-sm text-muted-foreground">{challengeMap.get(reviewingSub.challengeId)?.title}</p></div>
              {(() => {
                const mediaUrls = getMediaUrls(reviewingSub);
                if (mediaUrls.length > 0) {
                  return (
                    <div>
                      <p className="text-sm font-medium mb-1">{t("submissions.answer")}</p>
                      <div className="space-y-2">
                        {mediaUrls.map((url, idx) => (
                          <div key={url} className="relative group">
                            <AuthMedia src={url} alt={url.includes("video") ? "Submission video" : "Submission image"} className="rounded-md max-h-64 w-full object-contain bg-muted cursor-pointer" onClick={() => openFullScreen(mediaUrls, idx)} onBlobReady={(blob) => cacheBlobUrl(url, blob)} />
                            <button className="absolute top-2 right-2 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openFullScreen(mediaUrls, idx)}><Maximize2 className="h-4 w-4" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              {(getMediaUrls(reviewingSub).length === 0 || reviewingSub.answer) && (
                <div><p className="text-sm font-medium mb-1">{getMediaUrls(reviewingSub).length > 0 ? t("submissions.notes") : t("submissions.answer")}</p><div className="rounded-md bg-muted p-3 text-sm">{reviewingSub.answer || <span className="text-muted-foreground italic">{t("submissions.noNotes")}</span>}</div></div>
              )}
              {(() => {
                const ch = challengeMap.get(reviewingSub.challengeId);
                const shouldShowCorrectAnswer = ch?.correctAnswer && ch.correctAnswer.length > 0 && ch.answerType === "text" && ch.autoValidate;
                return shouldShowCorrectAnswer ? (
                  <div>
                    <p className="text-sm font-medium mb-1">{t("submissions.correctAnswer")}</p>
                    <div className="rounded-md bg-muted p-3 text-sm">{ch.correctAnswer?.join(", ")}</div>
                  </div>
                ) : null;
              })()}
              <div className="space-y-2"><p className="text-sm font-medium">{expectedReviewPoints != null ? t("submissions.pointsLabelWithExpected", { points: expectedReviewPoints }) : t("common.points_label")}</p><Input type="number" min={0} value={reviewPoints} onChange={(e) => setReviewPoints(parseInt(e.target.value) || 0)} /></div>
              <div className="space-y-2"><p className="text-sm font-medium">{t("submissions.feedbackLabel")}</p><Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t("submissions.feedbackPlaceholder")} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="destructive" onClick={() => reviewMutation.mutate({ id: reviewingSub.id, status: "rejected", feedback: feedback || undefined })} loading={reviewMutation.isPending} data-testid="submission-reject-btn"><XCircle className="mr-1 h-4 w-4" /> {t("submissions.reject")}</Button>
              <Button onClick={() => reviewMutation.mutate({ id: reviewingSub.id, status: "approved", points: reviewPoints, feedback: feedback || undefined })} loading={reviewMutation.isPending} data-testid="submission-approve-btn"><CheckCircle className="mr-1 h-4 w-4" /> {t("submissions.approve")}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

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
