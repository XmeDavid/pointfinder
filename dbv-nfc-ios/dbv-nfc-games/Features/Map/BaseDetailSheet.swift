import SwiftUI

struct BaseDetailSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let baseId: UUID

    @State private var challenge: CheckInResponse.ChallengeInfo?
    @State private var isLoading = true
    @State private var showSolve = false

    /// Live progress data from AppState -- always current.
    private var base: BaseProgress? {
        appState.progressForBase(baseId)
    }

    private var status: BaseStatus {
        base?.baseStatus ?? .notVisited
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Status banner
                    HStack {
                        Image(systemName: status.systemImage)
                        Text(locale.t(status.translationKey))
                            .fontWeight(.medium)
                        Spacer()
                        if let points = challenge?.points {
                            Label("\(points) \(locale.t("common.pts"))", systemImage: "star.fill")
                                .font(.subheadline)
                                .foregroundStyle(.orange)
                        }
                    }
                    .padding()
                    .background(status.color.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    if isLoading {
                        ProgressView(locale.t("base.loadingChallenge"))
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 40)
                    } else if let challenge = challenge {
                        // Challenge content
                        VStack(alignment: .leading, spacing: 12) {
                            Text(challenge.title)
                                .font(.title3)
                                .fontWeight(.bold)

                            Text(challenge.description)
                                .font(.body)
                                .foregroundStyle(.secondary)

                            if !challenge.content.isEmpty {
                                Divider()
                                AutoSizingHTMLView(html: challenge.content)
                            }
                        }

                        // Solve button (only for checked-in or rejected bases)
                        if status == .checkedIn || status == .rejected {
                            Button {
                                appState.startSolving(baseId: baseId, challengeId: challenge.id)
                                showSolve = true
                            } label: {
                                Label(locale.t("base.solveChallenge"), systemImage: "lightbulb.fill")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity)
                                    .padding()
                                    .background(Color.accentColor)
                                    .foregroundStyle(.white)
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                            }
                        } else if status == .completed {
                            Label(locale.t("base.challengeCompleted"), systemImage: "checkmark.seal.fill")
                                .font(.headline)
                                .foregroundStyle(.green)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding()
                        } else if status == .submitted {
                            Label(locale.t("base.awaitingReview"), systemImage: "clock.fill")
                                .font(.headline)
                                .foregroundStyle(.orange)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding()
                        }
                    } else if status == .notVisited {
                        VStack(spacing: 12) {
                            Image(systemName: "mappin.and.ellipse")
                                .font(.system(size: 48))
                                .foregroundStyle(.secondary)
                            Text(locale.t("base.checkInToSee"))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                    } else {
                        VStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.system(size: 48))
                                .foregroundStyle(.orange)
                            Text(locale.t("base.noChallengeAssigned"))
                                .font(.subheadline)
                                .fontWeight(.medium)
                            Text(locale.t("base.contactOperator"))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 40)
                    }
                }
                .padding()
            }
            .navigationTitle(base?.baseName ?? locale.t("base.defaultName"))
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
                        baseName: base?.baseName ?? locale.t("base.defaultName"),
                        requirePresenceToSubmit: base?.requirePresenceToSubmit ?? false,
                        answerType: challenge?.answerType ?? "text",
                        dismissToMap: { dismiss() }
                    )
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task {
            await loadChallenge()
        }
    }

    private func loadChallenge() async {
        // Try to load from cache
        if let cached = await appState.getCachedChallenge(forBaseId: baseId) {
            challenge = cached
            isLoading = false
            return
        }

        // If checked in but not cached, the check-in response should have cached it
        // This shouldn't normally happen, but handle gracefully
        isLoading = false
    }
}
