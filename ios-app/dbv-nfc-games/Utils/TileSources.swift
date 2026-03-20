import Foundation

enum TileSources {
    private static let styles: [String: String] = [
        "osm": "https://tiles.openfreemap.org/styles/liberty",
        "osm-classic": "https://pointfinder.pt/styles/osm-classic.json",
        "swisstopo": "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
        "swisstopo-sat": "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json",
        "voyager": "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
        "positron": "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    ]

    private static let darkStyles: [String: String] = [
        "osm": "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        "voyager": "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        "positron": "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    ]

    // Safe compile-time constant — guaranteed valid URL literal
    private static let defaultStyleURL = URL(string: "https://tile.openstreetmap.org/{z}/{x}/{y}.png")!

    static let darkStyleURL = URL(string: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json")!

    static func styleURL(for key: String?) -> URL {
        let urlString = styles[key ?? "osm-classic"] ?? styles["osm-classic", default: ""]
        return URL(string: urlString) ?? Self.defaultStyleURL
    }

    static func resolvedStyleURL(for key: String?, isDark: Bool) -> URL {
        let resolvedKey = key ?? "osm-classic"
        if isDark, let darkURLString = darkStyles[resolvedKey] {
            return URL(string: darkURLString) ?? Self.defaultStyleURL
        }
        let urlString = styles[resolvedKey] ?? styles["osm-classic", default: ""]
        return URL(string: urlString) ?? Self.defaultStyleURL
    }
}
