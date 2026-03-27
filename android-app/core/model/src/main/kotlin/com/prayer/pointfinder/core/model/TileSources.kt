package com.prayer.pointfinder.core.model

object TileSources {
    private val STYLES = mapOf(
        "osm" to "https://tiles.openfreemap.org/styles/liberty",
        "osm-classic" to "https://pointfinder.pt/styles/osm-classic.json",
        "swisstopo" to "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
        "swisstopo-sat" to "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json",
        "voyager" to "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
        "positron" to "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    )

    const val DARK_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

    private val DARK_STYLES = mapOf(
        "osm" to DARK_STYLE_URL,
        "voyager" to DARK_STYLE_URL,
        "positron" to DARK_STYLE_URL,
    )

    private val DEFAULT_CENTERS = mapOf(
        "osm" to Pair(40.08789650218038, -8.869461715221407),
        "osm-classic" to Pair(40.08789650218038, -8.869461715221407),
        "voyager" to Pair(40.08789650218038, -8.869461715221407),
        "positron" to Pair(40.08789650218038, -8.869461715221407),
        "swisstopo" to Pair(46.8182, 8.2275),
        "swisstopo-sat" to Pair(46.8182, 8.2275),
    )

    fun getDefaultCenter(key: String?): Pair<Double, Double> =
        DEFAULT_CENTERS[key] ?: DEFAULT_CENTERS["osm-classic"]!!

    fun getStyleUrl(key: String?): String =
        STYLES[key] ?: STYLES["osm-classic"]!!

    fun getResolvedStyleUrl(key: String?, isDark: Boolean): String {
        if (isDark) {
            val darkUrl = DARK_STYLES[key ?: "osm-classic"]
            if (darkUrl != null) return darkUrl
        }
        return getStyleUrl(key)
    }
}
