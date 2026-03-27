import Foundation
import CoreLocation

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

    private static let defaultCenters: [String: (lat: Double, lng: Double)] = [
        "osm": (40.08789650218038, -8.869461715221407),
        "osm-classic": (40.08789650218038, -8.869461715221407),
        "voyager": (40.08789650218038, -8.869461715221407),
        "positron": (40.08789650218038, -8.869461715221407),
        "swisstopo": (46.8182, 8.2275),
        "swisstopo-sat": (46.8182, 8.2275),
    ]

    static func defaultCenter(for key: String?) -> CLLocationCoordinate2D {
        let center = defaultCenters[key ?? "osm-classic"] ?? defaultCenters["osm-classic"]!
        return CLLocationCoordinate2D(latitude: center.lat, longitude: center.lng)
    }
}
