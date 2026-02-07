import SwiftUI

struct CheckInResultView: View {
    @Environment(\.dismiss) private var dismiss

    let checkInResponse: CheckInResponse

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Success banner
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                            .font(.title)
                        VStack(alignment: .leading) {
                            Text("Checked In!")
                                .font(.headline)
                            Text(checkInResponse.baseName)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding()
                    .background(Color.green.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Challenge details
                    if let challenge = checkInResponse.challenge {
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
                                Text(challenge.content)
                                    .font(.body)
                            }

                            HStack {
                                Image(systemName: "info.circle")
                                    .foregroundStyle(.blue)
                                Text("Answer type: \(challenge.answerType)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
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

                    Text("Go to the Map tab to view this challenge again and submit your answer when ready.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.top, 8)
                }
                .padding()
            }
            .navigationTitle("Check-in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
