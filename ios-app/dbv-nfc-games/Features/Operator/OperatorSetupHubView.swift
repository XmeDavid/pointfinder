import SwiftUI

struct OperatorSetupHubView: View {
    @Environment(LocaleManager.self) private var locale

    let game: Game

    var body: some View {
        NavigationStack {
            Text(locale.t("operator.setup"))
                .navigationTitle(locale.t("operator.setup"))
        }
    }
}
