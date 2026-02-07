import SwiftUI

struct BaseAnnotationView: View {
    let status: BaseStatus
    let name: String

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .fill(status.color)
                    .frame(width: 36, height: 36)
                    .shadow(color: status.color.opacity(0.4), radius: 4, y: 2)

                Image(systemName: iconName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
            }

            // Small triangle pointing down
            Triangle()
                .fill(status.color)
                .frame(width: 10, height: 6)
        }
    }

    private var iconName: String {
        switch status {
        case .notVisited: return "mappin"
        case .checkedIn: return "flag.fill"
        case .submitted: return "clock"
        case .completed: return "checkmark"
        case .rejected: return "xmark"
        }
    }
}

struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.closeSubpath()
        return path
    }
}

#Preview {
    HStack(spacing: 20) {
        BaseAnnotationView(status: .notVisited, name: "Base 1")
        BaseAnnotationView(status: .checkedIn, name: "Base 2")
        BaseAnnotationView(status: .submitted, name: "Base 3")
        BaseAnnotationView(status: .completed, name: "Base 4")
        BaseAnnotationView(status: .rejected, name: "Base 5")
    }
    .padding()
}
