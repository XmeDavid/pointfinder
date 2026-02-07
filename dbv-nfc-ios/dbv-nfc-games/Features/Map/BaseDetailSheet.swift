import SwiftUI

struct BaseDetailSheet: View {
    @Environment(AppState.self) private var appState
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
                        Text(status.label)
                            .fontWeight(.medium)
                        Spacer()
                        if let points = challenge?.points {
                            Label("\(points) pts", systemImage: "star.fill")
                                .font(.subheadline)
                                .foregroundStyle(.orange)
                        }
                    }
                    .padding()
                    .background(status.color.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    if isLoading {
                        ProgressView("Loading challenge...")
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
                                Text(challenge.content)
                                    .font(.body)
                            }
                        }

                        // Solve button (only for checked-in or rejected bases)
                        if status == .checkedIn || status == .rejected {
                            Button {
                                appState.startSolving(baseId: baseId, challengeId: challenge.id)
                                showSolve = true
                            } label: {
                                Label("Solve Challenge", systemImage: "lightbulb.fill")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity)
                                    .padding()
                                    .background(Color.accentColor)
                                    .foregroundStyle(.white)
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                            }
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
                    } else if status == .notVisited {
                        VStack(spacing: 12) {
                            Image(systemName: "sensor.tag.radiowaves.forward")
                                .font(.system(size: 48))
                                .foregroundStyle(.secondary)
                            Text("Scan the NFC tag at this base to check in and see the challenge")
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
                            Text("No challenge assigned to this base")
                                .font(.subheadline)
                                .fontWeight(.medium)
                            Text("Please contact your game operator")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 40)
                    }
                }
                .padding()
            }
            .navigationTitle(base?.baseName ?? "Base")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .navigationDestination(isPresented: $showSolve) {
                if let challengeId = challenge?.id {
                    SolveView(baseId: baseId, challengeId: challengeId, baseName: base?.baseName ?? "Base")
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
