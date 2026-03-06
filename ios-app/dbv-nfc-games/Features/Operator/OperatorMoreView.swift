import SwiftUI

struct OperatorMoreView: View {
    @Environment(LocaleManager.self) private var locale

    let game: Game
    let onBack: () -> Void

    var body: some View {
        NavigationStack {
            Text(locale.t("operator.more"))
                .navigationTitle(locale.t("operator.more"))
        }
    }
}
