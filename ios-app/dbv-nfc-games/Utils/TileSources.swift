import Foundation

enum TileSources {
    private static let styles: [String: String] = [
        "osm": "https://tiles.openfreemap.org/styles/liberty",
        "swisstopo": "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
        "swisstopo-sat": "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json",
    ]

    static let darkStyleURL = URL(string: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json")!

    static func styleURL(for key: String?) -> URL {
        let urlString = styles[key ?? "osm"] ?? styles["osm"]!
        return URL(string: urlString)!
    }
}
