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

    static let darkStyleURL = URL(string: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json")!

    static func styleURL(for key: String?) -> URL {
        let urlString = styles[key ?? "osm"] ?? styles["osm"]!
        return URL(string: urlString)!
    }

    static func resolvedStyleURL(for key: String?, isDark: Bool) -> URL {
        let resolvedKey = key ?? "osm"
        if isDark, let darkURLString = darkStyles[resolvedKey] {
            return URL(string: darkURLString)!
        }
        let urlString = styles[resolvedKey] ?? styles["osm"]!
        return URL(string: urlString)!
    }
}
