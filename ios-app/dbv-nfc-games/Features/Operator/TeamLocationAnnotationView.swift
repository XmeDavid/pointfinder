import SwiftUI

// MARK: - Team Location Annotation View

struct TeamLocationAnnotationView: View {
    let team: Team
    let location: TeamLocationResponse

    private var teamColor: Color {
        Color(hex: team.color) ?? .blue
    }

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .fill(location.isStale ? .gray : teamColor)
                    .frame(width: 24, height: 24)

                if location.isStale {
                    Image(systemName: "wifi.slash")
                        .font(.system(size: 10))
                        .foregroundStyle(.white)
                } else {
                    Circle()
                        .strokeBorder(teamColor.opacity(0.4), lineWidth: 3)
                        .frame(width: 32, height: 32)
                }
            }
            .opacity(location.isStale ? 0.6 : 1.0)

            VStack(spacing: 0) {
                Text(location.displayName ?? team.name)
                    .font(.caption2)
                    .fontWeight(.medium)
                if location.displayName != nil {
                    Text(team.name)
                        .font(.system(size: 8))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .opacity(location.isStale ? 0.6 : 1.0)
        }
    }
}
