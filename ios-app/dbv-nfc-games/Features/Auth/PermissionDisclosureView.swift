import SwiftUI

/// One-time disclosure sheet shown to players before system permission prompts.
/// Explains what permissions the app needs and why, then proceeds to request them.
struct PermissionDisclosureView: View {
    @Environment(LocaleManager.self) private var locale
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 20) {
                Image(systemName: "hand.raised.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(.accent)

                Text(locale.t("disclosure.title"))
                    .font(.title2)
                    .fontWeight(.bold)
                    .multilineTextAlignment(.center)

                Text(locale.t("disclosure.subtitle"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)
            }

            Spacer().frame(height: 28)

            VStack(alignment: .leading, spacing: 16) {
                disclosureRow(
                    icon: "location.fill",
                    title: locale.t("disclosure.locationTitle"),
                    detail: locale.t("disclosure.locationDetail")
                )
                disclosureRow(
                    icon: "bell.fill",
                    title: locale.t("disclosure.notificationsTitle"),
                    detail: locale.t("disclosure.notificationsDetail")
                )
                disclosureRow(
                    icon: "camera.fill",
                    title: locale.t("disclosure.cameraTitle"),
                    detail: locale.t("disclosure.cameraDetail")
                )
            }
            .padding(.horizontal, 24)

            Spacer().frame(height: 12)

            Text(locale.t("disclosure.footer"))
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Spacer()

            Button {
                onContinue()
            } label: {
                Text(locale.t("disclosure.continue"))
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
            }
            .background(Color.accentColor)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .interactiveDismissDisabled()
    }

    private func disclosureRow(icon: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(.accent)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    PermissionDisclosureView(onContinue: {})
        .environment(LocaleManager())
}
