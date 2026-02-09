import SwiftUI

/// Full-screen base detail pushed after a check-in.
/// Shows the challenge and lets the player start solving.
struct BaseCheckInDetailView: View {
    @Environment(AppState.self) private var appState

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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Check-in success banner
                HStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .font(.title)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Checked In!")
                            .font(.headline)
                        Text(base?.baseName ?? "Base")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    // Status pill
                    Text(status.label)
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
                        Text("You're offline. Check-in will sync when connected.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)
                }

                if isLoading {
                    ProgressView("Loading challenge...")
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
                            Label("\(challenge.points) pts", systemImage: "star.fill")
                                .font(.subheadline)
                                .foregroundStyle(.orange)
                        }

                        Text(challenge.description)
                            .font(.body)
                            .foregroundStyle(.secondary)

                        if !challenge.content.isEmpty {
                            Divider()
                            AutoSizingHTMLView(html: challenge.content)
                        }

                        // Answer type hint
                        HStack {
                            Image(systemName: "info.circle")
                                .foregroundStyle(.blue)
                            Text("Answer type: \(challenge.answerType)")
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
                                baseName: base?.baseName ?? "Base",
                                requirePresenceToSubmit: base?.requirePresenceToSubmit ?? false,
                                dismissToMap: popToRoot
                            )
                        } label: {
                            Label("Solve Challenge", systemImage: "lightbulb.fill")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.accentColor)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        .padding(.top, 8)
                    } else if status == .completed {
                        Label("Challenge completed!", systemImage: "checkmark.seal.fill")
                            .font(.headline)
                            .foregroundStyle(.green)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding()
                    } else if status == .submitted {
                        Label("Awaiting review...", systemImage: "clock.fill")
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
                        Text("No challenge assigned to this base yet")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 20)
                }
            }
            .padding()
        }
        .navigationTitle(base?.baseName ?? "Base")
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
