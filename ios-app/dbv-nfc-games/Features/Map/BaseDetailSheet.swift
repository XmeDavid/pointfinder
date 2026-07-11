import SwiftUI

struct BaseDetailSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let baseId: UUID

    @State private var challenge: CheckInResponse.ChallengeInfo?
    @State private var isLoading = true
    @State private var showSolve = false
    @State private var isAutoSubmitting = false
    @State private var autoSubmitResult: SubmissionResponse?
    @State private var showAutoSubmitResult = false
    @State private var usingCachedData = false

    /// Live progress data from AppState -- always current.
    private var base: BaseProgress? {
        appState.progressForBase(baseId)
    }

    private var status: BaseStatus {
        base?.baseStatus ?? .notVisited
    }

    private var completionContent: String {
        challenge?.completionContent?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Status banner
                    //
                    // Wave F: the trailing points badge that used to sit
                    // opposite the status label has been removed — the
                    // player-facing map sheet is a pure navigation /
                    // unlock-state surface and must not carry scoring
                    // information (per CLAUDE.md "Players don't see
                    // scores or leaderboards"). The backend
                    // PlayerChallengeResponse no longer serializes
                    // Although the cached challenge model still carries
                    // points for compatibility, this player surface must
                    // never render them.
                    PlayerFieldStatusBanner(
                        title: locale.t(status.translationKey),
                        systemImage: status.systemImage,
                        tone: status.playerFieldTone
                    )

                    if isLoading {
                        ProgressView(locale.t("base.loadingChallenge"))
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 40)
                    } else if status == .notVisited {
                        // Challenge locked -- player must check in first
                        PlayerDetailMessage(
                            systemImage: "lock.fill",
                            title: locale.t("base.challengeLocked"),
                            message: locale.t("base.challengeLockedHint")
                        )
                    } else if let challenge = challenge {
                        // Challenge content
                        VStack(alignment: .leading, spacing: 12) {
                            Text(challenge.title)
                                .font(.title3)
                                .fontWeight(.bold)
                                .accessibilityIdentifier("player-challenge-list")

                            Text(challenge.description)
                                .font(.body)
                                .foregroundStyle(.pfTextMuted)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.bottom, 2)

                            if status == .completed && !completionContent.isEmpty {
                                Divider()
                                Text(locale.t("common.unlockedInformation"))
                                    .font(.headline)
                                AutoSizingHTMLView(html: completionContent)
                            } else if !challenge.content.isEmpty {
                                Divider()
                                AutoSizingHTMLView(html: challenge.content)
                            }
                        }

                        // Presence warning
                        if challenge.requirePresenceToSubmit && (status == .checkedIn || status == .rejected) {
                            PlayerFieldStatusBanner(
                                title: locale.t("base.presenceWarningTitle"),
                                message: locale.t("base.presenceWarningBody"),
                                systemImage: "location.circle.fill",
                                tone: .pending
                            )
                        }

                        // Solve button (only for checked-in or rejected bases)
                        if status == .checkedIn || status == .rejected {
                            if challenge.answerType == "none" {
                                // Auto-submit for check-in-only challenges
                                if isAutoSubmitting {
                                    ProgressView()
                                        .frame(maxWidth: .infinity)
                                        .padding()
                                } else {
                                    // Auto-submit triggers on appear
                                    Color.clear.frame(height: 0)
                                        .task(id: status) {
                                            await autoSubmitNone(challengeId: challenge.id)
                                        }
                                }
                            } else {
                                Button {
                                    appState.startSolving(baseId: baseId, challengeId: challenge.id)
                                    showSolve = true
                                } label: {
                                    Label(locale.t("base.solveChallenge"), systemImage: "lightbulb.fill")
                                        .font(.headline)
                                        .frame(maxWidth: .infinity)
                                        .padding()
                                        .background(Color.pfPrimary)
                                        .foregroundStyle(.white)
                                        .clipShape(RoundedRectangle(cornerRadius: PFRadius.button))
                                }
                            }
                        } else if status == .completed {
                            PlayerFieldStatusBanner(
                                title: locale.t("base.challengeCompleted"),
                                systemImage: "checkmark.seal.fill",
                                tone: .success
                            )
                        } else if status == .submitted {
                            PlayerFieldStatusBanner(
                                title: locale.t("base.awaitingReview"),
                                systemImage: "clock.fill",
                                tone: .pending
                            )
                        }
                    } else if !appState.isOnline {
                        // Offline and no cached data
                        PlayerDetailMessage(
                            systemImage: "wifi.slash",
                            title: locale.t("base.offlineNoChallengeCache"),
                            message: locale.t("base.offlineNoChallegeCacheDesc"),
                            tone: .pending
                        )
                    } else {
                        PlayerDetailMessage(
                            systemImage: "exclamationmark.triangle",
                            title: locale.t("base.noChallengeAssigned"),
                            message: locale.t("base.contactOperator"),
                            tone: .pending
                        )
                    }
                }
                .padding()
            }
            .navigationTitle((base?.displayTitle ?? locale.t("base.defaultName")))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(locale.t("common.done")) { dismiss() }
                }
            }
            .navigationDestination(isPresented: $showSolve) {
                if let challengeId = challenge?.id {
                    SolveView(
                        baseId: baseId,
                        challengeId: challengeId,
                        displayTitle: (base?.displayTitle ?? locale.t("base.defaultName")),
                        requirePresenceToSubmit: challenge?.requirePresenceToSubmit ?? false,
                        answerType: challenge?.answerType ?? "text",
                        challengeTitle: challenge?.title ?? "",
                        challengeDescription: challenge?.description ?? "",
                        challengeContent: challenge?.content ?? "",
                        dismissToMap: { dismiss() }
                    )
                }
            }
            .navigationDestination(isPresented: $showAutoSubmitResult) {
                if let result = autoSubmitResult {
                    SubmissionResultView(
                        submission: result,
                        displayTitle: (base?.displayTitle ?? locale.t("base.defaultName")),
                        dismissToMap: { dismiss() }
                    )
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task {
            await loadChallenge()
        }
        .alert(locale.t("common.error"), isPresented: Binding(
            get: { appState.showError },
            set: { if !$0 { appState.showError = false } }
        )) {
            Button(locale.t("common.ok")) {
                appState.showError = false
            }
        } message: {
            Text(appState.errorMessage ?? locale.t("common.unknownError"))
        }
    }

    private func loadChallenge() async {
        // Try to load from cache
        if let cached = await appState.getCachedChallenge(forBaseId: baseId) {
            challenge = cached
            usingCachedData = !appState.isOnline  // Mark as cached if offline or fresh cache hit
            isLoading = false
            return
        }

        // If checked in but not cached, the check-in response should have cached it
        // This shouldn't normally happen, but handle gracefully
        usingCachedData = false
        isLoading = false
    }

    private func autoSubmitNone(challengeId: UUID) async {
        guard !isAutoSubmitting else { return }
        isAutoSubmitting = true
        let result = await appState.submitAnswer(
            baseId: baseId,
            challengeId: challengeId,
            answer: ""
        )
        isAutoSubmitting = false
        if let result {
            autoSubmitResult = result
            showAutoSubmitResult = true
        }
    }
}
