import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, FileText, Filter, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { submissionsApi } from "@/lib/api/submissions";
import { teamsApi } from "@/lib/api/teams";
import { challengesApi } from "@/lib/api/challenges";
import { basesApi } from "@/lib/api/bases";
import { useAuthStore } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import type { Submission, SubmissionStatus } from "@/types";

export function SubmissionsPage() {
  const { t } = useTranslation();
  const { gameId } = useParams<{ gameId: string }>();
  useGameWebSocket(gameId);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState<"all" | "pending">("all");
  const [reviewingSub, setReviewingSub] = useState<Submission | null>(null);
  const [feedback, setFeedback] = useState("");
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  const { data: submissions = [] } = useQuery({ queryKey: ["submissions", gameId], queryFn: () => submissionsApi.listByGame(gameId!) });
  const { data: teams = [] } = useQuery({ queryKey: ["teams", gameId], queryFn: () => teamsApi.listByGame(gameId!) });
  const { data: challenges = [] } = useQuery({ queryKey: ["challenges", gameId], queryFn: () => challengesApi.listByGame(gameId!) });
  const { data: bases = [] } = useQuery({ queryKey: ["bases", gameId], queryFn: () => basesApi.listByGame(gameId!) });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SubmissionStatus }) => submissionsApi.review(id, status, user!.id, feedback || undefined, gameId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["submissions", gameId] }); setReviewingSub(null); setFeedback(""); },
  });

  const statusLabels: Record<SubmissionStatus, string> = { pending: t("submissions.statusPending"), approved: t("submissions.statusApproved"), rejected: t("submissions.statusRejected"), correct: t("submissions.statusCorrect"), incorrect: t("submissions.statusIncorrect") };
  const statusVariants: Record<SubmissionStatus, "warning" | "success" | "destructive"> = { pending: "warning", approved: "success", rejected: "destructive", correct: "success", incorrect: "destructive" };
  const statusIcons: Record<SubmissionStatus, React.ReactNode> = { pending: <Clock className="h-3 w-3" />, approved: <CheckCircle className="h-3 w-3" />, rejected: <XCircle className="h-3 w-3" />, correct: <CheckCircle className="h-3 w-3" />, incorrect: <XCircle className="h-3 w-3" /> };

  const filtered = filter === "pending" ? submissions.filter((s) => s.status === "pending") : submissions;
  const sorted = [...filtered].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">{t("submissions.title")}</h1><p className="text-muted-foreground">{t("submissions.pendingReview", { count: pendingCount })}</p></div>
        <div className="flex gap-2">
          <Button variant={filter === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("all")}>{t("common.all")} ({submissions.length})</Button>
          <Button variant={filter === "pending" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("pending")}><Filter className="mr-1 h-3 w-3" />{t("submissions.statusPending")} ({pendingCount})</Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <Card className="py-12"><CardContent className="text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">{filter === "pending" ? t("submissions.noPending") : t("submissions.noSubmissions")}</p></CardContent></Card>
      ) : (
        <div className="space-y-3">{sorted.map((sub) => {
          const team = teams.find((tm) => tm.id === sub.teamId);
          const challenge = challenges.find((c) => c.id === sub.challengeId);
          const base = bases.find((b) => b.id === sub.baseId);
          return (
            <Card key={sub.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs"><div className="h-2 w-2 rounded-full mr-1" style={{ backgroundColor: team?.color }} />{team?.name}</Badge>
                    <span className="text-sm font-medium">{challenge?.title}</span>
                    {base && <span className="text-xs text-muted-foreground">@ {base.name}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    {sub.fileUrl ? (
                      <>
                        <img src={sub.fileUrl} alt="Submission" className="h-10 w-10 rounded object-cover cursor-pointer" onClick={(e) => { e.stopPropagation(); setFullScreenImage(sub.fileUrl!); }} />
                        {sub.answer && <span className="truncate max-w-md">{sub.answer}</span>}
                      </>
                    ) : (
                      <><FileText className="h-3.5 w-3.5" /><span className="truncate max-w-md">{sub.answer}</span></>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{formatDateTime(sub.submittedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariants[sub.status]}>{statusIcons[sub.status]}<span className="ml-1">{statusLabels[sub.status]}</span></Badge>
                  {sub.status === "pending" && <Button size="sm" onClick={() => setReviewingSub(sub)}>{t("submissions.review")}</Button>}
                </div>
              </CardContent>
            </Card>
          );
        })}</div>
      )}

      <Dialog open={!!reviewingSub} onOpenChange={() => setReviewingSub(null)}>
        {reviewingSub && (
          <DialogContent onClose={() => setReviewingSub(null)}>
            <DialogHeader><DialogTitle>{t("submissions.reviewTitle")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><p className="text-sm font-medium mb-1">{t("submissions.team")}</p><p className="text-sm text-muted-foreground">{teams.find((tm) => tm.id === reviewingSub.teamId)?.name}</p></div>
              <div><p className="text-sm font-medium mb-1">{t("submissions.challenge")}</p><p className="text-sm text-muted-foreground">{challenges.find((c) => c.id === reviewingSub.challengeId)?.title}</p></div>
              {reviewingSub.fileUrl && (
                <div>
                  <p className="text-sm font-medium mb-1">{t("submissions.answer")}</p>
                  <div className="relative group">
                    <img src={reviewingSub.fileUrl} alt="Submission photo" className="rounded-md max-h-64 w-full object-contain bg-muted cursor-pointer" onClick={() => setFullScreenImage(reviewingSub.fileUrl!)} />
                    <button className="absolute top-2 right-2 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setFullScreenImage(reviewingSub.fileUrl!)}><Maximize2 className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
              {(!reviewingSub.fileUrl || reviewingSub.answer) && (
                <div><p className="text-sm font-medium mb-1">{reviewingSub.fileUrl ? "Notes" : t("submissions.answer")}</p><div className="rounded-md bg-muted p-3 text-sm">{reviewingSub.answer || <span className="text-muted-foreground italic">No notes</span>}</div></div>
              )}
              <div className="space-y-2"><p className="text-sm font-medium">{t("submissions.feedbackLabel")}</p><Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t("submissions.feedbackPlaceholder")} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="destructive" onClick={() => reviewMutation.mutate({ id: reviewingSub.id, status: "rejected" })} disabled={reviewMutation.isPending}><XCircle className="mr-1 h-4 w-4" /> {t("submissions.reject")}</Button>
              <Button onClick={() => reviewMutation.mutate({ id: reviewingSub.id, status: "approved" })} disabled={reviewMutation.isPending}><CheckCircle className="mr-1 h-4 w-4" /> {t("submissions.approve")}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Full-screen image viewer */}
      <Dialog open={!!fullScreenImage} onOpenChange={() => setFullScreenImage(null)}>
        <DialogContent className="max-w-4xl p-2" onClose={() => setFullScreenImage(null)}>
          {fullScreenImage && (
            <img src={fullScreenImage} alt="Submission photo" className="w-full h-auto max-h-[85vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
