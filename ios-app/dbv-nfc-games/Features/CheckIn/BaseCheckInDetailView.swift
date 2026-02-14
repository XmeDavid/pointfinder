import SwiftUI

/// Full-screen base detail pushed after a check-in.
/// Shows the challenge and lets the player start solving.
struct BaseCheckInDetailView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let baseId: UUID
    /// Closure to pop back to root of the navigation stack
    var popToRoot: (() -> Void)?

    @State private var challenge: CheckInResponse.ChallengeInfo?
    @State private var isLoading = true

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
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Check-in success banner
                HStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .font(.title)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(locale.t("base.checkedInBanner"))
                            .font(.headline)
                        Text(base?.baseName ?? locale.t("base.defaultName"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    // Status pill
                    Text(locale.t(status.translationKey))
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(status.color.opacity(0.2))
                        .foregroundStyle(status.color)
                        .clipShape(Capsule())
                }
                .padding()
                .background(Color.green.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Offline indicator
                if !appState.isOnline {
                    HStack(spacing: 8) {
                        Image(systemName: "wifi.slash")
                            .foregroundStyle(.orange)
                        Text(locale.t("offline.checkInSync"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)
                }

                if isLoading {
                    ProgressView(locale.t("base.loadingChallenge"))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 40)
                } else if let challenge = challenge {
                    // Challenge content
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text(challenge.title)
                                .font(.title3)
                                .fontWeight(.bold)
                            Spacer()
                            Label("\(challenge.points) \(locale.t("common.pts"))", systemImage: "star.fill")
                                .font(.subheadline)
                                .foregroundStyle(.orange)
                        }

                        Text(challenge.description)
                            .font(.body)
                            .foregroundStyle(.secondary)

                        if status == .completed && !completionContent.isEmpty {
                            Divider()
                            Text(locale.t("base.completionContent"))
                                .font(.headline)
                            AutoSizingHTMLView(html: completionContent)
                        } else if !challenge.content.isEmpty {
                            Divider()
                            AutoSizingHTMLView(html: challenge.content)
                        }

                        // Answer type hint
                        HStack {
                            Image(systemName: "info.circle")
                                .foregroundStyle(.blue)
                            Text(locale.t("base.answerType", challenge.answerType))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.top, 4)
                    }

                    // Solve button
                    if status == .checkedIn || status == .rejected {
                        NavigationLink {
                            SolveView(
                                baseId: baseId,
                                challengeId: challenge.id,
                                baseName: base?.baseName ?? locale.t("base.defaultName"),
                                requirePresenceToSubmit: base?.requirePresenceToSubmit ?? false,
                                answerType: challenge.answerType,
                                dismissToMap: popToRoot
                            )
                        } label: {
                            Label(locale.t("base.solveChallenge"), systemImage: "lightbulb.fill")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.accentColor)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        .padding(.top, 8)
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
                } else {
                    VStack(spacing: 8) {
                        Image(systemName: "questionmark.circle")
                            .font(.largeTitle)
                            .foregroundStyle(.secondary)
                        Text(locale.t("base.noChallengeYet"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 20)
                }
            }
            .padding()
        }
        .navigationTitle(base?.baseName ?? locale.t("base.defaultName"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadChallenge()
        }
    }

    private func loadChallenge() async {
        if let cached = await appState.getCachedChallenge(forBaseId: baseId) {
            challenge = cached
            isLoading = false
            return
        }
        isLoading = false
    }
}
