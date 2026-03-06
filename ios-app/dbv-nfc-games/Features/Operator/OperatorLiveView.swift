import SwiftUI

struct OperatorLiveView: View {
    @Environment(LocaleManager.self) private var locale

    let game: Game

    var body: some View {
        NavigationStack {
            Text(locale.t("operator.live"))
                .navigationTitle(locale.t("operator.live"))
        }
    }
}
